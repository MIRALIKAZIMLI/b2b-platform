// OTP isteme ve doğrulama (US-001, F1.5a): gerçek PostgreSQL (app_user) + Redis, mock SMS.
// Saat FixedClock; her test saati 2 saat ilerletir, böylece 1 saatlik pencereler testler arasında
// taşınmaz. Kod yalnızca /api/v1/dev/sms-outbox'tan okunur (US-001 AC6).
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp, LogCapture } from '../../../../test/http-app';
import { queryAsOwner } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { Clock, FixedClock } from '../../../core/clock';
import { DomainError } from '../../../core/errors/domain-error';
import { createRedisClient, REDIS_CLIENT } from '../../../infrastructure/redis';
import { seedI18n } from '../../i18n';
import { OtpService } from '../otp.service';

const MINUTE_MS = 60_000;
const OTP_PATH = '/api/v1/auth/otp/request';

interface ErrorJson {
  readonly code: string;
  readonly details?: { readonly retryAfter?: number; readonly phone?: string[] };
}

interface OutboxJson {
  readonly items: { readonly phone: string; readonly body: string; readonly createdAt: string }[];
}

async function errorOf(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('hata bekleniyordu');
}

function wrongCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

describe('OTP (entegrasyon: PostgreSQL + Redis, mock SMS)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let otp: OtpService;
  const logs = new LogCapture();
  const clock = new FixedClock(new Date('2026-10-25T08:00:00.000Z'));

  beforeAll(async () => {
    const owner = await connectAsMigrator();
    try {
      await seedI18n(owner);
    } finally {
      await owner.end();
    }
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '', LOG_LEVEL: 'trace' },
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: REDIS_CLIENT, useValue: redis.client },
      ],
      logStream: logs,
    });
    otp = app.get(OtpService);
  });

  afterAll(async () => {
    // Test anahtarları uygulama kapanmadan silinir: kapanış (RedisShutdown) istemciyi kapatır.
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

  async function requestCode(phone: string, language = 'az') {
    return await http()
      .post(OTP_PATH)
      .set('Accept-Language', language)
      .send({ phone, purpose: 'login' });
  }

  async function outbox(phone: string): Promise<OutboxJson['items']> {
    const response = await http().get('/api/v1/dev/sms-outbox').query({ phone });
    expect(response.status).toBe(200);
    return (response.body as OutboxJson).items;
  }

  async function latestCode(phone: string): Promise<string> {
    const [latest] = await outbox(phone);
    const code = /\b(\d{6})\b/.exec(latest?.body ?? '')?.[1];
    if (code === undefined) throw new Error('outbox mesajında kod yok');
    return code;
  }

  it('US-001 AC1: 6 haneli, 5 dk geçerli kod gönderilir; veritabanında yalnızca özeti var', async () => {
    const phone = randomTestPhone();
    const response = await requestCode(phone);

    expect(response.status).toBe(202);
    const body = response.body as { challengeId: string; expiresAt: string };
    expect(body.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.expiresAt).toBe(new Date(clock.now().getTime() + 5 * MINUTE_MS).toISOString());

    const code = await latestCode(phone);
    expect(code).toMatch(/^\d{6}$/);
    const [message] = await outbox(phone);
    expect(message?.body).toBe(
      `${code} — B2B giriş kodunuz. 5 dəqiqə etibarlıdır. Heç kimlə paylaşmayın.`,
    );

    const rows = await queryAsOwner<{ code_hash: string; attempts: number; purpose: string }>(
      'select code_hash, attempts, purpose from otp_challenges where id = $1',
      [body.challengeId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.code_hash).not.toContain(code);
    expect(rows[0]?.purpose).toBe('login');

    await expect(otp.verifyChallenge({ challengeId: body.challengeId, code })).resolves.toEqual({
      phoneE164: phone,
      purpose: 'login',
    });
  });

  it('US-001 AC1: SMS metni Accept-Language dilinde', async () => {
    const phone = randomTestPhone();
    expect((await requestCode(phone, 'ru')).status).toBe(202);

    const [message] = await outbox(phone);
    expect(message?.body).toMatch(/^\d{6} — ваш код входа в B2B\. Действует 5 мин\./);
  });

  it('US-001 AC3: 60 sn içinde ikinci istek → 429 OTP_RATE_LIMITED, kalan süre döner, kod gönderilmez', async () => {
    const phone = randomTestPhone();
    expect((await requestCode(phone)).status).toBe(202);

    clock.advance(20_000);
    const second = await requestCode(phone);

    expect(second.status).toBe(429);
    const error = second.body as ErrorJson;
    expect(error.code).toBe('OTP_RATE_LIMITED');
    expect(error.details?.retryAfter).toBe(40);
    expect(second.headers['retry-after']).toBe('40');
    expect(await outbox(phone)).toHaveLength(1);

    clock.advance(40_000);
    expect((await requestCode(phone)).status).toBe(202);
    expect(await outbox(phone)).toHaveLength(2);
  });

  it('US-001 AC3: 1 saatte 6. istek → 429, kalan süre ilk isteğin pencereden çıkmasına kadar', async () => {
    const phone = randomTestPhone();
    for (let i = 0; i < 5; i++) {
      expect((await requestCode(phone)).status).toBe(202);
      clock.advance(61_000);
    }

    const sixth = await requestCode(phone);

    expect(sixth.status).toBe(429);
    expect((sixth.body as ErrorJson).code).toBe('OTP_RATE_LIMITED');
    // İlk istek 5 × 61 sn önce; pencereden çıkmasına 3600 − 305 sn var.
    expect((sixth.body as ErrorJson).details?.retryAfter).toBe(3600 - 305);
    expect(await outbox(phone)).toHaveLength(5);
  });

  it('US-001 AC3: aynı IP saatte 20 istekten sonra → 429', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await requestCode(randomTestPhone())).status).toBe(202);
    }

    const blocked = await requestCode(randomTestPhone());

    expect(blocked.status).toBe(429);
    expect((blocked.body as ErrorJson).code).toBe('OTP_RATE_LIMITED');
    expect((blocked.body as ErrorJson).details?.retryAfter).toBe(3600);
  });

  it('US-001 AC4: 5 yanlış → OTP_LOCKED, 15 dk kilit, audit kaydı; kilit bitince yeni kod alınır', async () => {
    const phone = randomTestPhone();
    const response = await requestCode(phone);
    const { challengeId } = response.body as { challengeId: string };
    const code = await latestCode(phone);

    for (let i = 0; i < 4; i++) {
      const error = await errorOf(otp.verifyChallenge({ challengeId, code: wrongCode(code) }));
      expect(error.code).toBe('OTP_INVALID');
    }
    const locked = await errorOf(otp.verifyChallenge({ challengeId, code: wrongCode(code) }));
    expect(locked.code).toBe('OTP_LOCKED');
    expect(locked.details).toEqual({ retryAfter: 15 * 60 });

    const audit = await queryAsOwner<{ action: string; actor_type: string; after: unknown }>(
      `select action, actor_type, after from audit_logs
        where target_type = 'otp_challenge' and target_id = $1`,
      [challengeId],
    );
    expect(audit).toEqual([
      { action: 'otp.locked', actor_type: 'system', after: { attempts: 5, lockMinutes: 15 } },
    ]);

    // Kilitliyken doğru kod da kabul edilmez; yeni kod istenemez (kalan süre döner).
    const afterLock = await errorOf(otp.verifyChallenge({ challengeId, code }));
    expect(afterLock.code).toBe('OTP_INVALID');
    clock.advance(5 * MINUTE_MS);
    const blocked = await requestCode(phone);
    expect(blocked.status).toBe(429);
    expect((blocked.body as ErrorJson).details?.retryAfter).toBe(10 * 60);

    clock.advance(10 * MINUTE_MS + 1000);
    expect((await requestCode(phone)).status).toBe(202);
  });

  it('US-001 AC4: kilitli numaranın başka bir koduyla doğrulama → OTP_LOCKED', async () => {
    const phone = randomTestPhone();
    const first = (await requestCode(phone)).body as { challengeId: string };
    const firstCode = await latestCode(phone);
    clock.advance(61_000);
    const second = (await requestCode(phone)).body as { challengeId: string };
    const secondCode = await latestCode(phone);

    for (let i = 0; i < 5; i++) {
      await errorOf(
        otp.verifyChallenge({ challengeId: first.challengeId, code: wrongCode(firstCode) }),
      );
    }

    const error = await errorOf(
      otp.verifyChallenge({ challengeId: second.challengeId, code: secondCode }),
    );
    expect(error.code).toBe('OTP_LOCKED');
  });

  it('US-001 AC5: süresi dolmuş kod → OTP_EXPIRED', async () => {
    const phone = randomTestPhone();
    const { challengeId } = (await requestCode(phone)).body as { challengeId: string };
    const code = await latestCode(phone);

    clock.advance(5 * MINUTE_MS);

    const error = await errorOf(otp.verifyChallenge({ challengeId, code }));
    expect(error.code).toBe('OTP_EXPIRED');
  });

  it('US-001 AC5: kullanılmış kod → OTP_INVALID (tek kullanım)', async () => {
    const phone = randomTestPhone();
    const { challengeId } = (await requestCode(phone)).body as { challengeId: string };
    const code = await latestCode(phone);

    await otp.verifyChallenge({ challengeId, code });
    const error = await errorOf(otp.verifyChallenge({ challengeId, code }));

    expect(error.code).toBe('OTP_INVALID');
  });

  it('US-001 AC5: bilinmeyen challenge → OTP_INVALID', async () => {
    const error = await errorOf(
      otp.verifyChallenge({ challengeId: '0190f1a2-0000-7000-8000-000000000000', code: '123456' }),
    );
    expect(error.code).toBe('OTP_INVALID');
  });

  it('US-001 AC6: mock SMS göndermez; kod yalnızca /api/v1/dev/sms-outbox ta görünür', async () => {
    const phone = randomTestPhone();
    const response = await requestCode(phone);

    expect(response.status).toBe(202);
    // Yanıtta kod yok; kod yalnızca SMS kutusunda.
    const code = await latestCode(phone);
    expect(JSON.stringify(response.body)).not.toContain(code);
    const items = await outbox(phone);
    expect(items).toHaveLength(1);
    expect(items[0]?.phone).toBe(phone);
  });

  it('SF-01: kayıtlı olmayan numaraya da kod gönderilir, kullanıcı oluşturulmaz', async () => {
    const phone = randomTestPhone();

    expect((await requestCode(phone)).status).toBe(202);

    const rows = await queryAsOwner('select 1 from users where phone_e164 = $1', [phone]);
    expect(rows).toEqual([]);
  });

  it('F1.5-AC8: +90 numara → VALIDATION_FAILED', async () => {
    const response = await requestCode('+905321234567');

    expect(response.status).toBe(422);
    expect(response.body as ErrorJson).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { phone: ['country_not_allowed'] },
    });
  });

  it('F1.5-AC8: geçersiz numara → VALIDATION_FAILED', async () => {
    for (const phone of ['+99412', '994501234567', '+994 50 123 45 67']) {
      const response = await requestCode(phone);
      expect(response.status, phone).toBe(422);
      expect((response.body as ErrorJson).code, phone).toBe('VALIDATION_FAILED');
    }
  });

  it('F1.5-AC8: günlük sınır → SMS_UNAVAILABLE, kod gönderilmez', async () => {
    const day = clock.now().toISOString().slice(0, 10);
    // Varsayılan sms.daily_cap 500: sayaç 500'deyken sıradaki istek reddedilir.
    await redis.client.set(`otp:sms:daily:${day}`, '500');
    const phone = randomTestPhone();

    const response = await requestCode(phone);

    expect(response.status).toBe(503);
    expect((response.body as ErrorJson).code).toBe('SMS_UNAVAILABLE');
    expect(await outbox(phone)).toEqual([]);
    await redis.client.del(`otp:sms:daily:${day}`);
  });

  it('F1.5-AC9: OTP kodu ve telefon loglarda görünmez', async () => {
    logs.chunks.length = 0;
    const phone = randomTestPhone();
    const { challengeId } = (await requestCode(phone)).body as { challengeId: string };
    const code = await latestCode(phone);
    await errorOf(otp.verifyChallenge({ challengeId, code: wrongCode(code) }));
    await otp.verifyChallenge({ challengeId, code });
    clock.advance(1000);
    await requestCode(phone); // 429 (hata yolu da loglanır)

    const text = logs.text();
    expect(text).toContain('request completed');
    expect(text).not.toContain(code);
    expect(text).not.toContain(phone);
    expect(text).not.toContain(phone.slice(1));
  });

  // Her Redis komutu bir yeniden bağlanma denemesinden sonra düşer; istek birkaç ayar okuduğu
  // için süre 5 sn'yi aşabilir.
  describe("Redis'e ulaşılamazsa güvenli taraf (Mimar kararı 2)", { timeout: 60_000 }, () => {
    let broken: NestFastifyApplication;

    beforeAll(async () => {
      broken = await createTestApp({
        env: { REDIS_URL: process.env.REDIS_URL ?? '' },
        overrides: [
          { provide: Clock, useValue: clock },
          { provide: REDIS_CLIENT, useValue: createRedisClient({ url: 'redis://127.0.0.1:1' }) },
        ],
      });
    });

    afterAll(async () => {
      await broken.close();
    });

    it('kod istenirse SMS_UNAVAILABLE, kod gönderilmez', async () => {
      const phone = randomTestPhone();

      const response = await request(broken.getHttpServer())
        .post(OTP_PATH)
        .send({ phone, purpose: 'login' });

      expect(response.status).toBe(503);
      expect((response.body as ErrorJson).code).toBe('SMS_UNAVAILABLE');
      expect(await outbox(phone)).toEqual([]);
    });

    it('doğrulama yapılmaz (SMS_UNAVAILABLE), deneme sayılmaz', async () => {
      const phone = randomTestPhone();
      const { challengeId } = (await requestCode(phone)).body as { challengeId: string };
      const code = await latestCode(phone);

      const error = await errorOf(
        broken.get(OtpService).verifyChallenge({ challengeId, code: wrongCode(code) }),
      );

      expect(error.code).toBe('SMS_UNAVAILABLE');
      const rows = await queryAsOwner<{ attempts: number; consumed_at: unknown }>(
        'select attempts, consumed_at from otp_challenges where id = $1',
        [challengeId],
      );
      expect(rows).toEqual([{ attempts: 0, consumed_at: null }]);
      await expect(otp.verifyChallenge({ challengeId, code })).resolves.toMatchObject({
        phoneE164: phone,
      });
    });
  });
});
