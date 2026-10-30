// Mobil arayüz çevirileri (US-058, F1.14a). Mesajlar API'den gelir (`GET /api/v1/i18n/{lang}`,
// ETag); son sürüm cihazda saklanır (`i18n-cache.ts`), açılışta `If-None-Match` ile doğrulanır,
// ağ yoksa önbellek kullanılır. Eksik anahtar `az`'den (US-058 AC3).
import { createApiClient } from '@b2b/api-client';
import { createInstance, type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

export type FlatMessages = Readonly<Record<string, string>>;

export const FALLBACK_LANGUAGE = 'az';
/** Seçicide gösterilen diller (US-058 AC1). */
export const SUPPORTED_LANGUAGES = ['az', 'ru', 'tr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export interface CachedMessages {
  readonly etag: string;
  readonly values: FlatMessages;
}

/** Cihazdaki sözlük önbelleği; uygulamada `expo-file-system` (`i18n-cache.ts`). */
export interface MessageCache {
  read(lang: string): Promise<CachedMessages | undefined>;
  write(lang: string, entry: CachedMessages): Promise<void>;
}

export type LoadResult =
  { readonly status: 'ok'; readonly values: FlatMessages } | { readonly status: 'not_found' };

/**
 * Dil sözlüğünü yükler: önbellekteki sürüm `If-None-Match` ile doğrulanır, `304` → önbellek.
 * Etkin olmayan dil `404` → `not_found`. Ağ hatasında önbellek varsa o kullanılır.
 */
export function createMessageLoader(options: {
  readonly baseUrl: string;
  readonly cache: MessageCache;
  readonly fetch?: (input: Request) => Promise<Response>;
}) {
  const api = createApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  return async function load(lang: string): Promise<LoadResult> {
    const cached = await options.cache.read(lang);
    const request = api.GET('/api/v1/i18n/{lang}', {
      params: {
        path: { lang },
        header: cached === undefined ? {} : { 'If-None-Match': cached.etag },
      },
    });
    const result = await request.catch((failure: unknown) => {
      // Ağ hatası: cihazdaki son sürüm varsa o kullanılır.
      if (cached !== undefined) return undefined;
      throw failure;
    });
    if (result === undefined) return { status: 'ok', values: cached?.values ?? {} };
    const { data, response } = result;
    if (response.status === 304 && cached !== undefined) {
      return { status: 'ok', values: cached.values };
    }
    if (response.status === 404) return { status: 'not_found' };
    if (data === undefined) {
      if (cached !== undefined) return { status: 'ok', values: cached.values };
      throw new Error(`i18n: ${lang} yüklenemedi (${String(response.status)})`);
    }
    const etag = response.headers.get('ETag');
    if (etag !== null) await options.cache.write(lang, { etag, values: data });
    return { status: 'ok', values: data };
  };
}

export type MessageLoader = ReturnType<typeof createMessageLoader>;

/**
 * i18next örneği: düz anahtarlar (`auth.login.title`), API'deki ICU yer tutucusu `{phone}`,
 * eksik anahtar `az`.
 */
export async function createI18n(): Promise<I18n> {
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    lng: FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    resources: {},
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
    returnNull: false,
  });
  return instance;
}

/**
 * Dili yükleyip uygular. `az` dışındaki dilde `az` sözlüğü de yüklenir (eksik anahtar yedeği).
 * Dil yoksa (`404`) `false` döner, etkin dil değişmez.
 */
export async function applyLanguage(
  instance: Pick<I18n, 'addResourceBundle' | 'changeLanguage'>,
  load: MessageLoader,
  lang: string,
): Promise<boolean> {
  const [target, fallback] = await Promise.all([
    load(lang),
    lang === FALLBACK_LANGUAGE ? undefined : load(FALLBACK_LANGUAGE),
  ]);
  if (target.status !== 'ok') return false;
  if (fallback?.status === 'ok') {
    instance.addResourceBundle(FALLBACK_LANGUAGE, 'translation', fallback.values, true, true);
  }
  instance.addResourceBundle(lang, 'translation', target.values, true, true);
  await instance.changeLanguage(lang);
  return true;
}
