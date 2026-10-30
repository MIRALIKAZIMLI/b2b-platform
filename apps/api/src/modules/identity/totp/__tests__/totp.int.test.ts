// TOTP ve platform ekibi (US-002, NFR-46, TM-03, F1.6): gerçek PostgreSQL (app_user) + Redis, mock SMS.
// Giriş: kod iste → SMS kutusu → otp/verify → (platform rolü) totp/setup → totp/verify.
// TOTP kodları test içinde aynı saatle (FixedClock) otplib ile üretilir; sabit sır yok.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../../test/db-clients';
import { createTestApp, LogCapture } from '../../../../../test/http-app';
import { queryAsOwner } from '../../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../../test/users';
import { Clock, FixedClock } from '../../../../core/clock';
import { withPlatformTx } from '../../../../core/db';
import { REDIS_CLIENT } from '../../../../infrastructure/redis';
import { seedSuperAdmin } from '../../seed/super-admin.seed';

const MINUTE_MS = 60_000;
const STEP_MS = 30_000;

interface LoginJson {
  readonly nextStep: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly pendingToken?: string;
  readonly memberships: unknown[];
}

interface ErrorJson {
  readonly code: string;
  readonly details?: { readonly retryAfter?: number };
}

describe('TOTP ve platform ekibi (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const logs = new LogCapture();
  const clock = new FixedClock(new Date('2026-10-27T08:00:00.000Z'));

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

  function totpCode(secret: string): string {
    return authenticator.clone({ epoch: clock.now().getTime() }).generate(secret);
  }

  async function otpLogin(phone: string): Promise<LoginJson> {
    const requested = await http()
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'login' });
    const { challengeId } = requested.body as { challengeId: string };
    const outbox = await http().get('/api/v1/dev/sms-outbox').query({ phone });
    const body = (outbox.body as { items: { body: string }[] }).items[0]?.body ?? '';
    const code = /\b(\d{6})\b/.exec(body)?.[1] ?? '';
    const verified = await http().post('/api/v1/auth/otp/verify').send({ challengeId, code });
    expect(verified.status).toBe(200);
    return verified.body as LoginJson;
  }

  async function staffUser(role = 'operations') {
    const userId = randomUUID();
    const phone = randomTestPhone();
    await insertTestUser({ id: userId, phone });
    await queryAsOwner('insert into platform_staff (user_id, role) values ($1, $2)', [
      userId,
      role,
    ]);
    return { userId, phone };
  }

  function setup(pendingToken: string, body: object = {}) {
    return http()
      .post('/api/v1/auth/totp/setup')
      .set('Authorization', `Bearer ${pendingToken}`)
      .send(body);
  }

  /** Kurulumu tamamlar; sır ve kurtarma kodları döner. */
  async function enroll(pendingToken: string) {
    const started = await setup(pendingToken);
    expect(started.status).toBe(200);
    const uri = (started.body as { otpauthUri: string }).otpauthUri;
    const secret = new URL(uri).searchParams.get('secret') ?? '';
    const confirmed = await setup(pendingToken, { confirmCode: totpCode(secret) });
    expect(confirmed.status).toBe(200);
    return {
      uri,
      secret,
      recoveryCodes: (confirmed.body as { recoveryCodes: string[] }).recoveryCodes,
    };
  }

  function verify(pendingToken: string, code: string) {
    return http().post('/api/v1/auth/totp/verify').send({ pendingToken, code });
  }

  it('US-002 AC1: platform rolü TOTP kurmadan erişim anahtarı alamaz', async () => {
    const { phone } = await staffUser();

    const login = await otpLogin(phone);

    expect(login.nextStep).toBe('totp_setup');
    expect(login.accessToken).toBeUndefined();
    expect(login.refreshToken).toBeUndefined();
    const pending = login.pendingToken ?? '';
    // Ön oturum anahtarı erişim anahtarı değildir.
    expect((await http().get('/api/v1/me').set('Authorization', `Bearer ${pending}`)).status).toBe(
      401,
    );
    // Kurulum bitmeden ikinci adım yok.
    const early = await verify(pending, '123456');
    expect(early.status).toBe(401);
    expect((early.body as ErrorJson).code).toBe('TOTP_REQUIRED');

    const { secret } = await enroll(pending);
    clock.advance(STEP_MS);
    const second = await verify(pending, totpCode(secret));

    expect(second.status).toBe(200);
    const session = second.body as LoginJson;
    expect(session.nextStep).toBe('none');
    const me = await http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken ?? ''}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ platformRole: 'operations', totpEnabled: true });
  });

  it('US-002 AC1: TOTP kurulu platform kullanıcısı sonraki girişte nextStep totp alır', async () => {
    const { phone } = await staffUser();
    const { secret } = await enroll((await otpLogin(phone)).pendingToken ?? '');
    clock.advance(2 * MINUTE_MS);

    const login = await otpLogin(phone);

    expect(login.nextStep).toBe('totp');
    expect(login.accessToken).toBeUndefined();
    expect((await verify(login.pendingToken ?? '', totpCode(secret))).status).toBe(200);
  });

  it('US-002 AC2: yanlış TOTP → TOTP_INVALID, oturum açılmaz; aynı kod ikinci kez kabul edilmez', async () => {
    const { userId, phone } = await staffUser();
    const pending = (await otpLogin(phone)).pendingToken ?? '';
    const { secret } = await enroll(pending);
    clock.advance(STEP_MS);
    const good = totpCode(secret);
    const wrong = good === '000000' ? '111111' : '000000';

    const rejected = await verify(pending, wrong);
    expect(rejected.status).toBe(400);
    expect((rejected.body as ErrorJson).code).toBe('TOTP_INVALID');
    expect(await queryAsOwner('select 1 from user_sessions where user_id = $1', [userId])).toEqual(
      [],
    );

    expect((await verify(pending, good)).status).toBe(200);
    const replay = await verify(pending, good);
    expect(replay.status).toBe(400);
    expect((replay.body as ErrorJson).code).toBe('TOTP_INVALID');
  });

  it('US-002 AC4: 10 kurtarma kodu bir kez gösterilir; tekrar istenemez; her biri bir kez kullanılır', async () => {
    const { phone } = await staffUser();
    const pending = (await otpLogin(phone)).pendingToken ?? '';
    const { recoveryCodes } = await enroll(pending);

    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    // Kurulu kullanıcı kurulumu yeniden başlatamaz; kodlar bir daha gösterilmez.
    const again = await setup(pending);
    expect(again.status).toBe(409);
    expect((again.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');
    expect(JSON.stringify(again.body)).not.toContain(recoveryCodes[0] ?? '-');

    const code = recoveryCodes[3] ?? '';
    const first = await verify(pending, code);
    expect(first.status).toBe(200);
    expect((first.body as LoginJson).nextStep).toBe('none');
    const reused = await verify(pending, code);
    expect(reused.status).toBe(400);
    expect((reused.body as ErrorJson).code).toBe('TOTP_INVALID');
    // Diğer kodlar hâlâ geçerli.
    expect((await verify(pending, recoveryCodes[4] ?? '')).status).toBe(200);
  });

  it("F1.13-AC1: web (X-Client web) TOTP ikinci adımında yenileme anahtarı gövdede değil httpOnly cookie'de", async () => {
    const { phone } = await staffUser();
    const { secret } = await enroll((await otpLogin(phone)).pendingToken ?? '');
    clock.advance(2 * MINUTE_MS);
    const login = await otpLogin(phone);

    const response = await http()
      .post('/api/v1/auth/totp/verify')
      .set('X-Client', 'web')
      .send({ pendingToken: login.pendingToken ?? '', code: totpCode(secret) });

    expect(response.status).toBe(200);
    const session = response.body as LoginJson;
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeUndefined();
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((c) => c.startsWith('b2b_rt=')) ?? '';
    expect(cookie).toMatch(
      /^b2b_rt=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Strict; Path=\/api\/v1\/auth; Max-Age=\d+$/,
    );
  });

  it('kaba kuvvet: 5 yanlış ikinci adım → 423 OTP_LOCKED; doğru kod da kabul edilmez', async () => {
    const { phone } = await staffUser();
    const pending = (await otpLogin(phone)).pendingToken ?? '';
    const { secret } = await enroll(pending);
    clock.advance(STEP_MS);
    const good = totpCode(secret);
    const wrong = good === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i++) {
      expect((await verify(pending, wrong)).status).toBe(400);
    }
    const fifth = await verify(pending, wrong);
    expect(fifth.status).toBe(423);
    expect((fifth.body as ErrorJson).code).toBe('OTP_LOCKED');
    expect((await verify(pending, good)).status).toBe(423);
  });

  it('H1: aynı pendingToken ile 10 eşzamanlı yanlış kod → en çok otp.max_attempts deneme, kalanı 423', async () => {
    const { phone } = await staffUser();
    const pending = (await otpLogin(phone)).pendingToken ?? '';
    const { secret } = await enroll(pending);
    clock.advance(STEP_MS);
    const good = totpCode(secret);
    const wrong = good === '000000' ? '111111' : '000000';

    const responses = await Promise.all(Array.from({ length: 10 }, () => verify(pending, wrong)));

    const statuses = responses.map((response) => response.status);
    // Kod yalnızca ilk 5 denemede doğrulanır: 4 tanesi 400, 5.si kilidi koyar (423), kalanlar 423.
    expect(statuses.filter((status) => status === 400).length).toBeLessThanOrEqual(5);
    expect(statuses.filter((status) => status === 400)).toHaveLength(4);
    expect(statuses.filter((status) => status === 423)).toHaveLength(6);
    expect((await verify(pending, good)).status).toBe(423);
  });

  it('H1: kurulum onayında da eşzamanlı yanlış kodlar kilidi aşamaz', async () => {
    const { phone } = await staffUser();
    const pending = (await otpLogin(phone)).pendingToken ?? '';
    const started = await setup(pending);
    expect(started.status).toBe(200);
    const secret =
      new URL((started.body as { otpauthUri: string }).otpauthUri).searchParams.get('secret') ?? '';
    const wrong = totpCode(secret) === '000000' ? '111111' : '000000';

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => setup(pending, { confirmCode: wrong })),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 400).length).toBeLessThanOrEqual(4);
    expect(statuses.filter((status) => status === 423).length).toBeGreaterThanOrEqual(6);
    expect(statuses.every((status) => status === 400 || status === 423)).toBe(true);
  });

  it('platform rolü olmayan kullanıcı doğrudan oturum açar (nextStep none)', async () => {
    const userId = randomUUID();
    const phone = randomTestPhone();
    await insertTestUser({ id: userId, phone });

    const login = await otpLogin(phone);

    expect(login.nextStep).toBe('none');
    const me = await http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${login.accessToken ?? ''}`);
    expect(me.body).toMatchObject({ platformRole: null, totpEnabled: false });
  });

  it('setup ve verify erişim anahtarı veya kayıt anahtarı kabul etmez → 401', async () => {
    const userId = randomUUID();
    const phone = randomTestPhone();
    await insertTestUser({ id: userId, phone });
    const access = (await otpLogin(phone)).accessToken ?? '';
    const register = (await otpLogin(randomTestPhone())).pendingToken ?? '';

    for (const token of [access, register, 'bozuk']) {
      expect((await setup(token)).status).toBe(401);
      expect((await verify(token, '123456')).status).toBe(401);
    }
    expect((await http().post('/api/v1/auth/totp/setup').send({})).status).toBe(401);
  });

  it('F1.6-AC5: TOTP sırrı veritabanında düz değil; sır, URI ve kodlar loglanmaz', async () => {
    logs.chunks.length = 0;
    const { userId, phone } = await staffUser();
    const pending = (await otpLogin(phone)).pendingToken ?? '';
    const { uri, secret, recoveryCodes } = await enroll(pending);
    clock.advance(STEP_MS);
    const code = totpCode(secret);
    await verify(pending, code);
    await verify(pending, recoveryCodes[0] ?? '');

    // user_totp FORCE RLS: tablo sahibi de bağlamsız okuyamaz; platform bağlamında okunur.
    const rows = await withPlatformTx({ userId }, (tx) =>
      tx.execute<{ secret_encrypted: Buffer; recovery_codes_hash: unknown }>(
        sql`select secret_encrypted, recovery_codes_hash from user_totp where user_id = ${userId}`,
      ),
    );
    const stored = rows.rows[0];
    expect(stored?.secret_encrypted.toString('latin1')).not.toContain(secret);
    const hashes = JSON.stringify(stored?.recovery_codes_hash);
    for (const recovery of recoveryCodes) expect(hashes).not.toContain(recovery);

    const text = logs.text();
    expect(text).toContain('request completed');
    for (const value of [secret, uri, code, pending, ...recoveryCodes]) {
      expect(text).not.toContain(value);
    }
  });

  it('seed: SUPER_ADMIN_PHONE yoksa atlar; varsa süper admin açar, ikinci çalıştırmada eklemez', async () => {
    const phone = randomTestPhone();
    const owner = await connectAsMigrator();
    try {
      expect(await seedSuperAdmin(owner, undefined, () => randomUUID())).toEqual({
        status: 'skipped',
      });
      expect(await seedSuperAdmin(owner, phone, () => randomUUID())).toEqual({
        status: 'done',
        userCreated: true,
        staffCreated: true,
      });
      expect(await seedSuperAdmin(owner, phone, () => randomUUID())).toEqual({
        status: 'done',
        userCreated: false,
        staffCreated: false,
      });
    } finally {
      await owner.end();
    }
    const login = await otpLogin(phone);
    expect(login.nextStep).toBe('totp_setup');
  });
});
