// F2.16 istek süre dolumu işi (US-026 AC1–AC2, state-machines §1 `pending → expired`).
// Gerçek PostgreSQL + Redis; saat sabit (`FixedClock`). İş, worker'daki gibi elle kurulur
// (`ConnectionsWorkerModule` sağlayıcıları); AC2 için API uygulaması aynı saati kullanır.
// Dosyalar sırayla çalışır; başka dosyaların artığı süresi dolmuş istekler her testten önce
// boşaltılır, böylece sayılar yalnız bu testin satırlarıdır.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SETTING_DEFINITIONS, type SettingKey } from '@b2b/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { Clock, FixedClock } from '../../../core/clock';
import {
  OpsMetricsWriter,
  ScheduledJobRunner,
  scheduledJobLockKey,
} from '../../../core/ops-metrics';
import { OutboxWriter } from '../../../core/outbox';
import { REDIS_CLIENT, type RedisLockClient } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import type { SettingsService } from '../../settings';
import { ConnectionsRepository } from '../connections.repository';
import { EXPIRE_REQUESTS_JOB, ExpireRequestsJob } from '../jobs/expire-requests.job';
import {
  addMember,
  insertRequest,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
} from './fixtures';

// Eşzamanlı iki çalışma gerçek paralel işlem ister (setup-env havuzu tek bağlantı yapar).
process.env.DB_POOL_MAX = '6';

