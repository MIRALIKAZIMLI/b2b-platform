// İdempotens (F1.2-AC3, F1.2-AC3b, F1.2-AC10): gerçek PostgreSQL (app_user) + Redis.
// Kimlik F1.5'te gelir; testte sahte bir guard `x-test-user` başlığından `request.user` yazar.
import { Public } from '../../auth/access-decorators';
import { randomUUID } from 'node:crypto';
import {
  Body,
  type CanActivate,
  Controller,
  type ExecutionContext,
  HttpCode,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { Clock, FixedClock } from '../../clock';
import { withSystemTx } from '../../db';
import { DomainError } from '../../errors/domain-error';
import type { RequestUser } from '../../request-user';

interface ErrorJson {
  readonly code?: string;
  readonly details?: unknown;
}

const counters = { created: 0, accepted: 0, failed: 0, slow: 0 };

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** `slow` ucu: girişte `entered` çözülür, `release` çözülene kadar bekler. */
const slowGate: { entered: Deferred; release: Deferred } = {
  entered: deferred(),
  release: deferred(),
};

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

@Controller('test-idem')
@UseGuards(FakeUserGuard)
class IdemTestController {
  @Public()
  @Post('items')
  create(@Body() body: unknown): { n: number; body: unknown } {
    counters.created += 1;
    return { n: counters.created, body };
  }

  @Public()
  @Post('accept')
  @HttpCode(200)
  accept(): { n: number } {
    counters.accepted += 1;
    return { n: counters.accepted };
  }

  @Public()
  @Post('fail')
  fail(): never {
    counters.failed += 1;
    throw new DomainError('NOT_FOUND');
  }

  @Public()
  @Post('slow')
  async slow(): Promise<{ n: number }> {
    counters.slow += 1;
    const n = counters.slow;
    const gate = slowGate.release;
    slowGate.entered.resolve();
    await gate.promise;
    return { n };
  }
}

async function rowsFor(key: string): Promise<{ user_id: string; status_code: number | null }[]> {
  return queryAsOwner<{ user_id: string; status_code: number | null }>(
    'select user_id, status_code from idempotency_keys where key = $1 order by user_id',
    [key],
  );
}

function newKey(): string {
  return `test-${randomUUID()}`;
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

describe('İdempotens (entegrasyon: PostgreSQL + Redis)', () => {
  let app: NestFastifyApplication;
  const clock = new FixedClock(new Date('2026-10-24T10:00:00.000Z'));
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [IdemTestController],
      providers: [FakeUserGuard],
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: Clock, useValue: clock }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    counters.created = 0;
    counters.accepted = 0;
    counters.failed = 0;
    counters.slow = 0;
    slowGate.entered = deferred();
    slowGate.release = deferred();
  });

  function post(path: string, key: string, user: string = userA): request.Test {
    return request(app.getHttpServer())
      .post(`/test-idem/${path}`)
      .set('x-test-user', user)
      .set('Idempotency-Key', key);
  }

  it('F1.2-AC3: aynı anahtar → aynı durum + gövde, tek kayıt', async () => {
    const key = newKey();
    const first = await post('items', key).send({ name: 'a', qty: 2 });
    const second = await post('items', key).send({ qty: 2, name: 'a' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(counters.created).toBe(1);
    expect(await rowsFor(key)).toEqual([{ user_id: userA, status_code: 201 }]);
  });

  it('F1.2-AC3: saklanan yanıt gerçek durum kodunu taşır (200)', async () => {
    const key = newKey();
    const first = await post('accept', key).send({});
    const second = await post('accept', key).send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ n: 1 });
    expect(counters.accepted).toBe(1);
    expect(await rowsFor(key)).toEqual([{ user_id: userA, status_code: 200 }]);
  });

  it('F1.2-AC3b: aynı anahtar, farklı gövde → 409 IDEMPOTENCY_CONFLICT', async () => {
    const key = newKey();
    await post('items', key).send({ name: 'a' });
    const res = await post('items', key).send({ name: 'b' });

    expect(res.status).toBe(409);
    expect((res.body as ErrorJson).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(counters.created).toBe(1);
  });

  it('F1.2-AC3b: aynı anahtar, farklı X-Business-Id → 409', async () => {
    const key = newKey();
    await post('items', key).set('X-Business-Id', randomUUID()).send({ name: 'a' });
    const res = await post('items', key).set('X-Business-Id', randomUUID()).send({ name: 'a' });

    expect(res.status).toBe(409);
    expect((res.body as ErrorJson).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(counters.created).toBe(1);
  });

  it('F1.2-AC3b: aynı anahtar, farklı uç nokta veya sorgu dizesi → 409', async () => {
    const key = newKey();
    await post('items', key).send({});
    const otherEndpoint = await post('accept', key).send({});
    const otherQuery = await request(app.getHttpServer())
      .post('/test-idem/items?x=1')
      .set('x-test-user', userA)
      .set('Idempotency-Key', key)
      .send({});

    expect(otherEndpoint.status).toBe(409);
    expect(otherQuery.status).toBe(409);
    expect(counters.accepted).toBe(0);
    expect(counters.created).toBe(1);
  });

  it('F1.2-AC3b: farklı kullanıcının aynı anahtarı çakışmaz', async () => {
    const key = newKey();
    const a = await post('items', key, userA).send({ name: 'a' });
    const b = await post('items', key, userB).send({ name: 'a' });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body).not.toEqual(a.body);
    expect(counters.created).toBe(2);
    expect((await rowsFor(key)).length).toBe(2);
  });

  it('F1.2-AC3b: süresi dolmuş anahtar yeni istek sayılır', async () => {
    const key = newKey();
    const first = await post('items', key).send({ name: 'a' });
    clock.advance(24 * 60 * 60 * 1000 + 1000);
    const second = await post('items', key).send({ name: 'b' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ n: 2, body: { name: 'b' } });
    expect(counters.created).toBe(2);
    expect(await rowsFor(key)).toEqual([{ user_id: userA, status_code: 201 }]);
  });

  it('F1.2-AC3b: süresi dolmamış anahtar (23 saat) aynı yanıtı döner', async () => {
    const key = newKey();
    const first = await post('items', key).send({ name: 'a' });
    clock.advance(23 * 60 * 60 * 1000);
    const second = await post('items', key).send({ name: 'a' });

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(counters.created).toBe(1);
  });

  it('F1.2-AC3b: eşzamanlı iki istek → ikincisi 409 in_progress, tekrar denemede ilk yanıt', async () => {
    const key = newKey();

    const firstPromise = post('slow', key)
      .send({})
      .then((res) => res);
    await slowGate.entered.promise;
    const concurrent = await post('slow', key).send({});
    slowGate.release.resolve();
    const first = await firstPromise;
    const retry = await post('slow', key).send({});

    expect(concurrent.status).toBe(409);
    expect((concurrent.body as ErrorJson).code).toBe('IDEMPOTENCY_CONFLICT');
    expect((concurrent.body as ErrorJson).details).toEqual({ reason: 'in_progress' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(counters.slow).toBe(1);
  });

  it('K2: kilidi süresi geçmiş (sahipsiz) kayıt yeni istekle işlenir', async () => {
    const key = newKey();

    const firstGate = slowGate.release;
    const firstPromise = post('slow', key)
      .send({})
      .then((res) => res);
    await slowGate.entered.promise;

    clock.advance(61 * 1000);
    slowGate.entered = deferred();
    slowGate.release = deferred();
    const secondPromise = post('slow', key)
      .send({})
      .then((res) => res);
    await slowGate.entered.promise;

    slowGate.release.resolve();
    const second = await secondPromise;
    firstGate.resolve();
    const first = await firstPromise;

    expect(second.status).toBe(201);
    expect(second.body).toEqual({ n: 2 });
    expect(first.status).toBe(201);
    expect(counters.slow).toBe(2);
    // Saklanan yanıt, kilidi devralan isteğin yanıtıdır.
    const replay = await post('slow', key).send({});
    expect(replay.body).toEqual({ n: 2 });
  });

  it('K3: handler hatası → kayıt kalmaz, aynı anahtarla tekrar denenebilir', async () => {
    const key = newKey();
    const first = await post('fail', key).send({});
    const second = await post('fail', key).send({});

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(counters.failed).toBe(2);
    expect(await rowsFor(key)).toEqual([]);
  });

  it('F1.2-AC10: app_user idempotency_keys tablosunu doğrudan okuyamaz → 42501', async () => {
    const error = await errorOf(
      withSystemTx((tx) => tx.execute(sql`select * from idempotency_keys`)),
    );
    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.2-AC10: app_user idempotency_keys tablosuna doğrudan yazamaz → 42501', async () => {
    const error = await errorOf(
      withSystemTx((tx) =>
        tx.execute(sql`
          insert into idempotency_keys (key, user_id, endpoint, request_hash, expires_at)
          values ('k', ${randomUUID()}::uuid, 'e', 'h', now())
        `),
      ),
    );
    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });
});
