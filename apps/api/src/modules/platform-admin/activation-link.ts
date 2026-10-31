// Toptancı aktivasyon bağlantısı (F2.1a): `WEB_BASE_URL/<dil>/activate?token=<token>`. Sayfa
// F2.1b'de. Bağlantı yalnızca SMS gövdesinde bulunur; loglanmaz, yanıtta dönmez.
export const WEB_BASE_URL = Symbol('WEB_BASE_URL');

/** Web'in yönlendirdiği diller (`[locale]` az/ru/tr); başka dil → `az`. */
const WEB_LOCALES: ReadonlySet<string> = new Set(['az', 'ru', 'tr']);

export function activationLink(baseUrl: string, language: string | null, token: string): string {
  const locale = language !== null && WEB_LOCALES.has(language) ? language : 'az';
  return `${baseUrl}/${locale}/activate?token=${encodeURIComponent(token)}`;
}
