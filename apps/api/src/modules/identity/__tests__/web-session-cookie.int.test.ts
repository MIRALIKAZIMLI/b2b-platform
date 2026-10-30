// Web oturumu: yenileme anahtarı httpOnly cookie'de (F1.13a, ADR-0006 madde 3, TM-04, TM-21).
// İstemci `X-Client: web` ile kendini bildirir; mobil (başlıksız) davranışı değişmez.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { Clock, FixedClock } from '../../../core/clock';
import { REDIS_CLIENT } from '../../../infrastructure/redis';

const MINUTE_MS = 60_000;
const COOKIE_NAME = 'b2b_rt';

interface LoginJson {
  readonly nextStep: string;
  readonly accessToken?: string;
  readonly expiresIn?: number;
  readonly refreshToken?: string;
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers['set-cookie'] as string[] | string | undefined;
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function refreshCookie(response: request.Response): string | undefined {
  return setCookies(response).find((c) => c.startsWith(`${COOKIE_NAME}=`));
}

/** `b2b_rt=<değer>; ...` → `b2b_rt=<değer>` (istek Cookie başlığı için). */
function cookiePair(header: string): string {
  return header.split(';')[0] ?? '';
}

describe('web oturum cookie (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const clock = new FixedClock(new Date('2026-10-30T08:00:00.000Z'));

  beforeAll(async () => {
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: REDIS_CLIENT, useValue: redis.client },
      ],
    });
  });

  afterAll(async () => {
    const keys = await redis.keys();
    if (keys.length > 0) await redis.client.del(...keys);
    await app.close();
  });

  beforeEach(() => {
    clock.advance(120 * MINUTE_MS);
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function verify(headers: Record<string, string>) {
    const phone = randomTestPhone();
    await insertTestUser({ id: randomUUID(), phone });
    const requested = await http()
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'login' });
    expect(requested.status).toBe(202);
    const { challengeId } = requested.body as { challengeId: string };
    const outbox = await http().get('/api/v1/dev/sms-outbox').query({ phone });
    const body = (outbox.body as { items: { body: string }[] }).items[0]?.body ?? '';
    const code = /\b(\d{6})\b/.exec(body)?.[1] ?? '';
    const response = await http()
      .post('/api/v1/auth/otp/verify')
      .set(headers)
      .send({ challengeId, code });
    expect(response.status).toBe(200);
    return response;
  }

  async function webLogin() {
    const response = await verify({ 'X-Client': 'web' });
    const cookie = refreshCookie(response);
    expect(cookie).toBeDefined();
    return { response, cookie: cookiePair(cookie ?? '') };
  }

  it('F1.13-AC1: X-Client web → yenileme anahtarı gövdede yok, httpOnly cookie bayrakları tam', async () => {
    const { response } = await webLogin();
    const json = response.body as LoginJson;
    expect(json.nextStep).toBe('none');
    expect(json.accessToken).toBeTruthy();
    expect(json.refreshToken).toBeUndefined();

    const header = refreshCookie(response) ?? '';
    const parts = header.split(';').map((p) => p.trim());
    expect(parts[0]).toMatch(/^b2b_rt=[A-Za-z0-9_-]{43}$/);
    expect(parts).toContain('HttpOnly');
    expect(parts).toContain('Secure');
    expect(parts).toContain('SameSite=Strict');
    expect(parts).toContain('Path=/api/v1/auth');
    expect(parts).toContain(`Max-Age=${String(30 * 24 * 60 * 60)}`);
    expect(parts.some((p) => p.toLowerCase().startsWith('domain='))).toBe(false);
  });

  it('F1.13-AC1: mobil (X-Client yok) davranışı değişmez: anahtar gövdede, cookie yok', async () => {
    const response = await verify({});
    expect((response.body as LoginJson).refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(refreshCookie(response)).toBeUndefined();
  });

  it('F1.13-AC2: cookie ile /auth/refresh, X-Requested-With yoksa reddedilir (TM-21)', async () => {
    const { cookie } = await webLogin();

    const rejected = await http()
      .post('/api/v1/auth/refresh')
      .set({ 'X-Client': 'web', Cookie: cookie })
      .send({});
    expect(rejected.status).toBe(401);
    expect((rejected.body as { code: string }).code).toBe('UNAUTHENTICATED');

    // Reddedilen istek anahtarı tüketmez: başlıkla aynı cookie hâlâ geçerli.
    const accepted = await http()
      .post('/api/v1/auth/refresh')
      .set({ 'X-Client': 'web', 'X-Requested-With': 'fetch', Cookie: cookie })
      .send({});
    expect(accepted.status).toBe(200);
  });

  it('F1.13-AC2: X-Client olmadan da cookie ile yenileme X-Requested-With ister', async () => {
    const { cookie } = await webLogin();
    const rejected = await http().post('/api/v1/auth/refresh').set({ Cookie: cookie }).send({});
    expect(rejected.status).toBe(401);
  });

  it('F1.13-AC2: başlıkla cookie yenilemesi yeni cookie verir, gövdede anahtar yok, eski cookie tekrar kullanılamaz', async () => {
    const { cookie } = await webLogin();
    const headers = { 'X-Client': 'web', 'X-Requested-With': 'fetch' };

    const first = await http()
      .post('/api/v1/auth/refresh')
      .set({ ...headers, Cookie: cookie })
      .send({});
    expect(first.status).toBe(200);
    const json = first.body as LoginJson;
    expect(json.accessToken).toBeTruthy();
    expect(json.refreshToken).toBeUndefined();
    const rotated = refreshCookie(first) ?? '';
    expect(rotated).toContain('HttpOnly');
    expect(cookiePair(rotated)).not.toBe(cookie);

    // Eski anahtar ikinci kez → aile iptal, cookie silinir.
    const reused = await http()
      .post('/api/v1/auth/refresh')
      .set({ ...headers, Cookie: cookie })
      .send({});
    expect(reused.status).toBe(401);
    expect((reused.body as { code: string }).code).toBe('REFRESH_TOKEN_REUSED');
    expect(refreshCookie(reused)).toMatch(/^b2b_rt=;.*Max-Age=0/);
  });

  it('F1.13-AC2: cookie de gövde de yoksa 401', async () => {
    const response = await http()
      .post('/api/v1/auth/refresh')
      .set({ 'X-Client': 'web', 'X-Requested-With': 'fetch' })
      .send({});
    expect(response.status).toBe(401);
  });

  it("F1.13-AC1: logout cookie'yi siler (aynı bayraklarla Max-Age=0)", async () => {
    const { response } = await webLogin();
    const accessToken = (response.body as LoginJson).accessToken ?? '';
    const logout = await http()
      .post('/api/v1/auth/logout')
      .set({ Authorization: `Bearer ${accessToken}`, 'X-Client': 'web' });
    expect(logout.status).toBe(204);
    const cleared = refreshCookie(logout) ?? '';
    const parts = cleared.split(';').map((p) => p.trim());
    expect(parts[0]).toBe('b2b_rt=');
    expect(parts).toContain('Max-Age=0');
    expect(parts).toContain('HttpOnly');
    expect(parts).toContain('Secure');
    expect(parts).toContain('SameSite=Strict');
    expect(parts).toContain('Path=/api/v1/auth');
  });
});
