// Arayüz çevirileri (US-058, F1.13a). Mesajlar API'den gelir (`GET /api/v1/i18n/{lang}`, ETag).
// Bu dosyadaki saf fonksiyonlar birim testlidir; sunucu yükleyicisi `src/i18n/request.ts`'te.
import { createApiClient } from '@b2b/api-client';

export type FlatMessages = Readonly<Record<string, string>>;
export interface NestedMessages {
  [key: string]: string | NestedMessages;
}

export const FALLBACK_LOCALE = 'az';

/**
 * Eksik anahtar `az` değeriyle doldurulur (US-058 AC3). API de doldurur; bu ikinci savunma
 * (ör. dilin sözlüğü eski önbellekten geldiyse).
 */
export function withFallback(messages: FlatMessages, fallback: FlatMessages): FlatMessages {
  return { ...fallback, ...messages };
}

/**
 * `auth.login.title` biçimindeki düz anahtarları next-intl'in iç içe biçimine çevirir. Bir anahtar
 * hem metin hem grup olamaz (ör. `a` ve `a.b`); çakışan metin anahtarı atlanır, grup kalır.
 */
export function toNested(messages: FlatMessages): NestedMessages {
  const root: NestedMessages = {};
  const keys = Object.keys(messages).sort((a, b) => b.split('.').length - a.split('.').length);
  for (const key of keys) {
    const parts = key.split('.');
    const leaf = parts.pop();
    if (leaf === undefined || leaf === '') continue;
    let node: NestedMessages | undefined = root;
    for (const part of parts) {
      const next: string | NestedMessages | undefined = node[part];
      if (typeof next === 'string') {
        node = undefined;
        break;
      }
      node = next ?? (node[part] = {});
    }
    if (node === undefined || typeof node[leaf] === 'object') continue;
    node[leaf] = messages[key] ?? '';
  }
  return root;
}

interface CacheEntry {
  readonly etag: string;
  readonly values: FlatMessages;
}

export type LoadResult =
  { readonly status: 'ok'; readonly values: FlatMessages } | { readonly status: 'not_found' };

/**
 * Dil sözlüğünü ETag ile yükler: önbellekteki sürüm `If-None-Match` ile doğrulanır, `304` → önbellek.
 * Etkin olmayan dil `404` → `not_found`. Ağ hatasında önbellek varsa o kullanılır.
 */
export function createMessageLoader(options: {
  readonly baseUrl: string;
  readonly fetch?: (input: Request) => Promise<Response>;
}) {
  const api = createApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const cache = new Map<string, CacheEntry>();

  return async function load(lang: string): Promise<LoadResult> {
    const cached = cache.get(lang);
    const { data, response } = await api.GET('/api/v1/i18n/{lang}', {
      params: {
        path: { lang },
        header: cached === undefined ? {} : { 'If-None-Match': cached.etag },
      },
    });
    if (response.status === 304 && cached !== undefined)
      return { status: 'ok', values: cached.values };
    if (response.status === 404) {
      cache.delete(lang);
      return { status: 'not_found' };
    }
    if (data === undefined)
      throw new Error(`i18n: ${lang} yüklenemedi (${String(response.status)})`);
    const etag = response.headers.get('ETag');
    if (etag !== null) cache.set(lang, { etag, values: data });
    return { status: 'ok', values: data };
  };
}
