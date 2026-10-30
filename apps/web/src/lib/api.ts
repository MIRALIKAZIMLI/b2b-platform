// Web API istemcisi (F1.13a). `packages/api-client` üstünde:
// - Erişim anahtarı yalnızca bellekte (coding-guidelines §9.6, TM-20); yenileme anahtarı httpOnly
//   cookie'de, JS göremez (ADR-0006 madde 3).
// - `401`'de tek sessiz yenileme; aynı anda gelen 401'ler aynı yenilemeyi bekler. Yenileme
//   başarısızsa oturum temizlenir ve `onSessionExpired` çağrılır (giriş ekranı) — F1.13-AC3.
// - Her istekte `X-Client: web`, `Accept-Language`, varsa `X-Business-Id`.
import { type ApiClient, createApiClient } from '@b2b/api-client';

type FetchFn = (input: Request) => Promise<Response>;

/** Web Locks API'nin kullanılan kısmı (`navigator.locks`). */
export interface RefreshLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Sekmeler arası tek yenileme kilidinin adı. */
export const REFRESH_LOCK_NAME = 'b2b-refresh';

function browserLocks(): RefreshLocks | undefined {
  const nav = (globalThis as { navigator?: { locks?: RefreshLocks } }).navigator;
  return nav?.locks;
}

export interface WebApiOptions {
  /** Tarayıcıda boş (aynı köken, Next rewrite); testte tam adres. */
  readonly baseUrl: string;
  readonly fetch?: FetchFn;
  readonly language: () => string;
  readonly businessId?: () => string | undefined;
  /** Yenileme başarısız: oturum bitti, giriş ekranına dön. */
  readonly onSessionExpired?: () => void;
  /** Sekmeler arası kilit; verilmezse `navigator.locks` (yoksa yalnız sekme içi tekillik). */
  readonly locks?: RefreshLocks;
}

export interface WebApi {
  readonly client: ApiClient;
  /** Giriş (`otp/verify`, `totp/verify`) veya yenileme sonrası erişim anahtarı. */
  setAccessToken(token: string | undefined): void;
  hasSession(): boolean;
  /** Cookie ile yeni erişim anahtarı alır; eşzamanlı çağrılar tek isteği paylaşır. */
  refresh(): Promise<boolean>;
  /** Sunucuda oturumu kapatır ve cookie'yi sildirir; bellekteki anahtar her durumda silinir. */
  logout(): Promise<void>;
}

/** Yenileme uygulanmayan uçlar: giriş ve yenilemenin kendisi (401 = yanlış kod / geçersiz cookie). */
const NO_RETRY_PATHS = ['/api/v1/auth/otp/', '/api/v1/auth/totp/', '/api/v1/auth/refresh'];

export function createWebApi(options: WebApiOptions): WebApi {
  const baseFetch: FetchFn = options.fetch ?? ((input) => globalThis.fetch(input));
  let accessToken: string | undefined;
  let refreshing: Promise<boolean> | undefined;

  // Yenileme ayrı istemciyle: Authorization taşımaz, 401 döngüsüne girmez.
  const authClient = createApiClient({
    baseUrl: options.baseUrl,
    fetch: baseFetch,
    language: options.language,
  });

  async function postRefresh(): Promise<boolean> {
    const { data } = await authClient.POST('/api/v1/auth/refresh', {
      params: { header: { 'X-Client': 'web', 'X-Requested-With': 'fetch' } },
      body: {},
    });
    accessToken = data?.accessToken;
    return accessToken !== undefined;
  }

  /**
   * Birden çok sekme aynı cookie ile aynı anda yenilerse ikincisi döndürülmüş anahtarı "yeniden
   * kullanmış" olur ve sunucu tüm aileyi iptal eder (ADR-0006 madde 2). Web Locks ile istekler
   * sekmeler arasında sıraya girer; sıradaki istek tarayıcının güncellediği yeni cookie'yi taşır.
   */
  function doRefresh(): Promise<boolean> {
    const locks = options.locks ?? browserLocks();
    return locks === undefined ? postRefresh() : locks.request(REFRESH_LOCK_NAME, postRefresh);
  }

  function refresh(): Promise<boolean> {
    // Ağ hatası oturumu bitirmez: hata çağırana gider, bellekteki anahtar kalır.
    refreshing ??= doRefresh().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  function expire(): void {
    accessToken = undefined;
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
    const renewed = accessToken !== sentToken && accessToken !== undefined ? true : await refresh();
    if (!renewed || accessToken === undefined) {
      expire();
      return response;
    }
    retry.headers.set('Authorization', `Bearer ${accessToken}`);
    const second = await baseFetch(retry);
    if (second.status === 401) expire();
    return second;
  }

  const client = createApiClient({
    baseUrl: options.baseUrl,
    fetch: fetchWithRefresh,
    accessToken: () => accessToken,
    language: options.language,
    ...(options.businessId === undefined ? {} : { businessId: options.businessId }),
  });
  client.use({
    onRequest({ request }) {
      request.headers.set('X-Client', 'web');
      return request;
    },
  });

  return {
    client,
    setAccessToken(token) {
      accessToken = token;
    },
    hasSession: () => accessToken !== undefined,
    refresh,
    async logout() {
      try {
        if (accessToken !== undefined) await client.POST('/api/v1/auth/logout');
      } finally {
        accessToken = undefined;
      }
    },
  };
}
