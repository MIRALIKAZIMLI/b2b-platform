import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// expo-secure-store yerel modüldür; Node'da sahtesiyle değiştirilir.
const secure = vi.hoisted(() => {
  const items = new Map<string, string>();
  return {
    items,
    getItemAsync: vi.fn((key: string) => Promise.resolve(items.get(key) ?? null)),
    setItemAsync: vi.fn((key: string, value: string) => {
      items.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: vi.fn((key: string) => {
      items.delete(key);
      return Promise.resolve();
    }),
  };
});
vi.mock('expo-secure-store', () => secure);

import { createMobileApi } from '../api';
import { REFRESH_TOKEN_KEY, createSecureRefreshTokenStore } from '../session';
import { BASE, fakeServer } from './fake-server';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

describe('session (güvenli depo)', () => {
  let spies: { mockRestore(): void }[] = [];

  beforeEach(() => {
    secure.items.clear();
    spies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
  });
  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
  });

  function setup(refresh: 'ok' | 'reused') {
    const server = fakeServer({ refresh });
    const api = createMobileApi({
      baseUrl: BASE,
      fetch: server.fetch,
      language: () => 'az',
      store: createSecureRefreshTokenStore(),
    });
    return { server, api };
  }

  it('F1.14-AC2: yenileme anahtarı yalnızca güvenli depoya yazılır, dönen yeni anahtar da', async () => {
    const { server, api } = setup('ok');
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    expect(secure.setItemAsync).toHaveBeenLastCalledWith(REFRESH_TOKEN_KEY, 'refresh-0');

    server.expireAccess();
    await api.client.GET('/api/v1/me');
    expect(secure.items.get(REFRESH_TOKEN_KEY)).toBe('refresh-1');
    expect([...secure.items.keys()]).toEqual([REFRESH_TOKEN_KEY]);
  });

  it('F1.14-AC2: çıkışta güvenli depodan silinir', async () => {
    const { api } = setup('ok');
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    await api.logout();
    expect(secure.deleteItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
    expect(secure.items.has(REFRESH_TOKEN_KEY)).toBe(false);
  });

  it('F1.14-AC2: yeniden kullanım tespitinde (401) anahtar güvenli depodan silinir', async () => {
    const { server, api } = setup('reused');
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.expireAccess();
    await api.client.GET('/api/v1/me');
    expect(secure.items.has(REFRESH_TOKEN_KEY)).toBe(false);
  });

  it('F1.14-AC2: anahtar loga yazılmaz (console hiç çağrılmaz)', async () => {
    const { server, api } = setup('ok');
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.expireAccess();
    await api.client.GET('/api/v1/me');
    await api.logout();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('F1.14-AC2: yenileme hatasının mesajı anahtarı içermez', async () => {
    const server = fakeServer({ refresh: 'ok' });
    server.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    const api = createMobileApi({
      baseUrl: BASE,
      fetch: server.fetch,
      language: () => 'az',
      store: createSecureRefreshTokenStore(),
    });
    secure.items.set(REFRESH_TOKEN_KEY, 'refresh-9');
    const failure: unknown = await api.refresh().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain('refresh-9');
  });

  it('F1.14-AC2: AsyncStorage bağımlılığı yok', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => n.includes('async-storage'))).toEqual([]);
  });
});