const NOW = new Date('2026-11-20T08:00:00Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Kilidi her zaman veren sahte Redis: kilit olmasa da veritabanının tek etkiyi koruduğunu sınar. */
const noLock: RedisLockClient = {
  set: () => Promise.resolve('OK'),
  eval: () => Promise.resolve(0),
};

describe('F2.16 istek süre dolumu işi', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const clock = new FixedClock(NOW);
  let region: string;
  let batchSize = 500;

  const settings = {
    get: (key: SettingKey): Promise<unknown> =>
      Promise.resolve(
        key === 'connection.request_expiry_batch_size'
          ? batchSize
          : SETTING_DEFINITIONS[key].default,
      ),
  };

  function job(lock: RedisLockClient = redis.client): ExpireRequestsJob {
    return new ExpireRequestsJob(
      new ConnectionsRepository(),
      new OutboxWriter(),
      settings as unknown as SettingsService,
      clock,
      new ScheduledJobRunner(lock, clock, new OpsMetricsWriter()),
    );
  }

  async function pending(
    sellerId: string,
    buyerId: string,
    sentByUserId: string,
    expiresAt: Date,
  ): Promise<string> {
    return await insertRequest({
      sellerId,
      buyerId,
      sentByUserId,
      status: 'pending',
      createdAt: new Date(expiresAt.getTime() - 14 * DAY),
      sellerLocalDate: '2026-11-01',
      expiresAt,
    });
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const [row] = await platformRows<{ status: string }>(
      'select status from connection_requests where id = $1',
      [id],
    );
    return row?.status;
  }

  async function expiredEvents(id: string) {
    return await platformRows<{
      payload: { requestId: string; sellerId: string; buyerId: string; userId: string };
      business_ids: string[];
    }>(
      `select payload, business_ids from outbox_events
        where type = 'connection.request_expired' and aggregate_id = $1 order by id`,
      [id],
    );
  }

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        { provide: Clock, useValue: clock },
      ],
    });
    region = await newRegion('Müddət');
  });

  beforeEach(async () => {
    clock.set(NOW);
    batchSize = 500;
    await job().run();
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('US-026-AC1 süresi dolan pending istek expired olur; süresi dolmayan ve yanıtlanan değişmez', async () => {
    const seller = await newSeller(region);
    const buyers = await Promise.all([newBuyer(region), newBuyer(region), newBuyer(region)]);
    const [b1, b2, b3] = buyers.map((b) => b.businessId) as [string, string, string];
    const due = await pending(
      seller.businessId,
      b1,
      seller.admin.userId,
      new Date(NOW.getTime() - MINUTE),
    );
    // Sınır: expires_at = şimdi → yanıtlanamaz (assertRespondable) → expired.
    const atBoundary = await pending(seller.businessId, b2, seller.admin.userId, NOW);
    const notYet = await pending(
      seller.businessId,
      b3,
      seller.admin.userId,
      new Date(NOW.getTime() + MINUTE),
    );
    const accepted = await insertRequest({
      sellerId: seller.businessId,
      buyerId: (await newBuyer(region)).businessId,
      sentByUserId: seller.admin.userId,
      status: 'accepted',
      createdAt: new Date(NOW.getTime() - 20 * DAY),
      respondedAt: new Date(NOW.getTime() - 19 * DAY),
      sellerLocalDate: '2026-10-31',
      expiresAt: new Date(NOW.getTime() - 6 * DAY),
    });

    const outcome = await job().run();

    expect(outcome).toEqual({ status: 'done', processed: 2 });
    expect(await statusOf(due)).toBe('expired');
    expect(await statusOf(atBoundary)).toBe('expired');
    expect(await statusOf(notYet)).toBe('pending');
    expect(await statusOf(accepted)).toBe('accepted');
    const [row] = await platformRows<{ updated_at: Date; responded_at: Date | null }>(
      'select updated_at, responded_at from connection_requests where id = $1',
      [due],
    );
    expect(row).toEqual({ updated_at: NOW, responded_at: null });

    // Saat ilerleyince bir sonraki çalışma kalanı kapatır.
    clock.advance(15 * MINUTE);
    expect(await job().run()).toEqual({ status: 'done', processed: 1 });
    expect(await statusOf(notYet)).toBe('expired');
  });

  it('US-026-AC1 toptancıya bildirim: isteği gönderen + satıcı adminleri, alıcı tarafa yok', async () => {
    const seller = await newSeller(region);
    const secondAdmin = await addMember(seller.businessId, 'seller_business_admin');
    const sender = await addMember(seller.businessId, 'seller_sales_rep');
    const otherRep = await addMember(seller.businessId, 'seller_sales_rep');
    const buyer = await newBuyer(region);
    const id = await pending(
      seller.businessId,
      buyer.businessId,
      sender.userId,
      new Date(NOW.getTime() - MINUTE),
    );

    await job().run();

    const events = await expiredEvents(id);
    expect(events.map((e) => e.payload.userId).sort()).toEqual(
      [seller.admin.userId, secondAdmin.userId, sender.userId].sort(),
    );
    expect(events.map((e) => e.payload.userId)).not.toContain(otherRep.userId);
    expect(events.map((e) => e.payload.userId)).not.toContain(buyer.admin.userId);
    for (const event of events) {
      expect(event.payload).toEqual({
        requestId: id,
        sellerId: seller.businessId,
        buyerId: buyer.businessId,
        userId: event.payload.userId,
      });
      expect(event.business_ids.sort()).toEqual([seller.businessId, buyer.businessId].sort());
    }
  });

  it('US-026-AC1 gönderen üyelikten çıkarıldıysa yalnız adminler; alıcısız istek yine expired', async () => {
    const seller = await newSeller(region);
    const sender = await addMember(seller.businessId, 'seller_sales_rep');
    await platformRows(`update memberships set status = 'removed' where id = $1`, [
      sender.membershipId,
    ]);
    const buyer = await newBuyer(region);
    const id = await pending(seller.businessId, buyer.businessId, sender.userId, NOW);

    await job().run();

    expect(await statusOf(id)).toBe('expired');
    expect((await expiredEvents(id)).map((e) => e.payload.userId)).toEqual([seller.admin.userId]);
  });

  it('US-026-AC2 süresi dolan istekten sonra toptancı yeni istek gönderir, bekleme süresi yok', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(
      seller.businessId,
      buyer.businessId,
      seller.admin.userId,
      new Date(NOW.getTime() - MINUTE),
    );
    await job().run();
    expect(await statusOf(id)).toBe('expired');

    const signed = await app
      .get(TokenService)
      .signAccess({ userId: seller.admin.userId, sessionId: randomUUID() });
    const res = await request(app.getHttpServer())
      .post('/api/v1/connection-requests')
      .set({ Authorization: `Bearer ${signed.token}`, 'X-Business-Id': seller.businessId })
      .send({ buyerId: buyer.businessId });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((res.body as { status: string }).status).toBe('pending');
  });

  it('F2.16-T1 partiler: parti boyunu aşan istekler tek çalışmada kapanır', async () => {
    batchSize = 2;
    const seller = await newSeller(region);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const buyer = await newBuyer(region);
      ids.push(await pending(seller.businessId, buyer.businessId, seller.admin.userId, NOW));
    }

    expect(await job().run()).toEqual({ status: 'done', processed: 5 });
    for (const id of ids) expect(await statusOf(id)).toBe('expired');
  });

  it('F2.16-T2 iki kopya aynı anda (aynı kilit): biri çalışır, diğeri atlar; tek etki', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller.businessId, buyer.businessId, seller.admin.userId, NOW);

    const outcomes = await Promise.all([job().run(), job().run()]);

    expect(outcomes.map((o) => o.status).sort()).toEqual(['done', 'locked']);
    expect(await statusOf(id)).toBe('expired');
    expect(await expiredEvents(id)).toHaveLength(1);
    // Kilit iş bitince bırakılır.
    expect(await redis.keys()).not.toContain(scheduledJobLockKey(EXPIRE_REQUESTS_JOB));
  });

  it('F2.16-T3 kilit olmasa da (düşmüş kilit) eşzamanlı çalışmalar her isteği bir kez kapatır', async () => {
    const seller = await newSeller(region);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const buyer = await newBuyer(region);
      ids.push(await pending(seller.businessId, buyer.businessId, seller.admin.userId, NOW));
    }
    batchSize = 2;

    const outcomes = await Promise.all([job(noLock).run(), job(noLock).run(), job(noLock).run()]);

    const processed = outcomes.map((o) => (o.status === 'done' ? o.processed : 0));
    expect(processed.reduce((a, b) => a + b, 0)).toBe(6);
    for (const id of ids) {
      expect(await statusOf(id)).toBe('expired');
      expect(await expiredEvents(id)).toHaveLength(1);
    }
  });

  it('F2.16-T4 ops_metrics son çalışma kaydı: anahtar, an ve işlenen sayı', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    await pending(seller.businessId, buyer.businessId, seller.admin.userId, NOW);
    clock.set(new Date(NOW.getTime() + 7 * MINUTE));

    await job().run();

    const [row] = await platformRows<{ measured_at: Date; value: string; labels: unknown }>(
      `select measured_at, value::text, labels from ops_metrics
        where key = 'job.connections.expire_requests' order by id desc limit 1`,
    );
    expect(row).toEqual({
      measured_at: new Date(NOW.getTime() + 7 * MINUTE),
      value: '1.0000',
      labels: null,
    });
  });

  it('F2.16-T4 kilitli çalışma ops_metrics yazmaz; iş yoksa 0 yazar', async () => {
    const count = async () =>
      (
        await platformRows<{ n: string }>(
          `select count(*)::text as n from ops_metrics where key = 'job.connections.expire_requests'`,
        )
      )[0]?.n;
    const before = Number(await count());
    await redis.client.set(scheduledJobLockKey(EXPIRE_REQUESTS_JOB), 'other', 'EX', 60);
    expect(await job().run()).toEqual({ status: 'locked' });
    expect(Number(await count())).toBe(before);
    await redis.client.del(scheduledJobLockKey(EXPIRE_REQUESTS_JOB));

    expect(await job().run()).toEqual({ status: 'done', processed: 0 });
    expect(Number(await count())).toBe(before + 1);
  });
});
