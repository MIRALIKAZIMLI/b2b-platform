// Oturum, JWT ve yenileme anahtarı (US-001 AC2, US-004, SF-01, F1.5b): gerçek PostgreSQL (app_user)
// + Redis, mock SMS. Giriş akışı gerçek uç noktalarla: kod iste → SMS kutusundan oku → doğrula.
// Saat FixedClock; her test saati 2 saat ilerletir (OTP pencereleri testler arasında taşınmaz).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { createTestApp, LogCapture } from '../../../../test/http-app';
import { queryAsOwner } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { Clock, FixedClock } from '../../../core/clock';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { hashRefreshToken } from '../session.service';
import { TokenService } from '../token.service';

const MINUTE_MS = 60_000;

interface ErrorJson {
  readonly code: string;
}

interface LoginJson {
  readonly nextStep: string;
  readonly accessToken?: string;
  readonly expiresIn?: number;
  readonly refreshToken?: string;
  readonly pendingToken?: string;
  readonly memberships: unknown[];
}

interface SessionJson {
  readonly id: string;
  readonly deviceType: string;
  readonly deviceName: string | null;
  readonly city: string | null;
  readonly lastUsedAt: string;
  readonly current: boolean;
}

describe('oturum, JWT, yenileme anahtarı (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const logs = new LogCapture();
  const clock = new FixedClock(new Date('2026-10-26T08:00:00.000Z'));

  beforeAll(async () => {
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '', LOG_LEVEL: 'trace' },
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: REDIS_CLIENT, useValue: redis.client },
      ],
      logStream: logs,
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

  async function verifyWithCode(phone: string, device?: object) {
    const requested = await http()
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'login' });
    expect(requested.status).toBe(202);
    const { challengeId } = requested.body as { challengeId: string };
    const outbox = await http().get('/api/v1/dev/sms-outbox').query({ phone });
    const body = (outbox.body as { items: { body: string }[] }).items[0]?.body ?? '';
    const code = /\b(\d{6})\b/.exec(body)?.[1] ?? '';
    return await http()
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId, code, ...(device === undefined ? {} : { device }) });
  }

  async function login(device?: object) {
    const userId = randomUUID();
    const phone = randomTestPhone();
    await insertTestUser({ id: userId, phone });
    const response = await verifyWithCode(phone, device);
    expect(response.status).toBe(200);
    const json = response.body as LoginJson;
    return {
      userId,
      phone,
      accessToken: json.accessToken ?? '',
      refreshToken: json.refreshToken ?? '',
    };
  }

  function bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('US-001 AC2: doğru kodla oturum açılır (erişim + yenileme anahtarı)', async () => {
    const userId = randomUUID();
    const phone = randomTestPhone();
    await insertTestUser({ id: userId, phone });

    const response = await verifyWithCode(phone, { type: 'ios', name: 'iPhone' });

    expect(response.status).toBe(200);
    const json = response.body as LoginJson;
    expect(json.nextStep).toBe('none');
    expect(json.expiresIn).toBe(900);
    expect(json.memberships).toEqual([]);
    expect(json.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const me = await http()
      .get('/api/v1/me')
      .set(bearer(json.accessToken ?? ''));
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      id: userId,
      fullName: 'Test Kullanıcı',
      phone,
      preferredLanguage: null,
      timezone: null,
      platformRole: null,
      totpEnabled: false,
      memberships: [],
    });

    // Yenileme anahtarı düz saklanmaz; last_login_at yazılır.
    const rows = await queryAsOwner<{ refresh_token_hash: string; device_type: string }>(
      'select refresh_token_hash, device_type from user_sessions where user_id = $1',
      [userId],
    );
    expect(rows).toEqual([
      { refresh_token_hash: hashRefreshToken(json.refreshToken ?? ''), device_type: 'ios' },
    ]);
    const users = await queryAsOwner<{ last_login_at: Date }>(
      'select last_login_at from users where id = $1',
      [userId],
    );
    expect(users[0]?.last_login_at.toISOString()).toBe(clock.now().toISOString());
  });

  it('SF-01: kayıtlı olmayan numara → nextStep register + pendingToken, oturum açılmaz', async () => {
    const phone = randomTestPhone();

    const response = await verifyWithCode(phone);

    expect(response.status).toBe(200);
    const json = response.body as LoginJson;
    expect(json.nextStep).toBe('register');
    expect(json.accessToken).toBeUndefined();
    expect(json.refreshToken).toBeUndefined();
    expect(json.memberships).toEqual([]);
    expect(await app.get(TokenService).verifyPendingRegistration(json.pendingToken ?? '')).toBe(
      phone,
    );
  });

  it('K2: pendingToken erişim anahtarı olarak kabul edilmez → 401', async () => {
    const json = (await verifyWithCode(randomTestPhone())).body as LoginJson;

    const me = await http()
      .get('/api/v1/me')
      .set(bearer(json.pendingToken ?? ''));

    expect(me.status).toBe(401);
    expect((me.body as ErrorJson).code).toBe('UNAUTHENTICATED');
  });

  it('SF-01: locked / deleted kullanıcı → 403 USER_DISABLED, oturum açılmaz', async () => {
    for (const status of ['locked', 'deleted'] as const) {
      const userId = randomUUID();
      const phone = randomTestPhone();
      await insertTestUser({ id: userId, phone, status });

      const response = await verifyWithCode(phone);

      expect(response.status, status).toBe(403);
      expect((response.body as ErrorJson).code, status).toBe('USER_DISABLED');
      expect(
        await queryAsOwner('select 1 from user_sessions where user_id = $1', [userId]),
      ).toEqual([]);
    }
  });

  it('US-004 AC1: oturumlar cihaz türü, son kullanım ve şehirle listelenir; current işaretli', async () => {
    const first = await login({ type: 'android', name: 'Pixel' });
    clock.advance(MINUTE_MS);
    // Aynı kullanıcı ikinci cihaz: telefona yeni kod gönderilip doğrulanır.
    const second = await verifyWithCode(first.phone, { type: 'web' });
    const secondJson = second.body as LoginJson;

    const response = await http()
      .get('/api/v1/auth/sessions')
      .set(bearer(secondJson.accessToken ?? ''));

    expect(response.status).toBe(200);
    const sessions = response.body as SessionJson[];
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      deviceType: 'web',
      deviceName: null,
      city: null,
      lastUsedAt: clock.now().toISOString(),
      current: true,
    });
    expect(sessions[1]).toMatchObject({
      deviceType: 'android',
      deviceName: 'Pixel',
      current: false,
    });
  });

  it('US-004 AC2: kapatılan oturumun yenileme anahtarı reddedilir; erişim anahtarı en geç 15 dk sonra 401', async () => {
    const device = await login({ type: 'ios' });
    const sessions = (await http().get('/api/v1/auth/sessions').set(bearer(device.accessToken)))
      .body as SessionJson[];
    const sessionId = sessions[0]?.id ?? '';

    const closed = await http()
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set(bearer(device.accessToken));
    expect(closed.status).toBe(204);

    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: device.refreshToken });
    expect(refreshed.status).toBe(401);

    // Erişim anahtarı durumsuz: ömrü dolana kadar geçerli, sonra 401.
    clock.advance(14 * MINUTE_MS);
    expect((await http().get('/api/v1/me').set(bearer(device.accessToken))).status).toBe(200);
    clock.advance(MINUTE_MS + 1000);
    const expired = await http().get('/api/v1/me').set(bearer(device.accessToken));
    expect(expired.status).toBe(401);
    expect((expired.body as ErrorJson).code).toBe('UNAUTHENTICATED');
  });

  it('refresh: anahtar döndürülür; yeni anahtar çalışır, eski erişim anahtarı ömrü boyunca çalışır', async () => {
    const device = await login();

    const response = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: device.refreshToken });

    expect(response.status).toBe(200);
    const pair = response.body as { accessToken: string; expiresIn: number; refreshToken: string };
    expect(pair.expiresIn).toBe(900);
    expect(pair.refreshToken).not.toBe(device.refreshToken);
    expect((await http().get('/api/v1/me').set(bearer(pair.accessToken))).status).toBe(200);
    const sessions = (await http().get('/api/v1/auth/sessions').set(bearer(pair.accessToken)))
      .body as SessionJson[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.current).toBe(true);
  });

  it('F1.5-AC11: kullanılmış yenileme anahtarı tekrar gelirse aile iptal, 401 REFRESH_TOKEN_REUSED, audit', async () => {
    const device = await login();
    const first = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: device.refreshToken });
    const rotated = (first.body as { refreshToken: string }).refreshToken;

    const reused = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: device.refreshToken });

    expect(reused.status).toBe(401);
    expect((reused.body as ErrorJson).code).toBe('REFRESH_TOKEN_REUSED');
    // Saldırgan da meşru cihaz da artık yenileyemez: ailedeki son anahtar da iptal.
    const after = await http().post('/api/v1/auth/refresh').send({ refreshToken: rotated });
    expect(after.status).toBe(401);

    const open = await queryAsOwner(
      'select 1 from user_sessions where user_id = $1 and revoked_at is null',
      [device.userId],
    );
    expect(open).toEqual([]);
    const family = await queryAsOwner<{ family_id: string }>(
      'select distinct family_id from user_sessions where user_id = $1',
      [device.userId],
    );
    const audit = await queryAsOwner<{ action: string }>(
      `select action from audit_logs where target_type = 'session_family' and target_id = $1`,
      [family[0]?.family_id],
    );
    expect(audit.map((row) => row.action)).toContain('session.refresh_reused');
  });

  it('K3: aynı anahtarla eşzamanlı iki yenilemede yalnızca biri başarılı (satır kilidi)', async () => {
    const device = await login();
    const hash = hashRefreshToken(device.refreshToken);
    const now = clock.now().toISOString();
    const expires = new Date(clock.now().getTime() + 30 * 24 * 60 * MINUTE_MS).toISOString();
    const a = await connectAsAppUser();
    const b = await connectAsAppUser();
    try {
      await a.query('begin');
      const first = await a.query<{ result: string }>(
        'select result from user_session_rotate($1, $2, $3, $4, $5)',
        [hash, randomUUID(), hashRefreshToken('a'), now, expires],
      );
      // b aynı satırı bekler; a işlemi bitirince kapatılmış satırı görür.
      const secondPromise = b.query<{ result: string }>(
        'select result from user_session_rotate($1, $2, $3, $4, $5)',
        [hash, randomUUID(), hashRefreshToken('b'), now, expires],
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await a.query('commit');
      const second = await secondPromise;

      expect(first.rows[0]?.result).toBe('rotated');
      expect(second.rows[0]?.result).toBe('reused');
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('F1.5-AC14: başkasının oturumu görünmez; kapatmaya çalışmak 404, oturum açık kalır', async () => {
    const owner = await login({ type: 'android' });
    const other = await login({ type: 'web' });
    const ownerSessions = (await http().get('/api/v1/auth/sessions').set(bearer(owner.accessToken)))
      .body as SessionJson[];
    const ownerSessionId = ownerSessions[0]?.id ?? '';

    const otherList = (await http().get('/api/v1/auth/sessions').set(bearer(other.accessToken)))
      .body as SessionJson[];
    expect(otherList.map((s) => s.id)).not.toContain(ownerSessionId);

    const response = await http()
      .delete(`/api/v1/auth/sessions/${ownerSessionId}`)
      .set(bearer(other.accessToken));

    expect(response.status).toBe(404);
    expect((response.body as ErrorJson).code).toBe('NOT_FOUND');
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: owner.refreshToken });
    expect(refreshed.status).toBe(200);
  });

  it('logout: bu oturumun ailesi kapatılır, yenileme anahtarı reddedilir', async () => {
    const device = await login();

    const response = await http().post('/api/v1/auth/logout').set(bearer(device.accessToken));

    expect(response.status).toBe(204);
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: device.refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('refresh: bilinmeyen veya eksik anahtar → 401 UNAUTHENTICATED', async () => {
    for (const body of [{ refreshToken: 'yok-boyle-bir-anahtar' }, {}]) {
      const response = await http().post('/api/v1/auth/refresh').send(body);
      expect(response.status).toBe(401);
      expect((response.body as ErrorJson).code).toBe('UNAUTHENTICATED');
    }
  });

  it('refresh: süresi dolmuş yenileme anahtarı → 401', async () => {
    const device = await login();
    clock.advance(30 * 24 * 60 * MINUTE_MS + 1000);

    const response = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: device.refreshToken });

    expect(response.status).toBe(401);
    expect((response.body as ErrorJson).code).toBe('UNAUTHENTICATED');
  });

  it('korumalı uçlar anahtarsız → 401', async () => {
    for (const path of ['/api/v1/me', '/api/v1/auth/sessions']) {
      const response = await http().get(path);
      expect(response.status, path).toBe(401);
    }
    expect((await http().post('/api/v1/auth/logout')).status).toBe(401);
  });

  it('F1.5-AC13: JWT ve yenileme anahtarı loglanmaz', async () => {
    logs.chunks.length = 0;
    const device = await login();
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: device.refreshToken });
    const pair = refreshed.body as { accessToken: string; refreshToken: string };
    await http().get('/api/v1/me').set(bearer(pair.accessToken));
    await http().get('/api/v1/me').set(bearer('bozuk.anahtar.degeri'));

    const text = logs.text();
    expect(text).toContain('request completed');
    for (const secret of [
      device.accessToken,
      device.refreshToken,
      pair.accessToken,
      pair.refreshToken,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('bozuk.anahtar.degeri');
  });
});
