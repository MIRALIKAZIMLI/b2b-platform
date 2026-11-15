// F2.17 (US-027 AC3, Mimar notu 2): giriş ve yenileme bağlantısız hesap kancasını çağırır; kanca
// hatası girişi/yenilemeyi asla düşürmez (yutulur, kişisel verisiz loglanır).
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../../core/clock';
import type { LoginActivityHook } from '../login-activity.hook';
import { SessionService } from '../session.service';

const NOW = new Date('2026-11-20T08:00:00Z');

function setup(hook: LoginActivityHook) {
  const userId = randomUUID();
  const sessions = {
    open: vi.fn(() => Promise.resolve()),
    rotate: vi.fn(() =>
      Promise.resolve({ result: 'rotated' as const, userId, sessionId: randomUUID() }),
    ),
  };
  const tokens = {
    signAccess: vi.fn(() => Promise.resolve({ token: 'access', expiresIn: 900 })),
  };
  const settings = { get: vi.fn(() => Promise.resolve(30)) };
  const ids = { next: vi.fn(() => randomUUID()) };
  const log = { warn: vi.fn() };
  const service = new SessionService(
    {} as never,
    sessions as never,
    tokens as never,
    settings as never,
    { record: vi.fn() },
    new FixedClock(NOW),
    ids,
    {} as never,
    hook,
    log,
  );
  return { service, userId, log };
}

describe('F2.17 giriş etkinliği kancası', () => {
  it('US-027-AC3 oturum açılınca ve yenilenince kanca kullanıcı ve şimdiki anla çağrılır', async () => {
    const onActivity = vi.fn(() => Promise.resolve());
    const { service, userId } = setup({ onActivity });
    await service.openSession(userId);
    await service.refresh('a'.repeat(43));
    expect(onActivity).toHaveBeenNthCalledWith(1, userId, NOW);
    expect(onActivity).toHaveBeenNthCalledWith(2, userId, NOW);
  });

  it('F2.17 Mimar notu 2: kanca hatası girişi ve yenilemeyi düşürmez, yalnız loglanır', async () => {
    const onActivity = vi.fn(() => Promise.reject(new TypeError('db down')));
    const { service, userId, log } = setup({ onActivity });
    await expect(service.openSession(userId)).resolves.toMatchObject({ nextStep: 'none' });
    await expect(service.refresh('a'.repeat(43))).resolves.toMatchObject({
      accessToken: 'access',
    });
    expect(log.warn).toHaveBeenCalledWith(
      { event: 'identity.login_activity_failed', errorName: 'TypeError' },
      'giriş etkinliği kancası başarısız',
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(userId);
  });
});
