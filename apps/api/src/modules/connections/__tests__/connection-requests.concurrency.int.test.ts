// F2.12a eşzamanlılık (test-strategy §3.2, R23, SF-03 hata tablosu): gerçek PostgreSQL, çok
// bağlantılı havuz, paralel istekler. Aynı çift → yalnız biri (kısmi benzersiz indeks + kota
// kilidi); kota sınırında → yalnız kota kadar (satıcı başına advisory lock, Mimar K5).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { newBuyer, newRegion, newSeller, platformRows, runSeeds, type Seller } from './fixtures';

// setup-env havuzu tek bağlantıya indirir; bu dosya gerçek paralel işlem için açar (havuz ilk
// kullanımda kurulur, setup'tan sonra burada okunur).
process.env.DB_POOL_MAX = '6';

const PARALLEL = 5;

describe('F2.12a bağlantı isteği eşzamanlılığı', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let region: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    region = await newRegion('Paralel');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function sendAll(seller: Seller, buyerIds: readonly string[]): Promise<number[]> {
    const signed = await app
      .get(TokenService)
      .signAccess({ userId: seller.admin.userId, sessionId: randomUUID() });
    const headers = {
      Authorization: `Bearer ${signed.token}`,
      'X-Business-Id': seller.businessId,
    };
    const responses = await Promise.all(
      buyerIds.map((buyerId) =>
        request(app.getHttpServer())
          .post('/api/v1/connection-requests')
          .set(headers)
          .send({ buyerId }),
      ),
    );
    return responses.map((res) => res.status).sort();
  }

  it('§3.2 aynı çifte eşzamanlı istekler: yalnız biri 201, diğerleri 409', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const statuses = await sendAll(seller, Array<string>(PARALLEL).fill(buyer.businessId));
    expect(statuses).toEqual([201, ...Array<number>(PARALLEL - 1).fill(409)]);
    const rows = await platformRows(
      `select 1 from connection_requests where seller_id = $1 and buyer_id = $2`,
      [seller.businessId, buyer.businessId],
    );
    expect(rows).toHaveLength(1);
  });

  it('§3.2 kota sınırında eşzamanlı istekler: kota kadarı 201, kalanı 429', async () => {
    const seller = await newSeller(region);
    await platformRows(
      `insert into entitlement_overrides (business_id, key, value)
       values ($1, 'connection_requests.daily', '2'::jsonb)`,
      [seller.businessId],
    );
    const buyers: string[] = [];
    for (let i = 0; i < PARALLEL; i++) buyers.push((await newBuyer(region)).businessId);
    const statuses = await sendAll(seller, buyers);
    expect(statuses).toEqual([201, 201, ...Array<number>(PARALLEL - 2).fill(429)]);
    const rows = await platformRows(`select 1 from connection_requests where seller_id = $1`, [
      seller.businessId,
    ]);
    expect(rows).toHaveLength(2);
  });
});
