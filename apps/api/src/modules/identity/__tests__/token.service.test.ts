// F1.5-AC12: erişim anahtarı doğrulaması (birim). Süresi dolmuş, yanlış imzalı, bilinmeyen `kid`li,
// yanlış türde (kayıt anahtarı) veya bozuk JWT → 401 UNAUTHENTICATED. Önceki anahtar (döndürme)
// yalnızca doğrular.
import { randomBytes } from 'node:crypto';
import { settingDefault, type SettingKey, type SettingValue } from '@b2b/shared';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../core/clock';
import { DomainError } from '../../../core/errors/domain-error';
import type { IdentityConfig } from '../identity.config';
import { TokenService } from '../token.service';

// Anahtarlar her çalıştırmada rastgele üretilir (depoda anahtar gibi görünen değer yok).
function randomSecret(): string {
  return randomBytes(32).toString('hex');
}

const TOTP_KEY = randomBytes(32);
const CURRENT = { id: 'k2', secret: randomSecret() };
const PREVIOUS = { id: 'k1', secret: randomSecret() };
const USER = '0190f1a2-0000-7000-8000-0000000000aa';
const SESSION = '0190f1a2-0000-7000-8000-0000000000bb';

const settings = {
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return Promise.resolve(settingDefault(key));
  },
};

function service(config: IdentityConfig, clock: FixedClock): TokenService {
  return new TokenService(config, settings, clock);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return 'OK';
}

describe('TokenService (F1.5-AC12)', () => {
  const clock = new FixedClock(new Date('2026-10-26T08:00:00.000Z'));
  const tokens = service(
    { otpHashKey: 'x', totpEncryptionKey: TOTP_KEY, jwt: { current: CURRENT, previous: PREVIOUS } },
    clock,
  );

  it('geçerli erişim anahtarı: sub ve sid döner; ömür 15 dk', async () => {
    const signed = await tokens.signAccess({ userId: USER, sessionId: SESSION });

    expect(signed.expiresIn).toBe(900);
    await expect(tokens.verifyAccess(signed.token)).resolves.toEqual({
      userId: USER,
      sessionId: SESSION,
    });
  });

  it('F1.5-AC12: süresi dolmuş JWT → UNAUTHENTICATED', async () => {
    const local = new FixedClock(clock.now());
    const svc = service(
      { otpHashKey: 'x', totpEncryptionKey: TOTP_KEY, jwt: { current: CURRENT } },
      local,
    );
    const { token } = await svc.signAccess({ userId: USER, sessionId: SESSION });

    local.advance(15 * 60 * 1000 - 1000);
    expect(await codeOf(svc.verifyAccess(token))).toBe('OK');
    local.advance(1000);
    expect(await codeOf(svc.verifyAccess(token))).toBe('UNAUTHENTICATED');
  });

  it('F1.5-AC12: yanlış imzalı JWT (aynı kid, başka anahtar) → UNAUTHENTICATED', async () => {
    const forger = service(
      {
        otpHashKey: 'x',
        totpEncryptionKey: TOTP_KEY,
        jwt: { current: { id: CURRENT.id, secret: randomSecret() } },
      },
      clock,
    );
    const { token } = await forger.signAccess({ userId: USER, sessionId: SESSION });

    expect(await codeOf(tokens.verifyAccess(token))).toBe('UNAUTHENTICATED');
  });

  it('F1.5-AC12: bilinmeyen kid → UNAUTHENTICATED', async () => {
    const other = service(
      {
        otpHashKey: 'x',
        totpEncryptionKey: TOTP_KEY,
        jwt: { current: { id: 'k9', secret: CURRENT.secret } },
      },
      clock,
    );
    const { token } = await other.signAccess({ userId: USER, sessionId: SESSION });

    expect(await codeOf(tokens.verifyAccess(token))).toBe('UNAUTHENTICATED');
  });

  it('döndürme: önceki anahtarla imzalanmış JWT kabul edilir; yeni JWT güncel anahtarla imzalanır', async () => {
    const old = service(
      { otpHashKey: 'x', totpEncryptionKey: TOTP_KEY, jwt: { current: PREVIOUS } },
      clock,
    );
    const { token } = await old.signAccess({ userId: USER, sessionId: SESSION });

    await expect(tokens.verifyAccess(token)).resolves.toMatchObject({ userId: USER });

    const withoutPrevious = service(
      { otpHashKey: 'x', totpEncryptionKey: TOTP_KEY, jwt: { current: CURRENT } },
      clock,
    );
    expect(await codeOf(withoutPrevious.verifyAccess(token))).toBe('UNAUTHENTICATED');
  });

  it('K2: kayıt anahtarı (pendingToken) erişim anahtarı olarak kabul edilmez', async () => {
    const pending = await tokens.signPendingRegistration('+994501234567');

    expect(await codeOf(tokens.verifyAccess(pending))).toBe('UNAUTHENTICATED');
    await expect(tokens.verifyPendingRegistration(pending)).resolves.toBe('+994501234567');
    const { token: access } = await tokens.signAccess({ userId: USER, sessionId: SESSION });
    expect(await codeOf(tokens.verifyPendingRegistration(access))).toBe('UNAUTHENTICATED');
  });

  it('F1.5-AC12: algoritma ve içerik hileleri → UNAUTHENTICATED', async () => {
    const key = new TextEncoder().encode(CURRENT.secret);
    const now = Math.floor(clock.now().getTime() / 1000);
    const noTyp = await new SignJWT({ sid: SESSION })
      .setProtectedHeader({ alg: 'HS256', kid: CURRENT.id })
      .setSubject(USER)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);
    const noExp = await new SignJWT({ typ: 'access', sid: SESSION })
      .setProtectedHeader({ alg: 'HS256', kid: CURRENT.id })
      .setSubject(USER)
      .setIssuedAt(now)
      .sign(key);
    const hs512 = await new SignJWT({ typ: 'access', sid: SESSION })
      .setProtectedHeader({ alg: 'HS512', kid: CURRENT.id })
      .setSubject(USER)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);
    const [header, payload] = noTyp.split('.');
    const unsigned = `${header ?? ''}.${payload ?? ''}.`;

    for (const token of [noTyp, noExp, hs512, unsigned, 'bozuk', '', 'a.b.c']) {
      expect(await codeOf(tokens.verifyAccess(token)), token).toBe('UNAUTHENTICATED');
    }
  });
});
