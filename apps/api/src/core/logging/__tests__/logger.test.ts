import { Public } from '../../auth/access-decorators';
import { Controller, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DrizzleQueryError } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, LogCapture } from '../../../../test/http-app';
import { buildPinoOptions } from '../logger.module';
import { maskPhone } from '../mask-phone';

const PHONE = '+994501234567';
const MASKED = '+99450***4567';

function captureLogger(): { logger: pino.Logger; capture: LogCapture } {
  const capture = new LogCapture();
  const logger = pino(
    buildPinoOptions({ service: 'api', env: { APP_ENV: 'test', LOG_LEVEL: 'info' } }),
    capture,
  );
  return { logger, capture };
}

@Controller('test-logging')
class LoggingTestController {
  constructor(@InjectPinoLogger('LoggingTestController') private readonly logger: PinoLogger) {}

  @Public()
  @Post()
  create(): { ok: true } {
    this.logger.info({ event: 'test.created' }, 'kayıt oluşturuldu');
    return { ok: true };
  }
}

describe('maskPhone', () => {
  it('F1.2-AC2: telefon maskelenir (+994501234567 → +99450***4567)', () => {
    expect(maskPhone(PHONE)).toBe(MASKED);
  });

  it('kısa veya beklenmeyen değer tamamen gizlenir', () => {
    expect(maskPhone('12345')).toBe('***');
    expect(maskPhone('')).toBe('***');
  });
});

describe('Logger redaksiyonu', () => {
  it('F1.2-AC2: telefon alanları logda maskeli', () => {
    const { logger, capture } = captureLogger();

    logger.info(
      { phone_e164: PHONE, user: { phoneE164: PHONE, profile: { phone: PHONE } } },
      'telefon',
    );

    const text = capture.text();
    expect(text).not.toContain(PHONE);
    const [line] = capture.lines();
    expect(line?.phone_e164).toBe(MASKED);
    expect(line?.user).toEqual({ phoneE164: MASKED, profile: { phone: MASKED } });
  });

  it('F1.7: person_data alanları (contact_name, personal_phone, email) logda yok', () => {
    const { logger, capture } = captureLogger();

    logger.info(
      {
        contact_name: 'Əli Məmmədov',
        personal_phone: PHONE,
        email: 'ali@example.az',
        person: { contactName: 'Əli Məmmədov', personalPhone: PHONE },
      },
      'kişisel veri',
    );

    const text = capture.text();
    expect(text).not.toContain('Məmmədov');
    expect(text).not.toContain('ali@example.az');
    expect(text).not.toContain(PHONE);
    const [line] = capture.lines();
    expect(line?.contact_name).toBe('[REDACTED]');
    expect(line?.email).toBe('[REDACTED]');
    expect(line?.personal_phone).toBe(MASKED);
    expect(line?.person).toEqual({ contactName: '[REDACTED]', personalPhone: MASKED });
  });

  it('F1.2-AC2: code, token, authorization ve diğer gizli alanlar redakte', () => {
    const { logger, capture } = captureLogger();
    const secrets = {
      code: '123456',
      otp: '654321',
      token: 'tok-secret',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      authorization: 'Bearer jwt-secret',
      cookie: 'sid=cookie-secret',
      password: 'pw-secret',
      secret: 'totp-secret',
    };

    logger.info({ ...secrets, nested: { ...secrets }, deep: { inner: { ...secrets } } }, 'gizli');

    const text = capture.text();
    for (const value of Object.values(secrets)) {
      expect(text).not.toContain(value);
    }
    const [line] = capture.lines();
    expect(line?.code).toBe('[REDACTED]');
    expect((line?.nested as Record<string, unknown>).authorization).toBe('[REDACTED]');
  });

  it('zorunlu alanlar: time (ISO), level (metin), service, env', () => {
    const { logger, capture } = captureLogger();

    logger.info('merhaba');

    const [line] = capture.lines();
    expect(line).toMatchObject({ level: 'info', service: 'api', env: 'test', msg: 'merhaba' });
    expect(String(line?.time)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(line).not.toHaveProperty('pid');
    expect(line).not.toHaveProperty('hostname');
  });
});

describe('Güvenli hata serileştirici', () => {
  const OTP = '483920';

  function dbError(): DrizzleQueryError {
    const pgError = Object.assign(
      new Error(`duplicate key value violates unique constraint (phone)=(${PHONE})`),
      {
        name: 'error',
        code: '23505',
        detail: `Key (phone_e164)=(${PHONE}) already exists.`,
      },
    );
    return new DrizzleQueryError(
      'insert into "otp_codes" ("phone_e164", "code") values ($1, $2)',
      [PHONE, OTP],
      pgError,
    );
  }

  it('F1.2-AC2: telefon ve kod içeren DrizzleQueryError loglanınca ikisi de çıktıda yok', () => {
    const { logger, capture } = captureLogger();

    logger.error({ err: dbError() }, 'unexpected error');

    const text = capture.text();
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain('994501234567');
    expect(text).not.toContain(OTP);
    expect(text).not.toContain('already exists');
    expect(text).not.toContain('Failed query');
  });

  it('yalnızca hata adı, SQLSTATE, yer tutuculu SQL ve mesajsız stack yazılır', () => {
    const { logger, capture } = captureLogger();

    logger.error({ err: dbError() }, 'unexpected error');

    const [line] = capture.lines();
    const err = line?.err as Record<string, unknown>;
    expect(err.type).toBe('DrizzleQueryError');
    expect(err.query).toBe('insert into "otp_codes" ("phone_e164", "code") values ($1, $2)');
    expect(err).not.toHaveProperty('message');
    expect(err).not.toHaveProperty('params');
    expect(String(err.stack)).toMatch(/^\s+at /);
    const cause = err.cause as Record<string, unknown>;
    expect(cause.sqlState).toBe('23505');
    expect(cause).not.toHaveProperty('detail');
    expect(cause).not.toHaveProperty('message');
  });
});

describe('HTTP istek logu', () => {
  let app: NestFastifyApplication;
  const logs = new LogCapture();

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [LoggingTestController],
      env: { LOG_LEVEL: 'info' },
      logStream: logs,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('F1.2-AC2: istek gövdesi, başlıklar ve sorgu dizesi loglanmaz', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-logging?phone=%2B994501234567')
      .set('Authorization', 'Bearer header-jwt-secret')
      .set('Cookie', 'sid=header-cookie-secret')
      .set('X-Request-Id', 'log-test-req-0001')
      .send({ code: 'body-otp-999111', phone: PHONE, password: 'body-pw-secret' });

    expect(response.status).toBe(201);
    const text = logs.text();
    for (const value of [
      'body-otp-999111',
      'body-pw-secret',
      'header-jwt-secret',
      'header-cookie-secret',
      PHONE,
      '994501234567',
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it('erişim logunda requestId, method, route, status, durationMs var', () => {
    // İstek içindeki log ve erişim logu, yanıttaki X-Request-Id ile aynı kimliği taşır.
    const requestId = logs.lines().find((line) => line.event === 'test.created')?.requestId;
    expect(requestId).toBe('log-test-req-0001');

    const access = logs.lines().find((line) => line.status === 201);
    expect(access).toMatchObject({
      service: 'api',
      env: 'test',
      requestId,
      method: 'POST',
      route: '/test-logging',
      status: 201,
    });
    expect(typeof access?.durationMs).toBe('number');
  });
});
