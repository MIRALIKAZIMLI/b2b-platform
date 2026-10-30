import { describe, expect, it, vi } from 'vitest';
import { type CachedMessages, applyLanguage, createI18n, createMessageLoader } from '../i18n';

const BASE = 'http://mobile.test';

function memoryCache() {
  const items = new Map<string, CachedMessages>();
  return {
    items,
    read: vi.fn((lang: string) => Promise.resolve(items.get(lang))),
    write: vi.fn((lang: string, entry: CachedMessages) => {
      items.set(lang, entry);
      return Promise.resolve();
    }),
  };
}

const DICTS: Record<string, Record<string, string>> = {
  az: { 'auth.login.title': 'Daxil ol', 'auth.login.code_sent': '{phone} kod', 'only.az': 'AZ' },
  ru: { 'auth.login.title': 'Вход', 'auth.login.code_sent': '{phone} код' },
};

function respond(request: Request): Response {
  const lang = new URL(request.url).pathname.split('/').at(-1) ?? '';
  const dict = DICTS[lang];
  if (dict === undefined) return new Response('{"code":"NOT_FOUND"}', { status: 404 });
  const etag = `"${lang}-v1"`;
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304 });
  return new Response(JSON.stringify(dict), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ETag: etag },
  });
}

function server(options: { offline?: boolean } = {}) {
  return vi.fn((request: Request): Promise<Response> =>
    options.offline === true
      ? Promise.reject(new TypeError('network'))
      : Promise.resolve(respond(request)),
  );
}

describe('mobil çeviriler', () => {
  it('US-058: sözlük önbelleğe yazılır, sonraki açılışta 304 ile önbellek kullanılır', async () => {
    const cache = memoryCache();
    const fetch = server();
    const load = createMessageLoader({ baseUrl: BASE, cache, fetch });
    expect(await load('ru')).toEqual({ status: 'ok', values: DICTS.ru });
    expect(cache.items.get('ru')?.etag).toBe('"ru-v1"');

    expect(await load('ru')).toEqual({ status: 'ok', values: DICTS.ru });
    expect(fetch.mock.calls.at(-1)?.[0].headers.get('If-None-Match')).toBe('"ru-v1"');
  });

  it('US-058: ağ yoksa cihazdaki son sürüm kullanılır', async () => {
    const cache = memoryCache();
    cache.items.set('ru', { etag: '"ru-v1"', values: DICTS.ru ?? {} });
    const load = createMessageLoader({ baseUrl: BASE, cache, fetch: server({ offline: true }) });
    expect(await load('ru')).toEqual({ status: 'ok', values: DICTS.ru });
  });

  it('US-058 AC1: dil uygulanır; eksik anahtar az, yer tutucu {phone}', async () => {
    const i18n = await createI18n();
    const load = createMessageLoader({ baseUrl: BASE, cache: memoryCache(), fetch: server() });
    expect(await applyLanguage(i18n, load, 'ru')).toBe(true);
    expect(i18n.language).toBe('ru');
    expect(i18n.t('auth.login.title')).toBe('Вход');
    expect(i18n.t('auth.login.code_sent', { phone: '+994' })).toBe('+994 код');
    expect(i18n.t('only.az')).toBe('AZ');
  });

  it('US-058: etkin olmayan dil (404) uygulanmaz', async () => {
    const i18n = await createI18n();
    const load = createMessageLoader({ baseUrl: BASE, cache: memoryCache(), fetch: server() });
    expect(await applyLanguage(i18n, load, 'en')).toBe(false);
    expect(i18n.language).toBe('az');
  });
});
