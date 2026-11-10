import { createApiClient } from '@b2b/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PushDevice, createPushRegistration } from '../push';
import { BASE } from './fake-server';

const TOKEN_A = 'ExponentPushToken[test-a]';
const TOKEN_B = 'ExponentPushToken[test-b]';
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

function setup(
  options: {
    projectId?: string | undefined;
    granted?: boolean;
    tokenError?: boolean;
    status?: number;
  } = {},
) {
  const posts: unknown[] = [];
  const fetch = vi.fn(async (request: Request) => {
    posts.push({ path: new URL(request.url).pathname, body: (await request.json()) as unknown });
    return new Response(null, { status: options.status ?? 204 });
  });
  let token = TOKEN_A;
  let changed: (() => void) | undefined;
  const removed = vi.fn();
  const ensurePermission = vi.fn(() => Promise.resolve(options.granted ?? true));
  const device: PushDevice = {
    platform: 'android',
    projectId: () => ('projectId' in options ? options.projectId : 'project-1'),
    ensurePermission,
    getExpoToken: vi.fn(() =>
      options.tokenError === true
        ? Promise.reject(new Error(`token hatası ${TOKEN_A}`))
        : Promise.resolve(token),
    ),
    onTokenChange: (listener) => {
      changed = listener;
      return { remove: removed };
    },
    onTap: () => ({ remove: vi.fn() }),
  };
  const registration = createPushRegistration(createApiClient({ baseUrl: BASE, fetch }), device);
  return {
    registration,
    ensurePermission,
    posts,
    removed,
    rotate(next: string) {
      token = next;
      changed?.();
    },
  };
}

describe('push anahtarı kaydı (F1.14-AC4)', () => {
  let spies: { mockRestore(): void }[] = [];
  beforeEach(() => {
    spies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
  });
  afterEach(() => {
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('F1.14-AC4: izin → Expo anahtarı → POST /api/v1/push-tokens', async () => {
    const t = setup();
    expect(await t.registration.start()).toBe('registered');
    expect(t.posts).toEqual([
      { path: '/api/v1/push-tokens', body: { token: TOKEN_A, platform: 'android' } },
    ]);
  });

  it('F1.14-AC4: anahtar değişince yeniden kaydedilir; aynı anahtar tekrar gönderilmez', async () => {
    const t = setup();
    await t.registration.start();
    await t.registration.start();
    expect(t.posts).toHaveLength(1);

    t.rotate(TOKEN_B);
    await vi.waitFor(() => {
      expect(t.posts).toHaveLength(2);
    });
    expect(t.posts[1]).toEqual({
      path: '/api/v1/push-tokens',
      body: { token: TOKEN_B, platform: 'android' },
    });
  });

  it('F1.14-AC4: izin verilmezse istek yok', async () => {
    const t = setup({ granted: false });
    expect(await t.registration.start()).toBe('denied');
    expect(t.posts).toEqual([]);
  });

  it('F1.14-AC4: projectId yok / Expo Go → kayıt atlanır, izin sorulmaz', async () => {
    const t = setup({ projectId: undefined });
    expect(await t.registration.start()).toBe('unavailable');
    expect(t.ensurePermission).not.toHaveBeenCalled();
    expect(t.posts).toEqual([]);
  });

  it('F1.14-AC4: anahtar alınamaz veya sunucu reddederse uygulama çökmez, hata fırlatılmaz', async () => {
    expect(await setup({ tokenError: true }).registration.start()).toBe('failed');
    expect(await setup({ status: 422 }).registration.start()).toBe('failed');
  });

  it('F1.14-AC4: çıkışta dinleyici kaldırılır', async () => {
    const t = setup();
    await t.registration.start();
    t.registration.stop();
    expect(t.removed).toHaveBeenCalledOnce();
  });
});
