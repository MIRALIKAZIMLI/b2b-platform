import { describe, expect, it } from 'vitest';
import {
  clearRefreshCookieHeader,
  deliverRefreshToken,
  hasRequestedWith,
  isWebClient,
  readRefreshCookie,
  refreshCookieHeader,
} from '../refresh-cookie';

const TOKEN = 'a'.repeat(43);

function fakeReply() {
  const headers: [string, string][] = [];
  return {
    headers,
    header(name: string, value: string) {
      headers.push([name, value]);
      return this;
    },
  };
}

describe('refresh-cookie (F1.13a)', () => {
  it('F1.13-AC1: cookie bayrakları HttpOnly, Secure, SameSite=Strict, Path=/api/v1/auth; Domain yok', () => {
    expect(refreshCookieHeader(TOKEN, 2_592_000)).toBe(
      `b2b_rt=${TOKEN}; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000`,
    );
    expect(clearRefreshCookieHeader()).toBe(
      'b2b_rt=; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=0',
    );
  });

  it('biçimsiz anahtar cookie başlığına yazılmaz (başlık enjeksiyonu yok)', () => {
    expect(() => refreshCookieHeader('a; Domain=evil', 10)).toThrow();
  });

  it('Cookie başlığından yalnızca b2b_rt okunur; biçimsiz değer yok sayılır', () => {
    expect(readRefreshCookie(undefined)).toBeUndefined();
    expect(readRefreshCookie(`x=1; b2b_rt=${TOKEN}; y=2`)).toBe(TOKEN);
    expect(readRefreshCookie('xb2b_rt=abc')).toBeUndefined();
    expect(readRefreshCookie('b2b_rt=a b')).toBeUndefined();
    expect(readRefreshCookie('b2b_rt=')).toBeUndefined();
  });

  it('istemci ve CSRF başlıkları', () => {
    expect(isWebClient('web')).toBe(true);
    expect(isWebClient(' Web ')).toBe(true);
    expect(isWebClient('mobile')).toBe(false);
    expect(isWebClient(undefined)).toBe(false);
    expect(hasRequestedWith('fetch')).toBe(true);
    expect(hasRequestedWith('  ')).toBe(false);
    expect(hasRequestedWith(undefined)).toBe(false);
  });

  it('web yanıtında anahtar gövdeden çıkar ve cookie olur; mobilde ve anahtarsız yanıtta değişmez', () => {
    const reply = fakeReply();
    const body = { accessToken: 'x', expiresIn: 900, refreshToken: TOKEN };
    expect(deliverRefreshToken(body, true, reply, 60)).toEqual({
      accessToken: 'x',
      expiresIn: 900,
    });
    expect(reply.headers).toEqual([['Set-Cookie', refreshCookieHeader(TOKEN, 60)]]);

    const mobile = fakeReply();
    expect(deliverRefreshToken(body, false, mobile, 60)).toBe(body);
    expect(mobile.headers).toEqual([]);

    const pending = { nextStep: 'totp', pendingToken: 'p' };
    const none = fakeReply();
    expect(deliverRefreshToken(pending, true, none, 60)).toBe(pending);
    expect(none.headers).toEqual([]);
  });
});
