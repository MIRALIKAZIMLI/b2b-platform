import { describe, expect, it } from 'vitest';
import { createMessageLoader, toNested, withFallback } from '../i18n';

describe('i18n (F1.13a)', () => {
  it('US-058 AC3: eksik çeviri az ile gösterilir', () => {
    const az = { 'auth.login.title': 'Daxil ol', 'auth.login.verify': 'Təsdiqlə' };
    const ru = { 'auth.login.title': 'Вход' };
    expect(withFallback(ru, az)).toEqual({
      'auth.login.title': 'Вход',
      'auth.login.verify': 'Təsdiqlə',
    });
  });

  it('düz anahtarlar iç içe olur; çakışan metin anahtarı grubu ezmez', () => {
    expect(
      toNested({
        'auth.login.title': 'A',
        'errors.OTP_INVALID': 'B',
        auth: 'çakışma',
        'languages.az': 'C',
      }),
    ).toEqual({
      auth: { login: { title: 'A' } },
      errors: { OTP_INVALID: 'B' },
      languages: { az: 'C' },
    });
  });

  it('ETag: ikinci yüklemede If-None-Match gönderilir, 304 → önbellek; pasif dil 404 → not_found', async () => {
    const seen: (string | null)[] = [];
    const loader = createMessageLoader({
      baseUrl: 'http://api.test',
      fetch: (request) => {
        const lang = new URL(request.url).pathname.split('/').pop();
        seen.push(request.headers.get('If-None-Match'));
        if (lang === 'en') {
          return Promise.resolve(
            new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 }),
          );
        }
        if (request.headers.get('If-None-Match') === '"v1"') {
          return Promise.resolve(new Response(null, { status: 304, headers: { ETag: '"v1"' } }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ 'auth.login.title': 'Вход' }), {
            status: 200,
            headers: { ETag: '"v1"', 'Content-Type': 'application/json' },
          }),
        );
      },
    });

    expect(await loader('ru')).toEqual({ status: 'ok', values: { 'auth.login.title': 'Вход' } });
    expect(await loader('ru')).toEqual({ status: 'ok', values: { 'auth.login.title': 'Вход' } });
    expect(seen).toEqual([null, '"v1"']);
    expect(await loader('en')).toEqual({ status: 'not_found' });
  });
});
