import { createApiClient } from '@b2b/api-client';
import { describe, expect, it, vi } from 'vitest';
import { createLoginFlow } from '../login-flow';

const BASE = 'http://mobile.test';
const CHALLENGE = '11111111-1111-1111-1111-111111111111';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sahte kimlik uçları; mock SMS kodu `123456`, TOTP kodu `654321`. */
function setup(nextStep: 'none' | 'totp' | 'totp_setup' | 'register' = 'none') {
  const bodies: Record<string, unknown> = {};
  const fetch = vi.fn(async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const body =
      request.method === 'POST' ? ((await request.json()) as Record<string, unknown>) : {};
    bodies[path] = body;
    switch (path) {
      case '/api/v1/auth/otp/request':
        return json(202, { challengeId: CHALLENGE, expiresIn: 300, resendAfter: 60 });
      case '/api/v1/auth/otp/verify':
        if (body.code !== '123456') return json(400, { code: 'OTP_INVALID' });
        if (nextStep === 'none') {
          return json(200, {
            nextStep: 'none',
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
            expiresIn: 900,
            memberships: [],
          });
        }
        return json(200, { nextStep, pendingToken: 'pending-1', memberships: [] });
      case '/api/v1/auth/totp/setup':
        if (request.headers.get('Authorization') !== 'Bearer pending-1') {
          return json(401, { code: 'UNAUTHENTICATED' });
        }
        return body.confirmCode === undefined
          ? json(200, { otpauthUri: 'otpauth://totp/B2B:x?secret=ABC' })
          : json(200, { recoveryCodes: ['r1', 'r2'] });
      case '/api/v1/auth/totp/verify':
        if (body.code !== '654321') return json(400, { code: 'TOTP_INVALID' });
        return json(200, {
          nextStep: 'none',
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          expiresIn: 900,
          memberships: [],
        });
      default:
        return json(404, { code: 'NOT_FOUND' });
    }
  });
  const flow = createLoginFlow({
    client: createApiClient({ baseUrl: BASE, fetch }),
    device: { type: 'android' },
  });
  return { flow, bodies };
}

describe('mobil giriş akışı', () => {
  it('F1.14-AC1: mock SMS koduyla giriş: telefon → kod → oturum anahtarları', async () => {
    const { flow, bodies } = setup('none');

    const first = await flow.requestCode(' +994501234567 ');
    expect(first).toEqual({ kind: 'step', step: { kind: 'code', challengeId: CHALLENGE } });
    expect(bodies['/api/v1/auth/otp/request']).toEqual({
      phone: '+994501234567',
      purpose: 'login',
    });

    const second = await flow.verifyCode(CHALLENGE, '123456');
    expect(second).toEqual({
      kind: 'signed_in',
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    });
    expect(bodies['/api/v1/auth/otp/verify']).toMatchObject({ device: { type: 'android' } });
  });

  it('F1.14-AC1: yanlış kod hata kodu döner', async () => {
    const { flow } = setup('none');
    expect(await flow.verifyCode(CHALLENGE, '000000')).toEqual({
      kind: 'error',
      code: 'OTP_INVALID',
    });
  });

  it('F1.14-AC1: TOTP gereken kullanıcı: kod → TOTP → oturum', async () => {
    const { flow } = setup('totp');
    const step = await flow.verifyCode(CHALLENGE, '123456');
    expect(step).toEqual({ kind: 'step', step: { kind: 'totp', pendingToken: 'pending-1' } });
    expect(await flow.verifyTotp('pending-1', '654321')).toEqual({
      kind: 'signed_in',
      tokens: { accessToken: 'access-2', refreshToken: 'refresh-2' },
    });
  });

  it('F1.14-AC1: TOTP kurulumu: anahtar → onay → kurtarma kodları', async () => {
    const { flow } = setup('totp_setup');
    expect(await flow.verifyCode(CHALLENGE, '123456')).toEqual({
      kind: 'step',
      step: {
        kind: 'totp_setup',
        pendingToken: 'pending-1',
        otpauthUri: 'otpauth://totp/B2B:x?secret=ABC',
      },
    });
    expect(await flow.confirmTotpSetup('pending-1', '654321')).toEqual({
      kind: 'step',
      step: { kind: 'recovery', pendingToken: 'pending-1', codes: ['r1', 'r2'] },
    });
  });

  it('F1.14-AC1: kayıtsız numara oturum açmaz, kayıt bilgisi gösterilir', async () => {
    const { flow } = setup('register');
    expect(await flow.verifyCode(CHALLENGE, '123456')).toEqual({
      kind: 'step',
      step: { kind: 'register' },
    });
  });
});
