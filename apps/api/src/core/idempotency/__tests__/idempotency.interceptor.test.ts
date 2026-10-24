// İdempotens interceptor'ının veritabanına gitmeden verdiği kararlar (birim).
// Test ortamında DATABASE_URL ulaşılamaz bir adrestir: bu testler veritabanına gitseydi hata alırdı.
import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import type { RequestUser } from '../../request-user';

interface ErrorJson {
  readonly code?: string;
  readonly details?: unknown;
}

const calls = { post: 0, get: 0 };

@Injectable()
class FakeUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown>; user?: RequestUser }>();
    const id = req.headers['x-test-user'];
    if (typeof id === 'string') req.user = { id };
    return true;
  }
}

@Controller('test-idem-unit')
@UseGuards(FakeUserGuard)
class IdemUnitController {
  @Post('items')
  create(): { n: number } {
    calls.post += 1;
    return { n: calls.post };
  }

  @Get('items')
  list(): { n: number } {
    calls.get += 1;
    return { n: calls.get };
  }
}

const USER = '0193a1b2-0000-7000-8000-0000000000aa';

describe('IdempotencyInterceptor (birim, veritabanısız)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [IdemUnitController], providers: [FakeUserGuard] });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    calls.post = 0;
    calls.get = 0;
  });

  it('F1.2-AC3b: 15 karakterlik anahtar → 422 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-idem-unit/items')
      .set('x-test-user', USER)
      .set('Idempotency-Key', 'a'.repeat(15))
      .send({});

    expect(res.status).toBe(422);
    expect((res.body as ErrorJson).code).toBe('VALIDATION_FAILED');
    expect(Object.keys((res.body as ErrorJson).details as object)).toEqual(['Idempotency-Key']);
    expect(calls.post).toBe(0);
  });

  it('F1.2-AC3b: 65 karakterlik anahtar → 422 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-idem-unit/items')
      .set('x-test-user', USER)
      .set('Idempotency-Key', 'a'.repeat(65))
      .send({});

    expect(res.status).toBe(422);
    expect((res.body as ErrorJson).code).toBe('VALIDATION_FAILED');
    expect(calls.post).toBe(0);
  });

  it('F1.2-AC3b: kimliksiz istekte başlık yok sayılır (R13)', async () => {
    const key = 'k'.repeat(20);
    const first = await request(app.getHttpServer())
      .post('/test-idem-unit/items')
      .set('Idempotency-Key', key)
      .send({});
    const second = await request(app.getHttpServer())
      .post('/test-idem-unit/items')
      .set('Idempotency-Key', 'x'.repeat(3))
      .send({});

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(calls.post).toBe(2);
  });

  it('K4: POST dışı istekte başlık yok sayılır', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-idem-unit/items')
      .set('x-test-user', USER)
      .set('Idempotency-Key', 'x'.repeat(3));

    expect(res.status).toBe(200);
    expect(calls.get).toBe(1);
  });

  it('K4: başlık yoksa interceptor devreye girmez', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-idem-unit/items')
      .set('x-test-user', USER)
      .send({});

    expect(res.status).toBe(201);
    expect(calls.post).toBe(1);
  });
});
