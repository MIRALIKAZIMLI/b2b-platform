import { Public } from '../../auth/access-decorators';
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TEST_SERVER_ENV } from '../../../../test/env';
import { createTestApp, LogCapture } from '../../../../test/http-app';
import { Clock } from '../../clock';
import { closeDb } from '../../db/client';
import { DomainError } from '../domain-error';
import { ERROR_MESSAGE_RESOLVER, type ErrorMessageResolver } from '../error-message.port';

const createSchema = z.object({ name: z.string().min(1), qty: z.number().int() }).strict();

// Yalnızca test için: her hata türünü üreten uçlar.
@Controller('test-errors')
class ErrorsTestController {
  @Public()
  @Get('domain')
  domain(): never {
    throw new DomainError('CONNECTION_NOT_ACTIVE', { connectionId: 'c-1' });
  }

  @Public()
  @Get('domain-no-details')
  domainNoDetails(): never {
    throw new DomainError('NOT_FOUND');
  }

  @Public()
  @Post('zod')
  zod(@Body() body: unknown): { ok: true } {
    createSchema.parse(body);
    return { ok: true };
  }

  @Public()
  @Get('boom')
  boom(): never {
    throw new Error('gizli-ic-ayrinti: veritabanı şifresi yanlış');
  }
}

// @Inject() açık: Vitest dekoratör metadata'sı üretmez (açık soru S8).
@Controller('test-inject')
class InjectProbeController {
  constructor(@Inject(Clock) private readonly clock: Clock) {}

  @Public()
  @Get()
  probe(): { ok: boolean } {
    return { ok: this.clock.now() instanceof Date };
  }
}

const ERROR_BODY_KEYS = ['code', 'message', 'requestId'];

describe('Global hata filtresi', () => {
  let app: NestFastifyApplication;
  const logs = new LogCapture();

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [ErrorsTestController],
      env: { LOG_LEVEL: 'info' },
      logStream: logs,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('F1.2-AC1: DomainError → eşlenen durum + Error gövdesi', async () => {
    const response = await request(app.getHttpServer()).get('/test-errors/domain');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'CONNECTION_NOT_ACTIVE',
      message: 'CONNECTION_NOT_ACTIVE',
      requestId: response.headers['x-request-id'],
      details: { connectionId: 'c-1' },
    });
  });

  it('F1.2-AC1: details yoksa gövdede details alanı olmaz', async () => {
    const response = await request(app.getHttpServer()).get('/test-errors/domain-no-details');

    expect(response.status).toBe(404);
    expect(Object.keys(response.body as object).sort()).toEqual([...ERROR_BODY_KEYS].sort());
  });

  it('F1.2-AC1: Zod hatası → 422 VALIDATION_FAILED + alan listesi', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-errors/zod')
      .send({ name: '', qty: 1.5, extra: true });

    expect(response.status).toBe(422);
    const body = response.body as { code: string; requestId: string; details: object };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.requestId).toBe(response.headers['x-request-id']);
    // Bilinmeyen alan (strict) da kendi adıyla listelenir.
    expect(Object.keys(body.details).sort()).toEqual(['extra', 'name', 'qty']);
  });

  it('F1.2-AC1: bilinmeyen hata → 500 INTERNAL_ERROR, ayrıntı gövdede yok', async () => {
    const response = await request(app.getHttpServer()).get('/test-errors/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'INTERNAL_ERROR',
      requestId: response.headers['x-request-id'],
    });
    expect(response.text).not.toContain('gizli-ic-ayrinti');
    // Ayrıntı (hata tipi ve stack) yalnızca logda, aynı requestId ile. Hata mesajı
    // kişisel veri taşıyabildiği için logda da yazılmaz (güvenli serileştirici).
    const errorLog = logs.lines().find((line) => line.level === 'error');
    expect(errorLog?.requestId).toBe(response.headers['x-request-id']);
    const err = errorLog?.err as Record<string, unknown>;
    expect(err.type).toBe('Error');
    expect(String(err.stack)).toContain('ErrorsTestController.boom');
    expect(JSON.stringify(errorLog)).not.toContain('gizli-ic-ayrinti');
  });

  it('F1.2-AC1: bilinmeyen yol → 404 NOT_FOUND, Error gövdesi', async () => {
    const response = await request(app.getHttpServer()).get('/yok-boyle-bir-yol');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: 'NOT_FOUND',
      requestId: response.headers['x-request-id'],
    });
  });

  it('F1.2-AC1: bozuk JSON gövdesi → 422 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-errors/zod')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(422);
    expect((response.body as { code: string }).code).toBe('VALIDATION_FAILED');
  });
});

describe('Bağımlılık enjeksiyonu', () => {
  it('@Inject() açık yazılınca Clock Vitest altında da enjekte edilir', async () => {
    const app = await createTestApp({ controllers: [InjectProbeController] });
    try {
      const response = await request(app.getHttpServer()).get('/test-inject');
      expect(response.body).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });
});

describe('Hata mesajı dili (F1.3)', () => {
  it('F1.3-AC8: message, çözücünün Accept-Language için döndürdüğü metindir', async () => {
    const calls: [string, string | undefined][] = [];
    const resolver: ErrorMessageResolver = {
      resolve: (code, acceptLanguage) => {
        calls.push([code, acceptLanguage]);
        return Promise.resolve(`[${acceptLanguage ?? '-'}] ${code}`);
      },
    };
    const app = await createTestApp({
      controllers: [ErrorsTestController],
      overrides: [{ provide: ERROR_MESSAGE_RESOLVER, useValue: resolver }],
    });
    try {
      const response = await request(app.getHttpServer())
        .get('/test-errors/domain-no-details')
        .set('Accept-Language', 'ru');

      expect(response.status).toBe(404);
      expect((response.body as { message: string }).message).toBe('[ru] NOT_FOUND');
      expect(calls).toEqual([['NOT_FOUND', 'ru']]);
    } finally {
      await app.close();
    }
  });

  it('F1.3-AC8 (D3): çözücü hata atsa bile Error gövdesi döner, message = kod', async () => {
    const resolver: ErrorMessageResolver = {
      resolve: () => Promise.reject(new Error('beklenmeyen')),
    };
    const app = await createTestApp({
      controllers: [ErrorsTestController],
      overrides: [{ provide: ERROR_MESSAGE_RESOLVER, useValue: resolver }],
    });
    try {
      const response = await request(app.getHttpServer()).get('/test-errors/domain');

      expect(response.status).toBe(403);
      expect((response.body as { message: string }).message).toBe('CONNECTION_NOT_ACTIVE');
    } finally {
      await app.close();
    }
  });

  it('F1.3-AC8 (D3): veritabanına ulaşılamıyorsa hata yanıtı yine döner, message = kod', async () => {
    // Birim testi uygulaması gerçek I18nModule ile açılır; veritabanı adresi erişilemez.
    vi.stubEnv('DATABASE_URL', TEST_SERVER_ENV.DATABASE_URL);
    const app = await createTestApp({ controllers: [ErrorsTestController] });
    try {
      const response = await request(app.getHttpServer())
        .get('/test-errors/domain-no-details')
        .set('Accept-Language', 'ru');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        code: 'NOT_FOUND',
        message: 'NOT_FOUND',
        requestId: response.headers['x-request-id'],
      });
    } finally {
      await app.close();
      await closeDb();
      vi.unstubAllEnvs();
    }
  });
});
