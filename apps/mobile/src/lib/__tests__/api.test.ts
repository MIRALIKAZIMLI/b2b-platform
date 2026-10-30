import { describe, expect, it, vi } from 'vitest';
import { createMobileApi } from '../api';
import { BASE, fakeServer, memoryStore } from './fake-server';

function setup(options: Parameters<typeof fakeServer>[0]) {
  const server = fakeServer(options);
  const store = memoryStore();
  const onSessionExpired = vi.fn();
  const api = createMobileApi({
    baseUrl: BASE,
    fetch: server.fetch,
    language: () => 'ru',
    businessId: () => 'b-1',
    store,
    onSessionExpired,
  });
  return { server, store, api, onSessionExpired };
}

describe('mobil API istemcisi', () => {
  it('F1.14-AC3: erişim anahtarı süresi dolunca tek sessiz yenileme, istek tekrarlanır', async () => {
    const { server, store, api, onSessionExpired } = setup({ refresh: 'ok' });
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.expireAccess();

    const { data, response } = await api.client.GET('/api/v1/me');

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: 'u1' });
    const refreshes = server.calls.filter((c) => c.path === '/api/v1/auth/refresh');
    expect(refreshes).toHaveLength(1);
    // Mobil: anahtar gövdede gider, X-Client gönderilmez (F1.13a).
    expect(JSON.parse(refreshes[0]?.body ?? '{}')).toEqual({ refreshToken: 'refresh-0' });
    expect(refreshes[0]?.headers.get('X-Client')).toBeNull();
    expect(store.value).toBe('refresh-1');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('F1.14-AC3: aynı anda gelen 401’ler tek yenilemeyi paylaşır', async () => {
    const { server, api } = setup({ refresh: 'ok', delayMs: 10 });
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.expireAccess();

    const results = await Promise.all([
      api.client.GET('/api/v1/me'),
      api.client.GET('/api/v1/me'),
      api.client.GET('/api/v1/me'),
    ]);

    expect(results.map((r) => r.response.status)).toEqual([200, 200, 200]);
    expect(server.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('F1.14-AC3: yenileme reddedilirse (aile iptali) anahtar silinir ve giriş ekranına dönülür', async () => {
    const { server, store, api, onSessionExpired } = setup({ refresh: 'reused' });
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.expireAccess();

    const { response } = await api.client.GET('/api/v1/me');

    expect(response.status).toBe(401);
    expect(server.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1);
    expect(store.value).toBeUndefined();
    expect(api.hasSession()).toBe(false);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('F1.14-AC3: sunucu hatasında (5xx) oturum kapanmaz, anahtar kalır', async () => {
    const { server, store, api, onSessionExpired } = setup({ refresh: 'error' });
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.expireAccess();

    const { response } = await api.client.GET('/api/v1/me');

    expect(response.status).toBe(401);
    expect(store.value).toBe('refresh-0');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('F1.14-AC3: giriş uçlarında 401 yenileme başlatmaz', async () => {
    const { server, api } = setup({ refresh: 'ok' });
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.fetch.mockResolvedValueOnce(new Response('{"code":"OTP_INVALID"}', { status: 401 }));

    await api.client.POST('/api/v1/auth/otp/verify', {
      body: { challengeId: '00000000-0000-0000-0000-000000000000', code: '000000' },
    });

    expect(server.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(0);
  });

  it('açılışta güvenli depodaki anahtarla oturum geri alınır; anahtar yoksa istek atılmaz', async () => {
    const { server, store, api } = setup({ refresh: 'ok' });
    expect(await api.refresh()).toBe(false);
    expect(server.calls).toHaveLength(0);

    store.value = 'refresh-0';
    expect(await api.refresh()).toBe(true);
    expect(api.hasSession()).toBe(true);
    expect(store.value).toBe('refresh-1');
  });

  it('her istekte Accept-Language ve X-Business-Id gider', async () => {
    const { server, api } = setup({ refresh: 'ok' });
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    await api.client.GET('/api/v1/me');
    const call = server.calls.at(-1);
    expect(call?.headers.get('Accept-Language')).toBe('ru');
    expect(call?.headers.get('X-Business-Id')).toBe('b-1');
    expect(call?.headers.get('Authorization')).toBe('Bearer access-0');
  });

  it('F1.14-AC2: çıkışta anahtar güvenli depodan silinir (sunucu hatasında da)', async () => {
    const { server, store, api } = setup({ refresh: 'ok' });
    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    await api.logout();
    expect(server.calls.at(-1)?.path).toBe('/api/v1/auth/logout');
    expect(store.value).toBeUndefined();
    expect(api.hasSession()).toBe(false);

    await api.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0' });
    server.fetch.mockRejectedValueOnce(new TypeError('network'));
    await expect(api.logout()).rejects.toThrow('network');
    expect(store.value).toBeUndefined();
    expect(api.hasSession()).toBe(false);
  });
});
