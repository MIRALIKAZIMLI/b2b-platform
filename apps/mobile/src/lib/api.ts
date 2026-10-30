// Mobil API istemcisi (F1.14a). `packages/api-client` üstünde:
// - Erişim anahtarı yalnızca bellekte; yenileme anahtarı cihazın güvenli deposunda
//   (`RefreshTokenStore`, ADR-0006 madde 3, TM-04). Mobil `X-Client` göndermez: anahtar gövdede
//   gelir ve gövdeyle yenilenir (F1.13a).
// - `401`'de tek sessiz yenileme; aynı anda gelen 401'ler aynı yenilemeyi bekler. Yenileme
//   reddedilirse (`401`, ör. `REFRESH_TOKEN_REUSED` aile iptali) anahtar silinir ve
//   `onSessionExpired` çağrılır (giriş ekranı) — F1.14-AC3.
// - Her istekte `Accept-Language`, varsa `X-Business-Id`.
// Anahtarlar hiçbir log veya hata mesajına yazılmaz (AGENTS.md kural 11).
import { type ApiClient, createApiClient } from '@b2b/api-client';

type FetchFn = (input: Request) => Promise<Response>;

/** Yenileme anahtarının saklandığı yer; uygulamada `expo-secure-store` (`session.ts`). */
export interface RefreshTokenStore {
  read(): Promise<string | undefined>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface MobileApiOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchFn;
  readonly language: () => string;
  readonly businessId?: () => string | undefined;
  readonly store: RefreshTokenStore;
  /** Oturum bitti (yenileme reddedildi): giriş ekranına dön. */
  readonly onSessionExpired?: () => void;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken?: string;
}

export interface MobileApi {
  readonly client: ApiClient;
  /** Giriş (`otp/verify`, `totp/verify`) sonrası: yenileme anahtarı güvenli depoya, erişim belleğe. */
  startSession(tokens: TokenPair): Promise<void>;
  hasSession(): boolean;
  /**
   * Güvenli depodaki anahtarla yeni erişim anahtarı alır; eşzamanlı çağrılar tek isteği paylaşır.
   * `false`: anahtar yok veya sunucu reddetti (anahtar silindi). Ağ hatası fırlatılır, anahtar kalır.
   */
  refresh(): Promise<boolean>;
  /** Sunucuda oturumu kapatır; güvenli depodaki ve bellekteki anahtar her durumda silinir. */
  logout(): Promise<void>;
}

/** Yenileme uygulanmayan uçlar: giriş ve yenilemenin kendisi (401 = yanlış kod / geçersiz anahtar). */
const NO_RETRY_PATHS = ['/api/v1/auth/otp/', '/api/v1/auth/totp/', '/api/v1/auth/refresh'];

/** Sunucu yenilemeyi reddetti; anahtar artık geçersiz. */
const REJECTED_STATUSES = new Set([400, 401, 403]);

export function createMobileApi(options: MobileApiOptions): MobileApi {
  const baseFetch: FetchFn = options.fetch ?? ((input) => globalThis.fetch(input));
  const { store } = options;
  let accessToken: string | undefined;
  let refreshing: Promise<boolean> | undefined;

  // Yenileme ayrı istemciyle: Authorization taşımaz, 401 döngüsüne girmez.
  const authClient = createApiClient({
    baseUrl: options.baseUrl,
    fetch: baseFetch,
    language: options.language,
  });

  async function postRefresh(): Promise<boolean> {
    const refreshToken = await store.read();
    if (refreshToken === undefined) return false;
    const { data, response } = await authClient.POST('/api/v1/auth/refresh', {
      body: { refreshToken },
    });
    if (data?.refreshToken !== undefined) {
      // Döndürülen anahtar önce depoya; eskisi artık tek kullanımlık olarak tüketildi.
      await store.write(data.refreshToken);
      accessToken = data.accessToken;
      return true;
    }
    if (REJECTED_STATUSES.has(response.status) || data !== undefined) {
      accessToken = undefined;
      await store.clear();
      return false;
    }
    // 5xx vb.: oturum bitmiş sayılmaz, anahtar kalır.
    throw new Error(`auth/refresh: ${String(response.status)}`);
  }

  function refresh(): Promise<boolean> {
    refreshing ??= postRefresh().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  async function expire(): Promise<void> {
    accessToken = undefined;
    await store.clear();
    options.onSessionExpired?.();
  }

  async function fetchWithRefresh(request: Request): Promise<Response> {
    const retry = request.clone();
    const sentToken = accessToken;
    const response = await baseFetch(request);
    const path = new URL(request.url).pathname;
    if (response.status !== 401 || sentToken === undefined) return response;
    if (NO_RETRY_PATHS.some((prefix) => path.startsWith(prefix))) return response;

    // Başka bir istek bu arada yenilediyse yeni anahtarla tekrar dene; değilse bir kez yenile.
    let renewed: boolean;
    if (accessToken !== sentToken && accessToken !== undefined) {
      renewed = true;
    } else {
      try {
        renewed = await refresh();
      } catch {
        // Ağ hatası: oturum kapanmaz, ilk yanıt döner; sonraki istek yeniden dener.
        return response;
      }
    }
    if (!renewed || accessToken === undefined) {
      await expire();
      return response;
    }
    retry.headers.set('Authorization', `Bearer ${accessToken}`);
    const second = await baseFetch(retry);
    if (second.status === 401) await expire();
    return second;
  }

  const client = createApiClient({
    baseUrl: options.baseUrl,
    fetch: fetchWithRefresh,
    accessToken: () => accessToken,
    language: options.language,
    ...(options.businessId === undefined ? {} : { businessId: options.businessId }),
  });

  return {
    client,
    async startSession(tokens) {
      if (tokens.refreshToken !== undefined) await store.write(tokens.refreshToken);
      accessToken = tokens.accessToken;
    },
    hasSession: () => accessToken !== undefined,
    refresh,
    async logout() {
      try {
        // Ağ hatası çağırana gider; yerel çıkış yine de yapılır.
        if (accessToken !== undefined) await client.POST('/api/v1/auth/logout');
      } finally {
        accessToken = undefined;
        await store.clear();
      }
    },
  };
}
