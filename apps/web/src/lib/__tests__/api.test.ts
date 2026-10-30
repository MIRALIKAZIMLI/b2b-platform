import { describe, expect, it, vi } from 'vitest';
import { createWebApi } from '../api';

const BASE = 'http://web.test';

interface Call {
  readonly path: string;
  readonly method: string;
  readonly headers: Headers;
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sahte API: geçerli erişim anahtarı `valid`; refresh her çağrıda `refreshResult` döner. */
function fakeApi(options: { refreshOk: boolean; delayMs?: number }) {
  const calls: Call[] = [];
  let valid = 'old';
  let issued = 0;
  const fetch = vi.fn(async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    calls.push({ path, method: request.method, headers: request.headers });
    if (path === '/api/v1/auth/refresh') {
      if (options.delayMs !== undefined) await new Promise((r) => setTimeout(r, options.delayMs));
      if (!options.refreshOk) return json(401, { code: 'UNAUTHENTICATED' });
      issued += 1;
      valid = `new-${String(issued)}`;
      return json(200, { accessToken: valid, expiresIn: 900 });
    }
    if (request.headers.get('Authorization') !== `Bearer ${valid}`) {
      return json(401, { code: 'UNAUTHENTICATED' });
    }
    return json(200, { id: 'u1' });
  });
  return {
    calls,
    fetch,
    expire() {
      valid = 'rotated-on-server';
    },
  };
}

function setup(options: { refreshOk: boolean; delayMs?: number }) {
  const server = fakeApi(options);
  const onSessionExpired = vi.fn();
  const api = createWebApi({
    baseUrl: BASE,
    fetch: server.fetch,
    language: () => 'ru',
    businessId: () => 'b-1',
    onSessionExpired,
  });
  api.setAccessToken('old');
  return { server, api, onSessionExpired };
}

describe('web api istemcisi (F1.13a)', () => {
  it('başlıklar: X-Client web, Accept-Language, X-Business-Id, Bearer', async () => {
    const { server, api } = setup({ refreshOk: true });
    await api.client.GET('/api/v1/me');
    const headers = server.calls[0]?.headers;
    expect(headers?.get('X-Client')).toBe('web');
    expect(headers?.get('Accept-Language')).toBe('ru');
    expect(headers?.get('X-Business-Id')).toBe('b-1');
    expect(headers?.get('Authorization')).toBe('Bearer old');
  });

  it('F1.13-AC3: erişim anahtarı süresi dolunca tek sessiz yenileme, istek yeni anahtarla tekrarlanır', async () => {
    const { server, api, onSessionExpired } = setup({ refreshOk: true });
    server.expire();

    const { data, response } = await api.client.GET('/api/v1/me');

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: 'u1' });
    expect(server.calls.map((c) => c.path)).toEqual([
      '/api/v1/me',
      '/api/v1/auth/refresh',
      '/api/v1/me',
    ]);
    const refreshCall = server.calls[1];
    expect(refreshCall?.headers.get('X-Requested-With')).toBe('fetch');
    expect(refreshCall?.headers.get('X-Client')).toBe('web');
    expect(refreshCall?.headers.get('Authorization')).toBeNull();
    expect(server.calls[2]?.headers.get('Authorization')).toBe('Bearer new-1');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("F1.13-AC3: eşzamanlı 401'ler tek yenilemeyi paylaşır", async () => {
    const { server, api } = setup({ refreshOk: true, delayMs: 10 });
    server.expire();

    const results = await Promise.all([
      api.client.GET('/api/v1/me'),
      api.client.GET('/api/v1/me'),
      api.client.GET('/api/v1/me'),
    ]);

    expect(results.map((r) => r.response.status)).toEqual([200, 200, 200]);
    expect(server.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('F1.13-AC3: yenileme başarısızsa oturum temizlenir ve giriş ekranına dönülür', async () => {
    const { server, api, onSessionExpired } = setup({ refreshOk: false });
    server.expire();

    const { response } = await api.client.GET('/api/v1/me');

    expect(response.status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(api.hasSession()).toBe(false);
    expect(server.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('giriş uçlarında 401 yenileme tetiklemez (yanlış kod)', async () => {
    const { server, api, onSessionExpired } = setup({ refreshOk: true });
    server.expire();

    const { response } = await api.client.POST('/api/v1/auth/totp/verify', {
      body: { pendingToken: 'p', code: '000000' },
    });

    expect(response.status).toBe(401);
    expect(server.calls.map((c) => c.path)).toEqual(['/api/v1/auth/totp/verify']);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('sayfa açılışında cookie ile oturum geri yüklenir; cookie yoksa oturum yok', async () => {
    const ok = setup({ refreshOk: true });
    ok.api.setAccessToken(undefined);
    expect(await ok.api.refresh()).toBe(true);
    expect(ok.api.hasSession()).toBe(true);

    const none = setup({ refreshOk: false });
    none.api.setAccessToken(undefined);
    expect(await none.api.refresh()).toBe(false);
    expect(none.api.hasSession()).toBe(false);
  });

  it('logout sunucuya gider ve bellekteki anahtarı siler', async () => {
    const { server, api } = setup({ refreshOk: true });
    await api.logout();
    expect(server.calls.map((c) => [c.method, c.path])).toEqual([['POST', '/api/v1/auth/logout']]);
    expect(api.hasSession()).toBe(false);
  });
});

/** Tarayıcı Web Locks davranışı: aynı adlı kilit istekleri sırayla çalışır. */
function fakeLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const names: string[] = [];
  return {
    names,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      names.push(name);
      const run = tail.then(callback, callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

/** Sunucu + tarayıcı cookie kavanozu: yenileme cookie'yi döndürür; eski cookie gelirse aile iptal. */
function rotatingServer() {
  let jar = 'rt-0';
  let current = 'rt-0';
  let familyRevoked = false;
  let n = 0;
  const fetch = async (): Promise<Response> => {
    const sent = jar; // tarayıcı cookie'yi istek anında ekler
    await new Promise((r) => setTimeout(r, 5));
    if (familyRevoked || sent !== current) {
      familyRevoked = true;
      return json(401, { code: 'REFRESH_TOKEN_REUSED' });
    }
    n += 1;
    current = `rt-${String(n)}`;
    jar = current;
    return json(200, { accessToken: `at-${String(n)}`, expiresIn: 900 });
  };
  return { fetch, revoked: () => familyRevoked };
}

describe('sekmeler arası yenileme (Müfettiş M1)', () => {
  it('iki sekme aynı anda yenilerse Web Locks ile istekler sıralanır, aile iptal olmaz', async () => {
    const server = rotatingServer();
    const locks = fakeLocks();
    const tab = () =>
      createWebApi({ baseUrl: BASE, fetch: server.fetch, language: () => 'az', locks });
    const [a, b] = [tab(), tab()];

    const results = await Promise.all([a.refresh(), b.refresh()]);

    expect(results).toEqual([true, true]);
    expect(server.revoked()).toBe(false);
    expect(locks.names).toEqual(['b2b-refresh', 'b2b-refresh']);
  });

  it('kilitsiz eşzamanlı yenileme aileyi iptal eder (kilidin neden gerektiğini gösterir)', async () => {
    const server = rotatingServer();
    const passthrough = { request: <T>(_: string, cb: () => Promise<T>) => cb() };
    const tab = () =>
      createWebApi({
        baseUrl: BASE,
        fetch: server.fetch,
        language: () => 'az',
        locks: passthrough,
      });

    const results = await Promise.all([tab().refresh(), tab().refresh()]);

    expect(results).toContain(false);
    expect(server.revoked()).toBe(true);
  });
});
