// Testler için sahte API: geçerli erişim anahtarı `valid`, yenileme anahtarı döndürülür.
import { vi } from 'vitest';
import type { RefreshTokenStore } from '../api';

export const BASE = 'http://mobile.test';

export function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export interface Call {
  readonly path: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string;
}

export function fakeServer(options: { refresh: 'ok' | 'reused' | 'error'; delayMs?: number }) {
  const calls: Call[] = [];
  let valid = 'access-0';
  let currentRefresh = 'refresh-0';
  let issued = 0;
  const fetch = vi.fn(async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const body = await request.clone().text();
    calls.push({ path, method: request.method, headers: request.headers, body });
    if (path === '/api/v1/auth/refresh') {
      if (options.delayMs !== undefined) await new Promise((r) => setTimeout(r, options.delayMs));
      if (options.refresh === 'error') return json(503, { code: 'SERVICE_UNAVAILABLE' });
      const sent = (JSON.parse(body) as { refreshToken?: string }).refreshToken;
      if (options.refresh === 'reused' || sent !== currentRefresh) {
        return json(401, { code: 'REFRESH_TOKEN_REUSED' });
      }
      issued += 1;
      valid = `access-${String(issued)}`;
      currentRefresh = `refresh-${String(issued)}`;
      return json(200, { accessToken: valid, expiresIn: 900, refreshToken: currentRefresh });
    }
    if (path === '/api/v1/auth/logout') return new Response(null, { status: 204 });
    if (request.headers.get('Authorization') !== `Bearer ${valid}`) {
      return json(401, { code: 'UNAUTHENTICATED' });
    }
    return json(200, { id: 'u1' });
  });
  return {
    calls,
    fetch,
    /** Erişim anahtarının süresi doldu. */
    expireAccess() {
      valid = 'rotated-on-server';
    },
  };
}

/** Bellekteki sahte güvenli depo. */
export function memoryStore(initial?: string): RefreshTokenStore & { value: string | undefined } {
  const store = {
    value: initial,
    read: vi.fn(() => Promise.resolve(store.value)),
    write: vi.fn((token: string) => {
      store.value = token;
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      store.value = undefined;
      return Promise.resolve();
    }),
  };
  return store;
}
