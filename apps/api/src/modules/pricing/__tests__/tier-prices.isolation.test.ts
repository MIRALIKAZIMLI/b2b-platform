// F3.9 kademeli fiyat kiracı izolasyonu (R39; kart F3.9-ISO). Uçlar HTTP üzerinden; veritabanı
// kuralları doğrudan SQL ile, uygulama rolü app_user (RLS'e tabi). Başka satıcı A'nın kademesini
// göremez, yazamaz, silemez; perakendeci tabloyu hiç göremez; platform yalnız okur.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { type Tx, withPlatformTx, withTenantTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  type Buyer,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  productBody,
  runSeeds,
  type SeedCategories,
  type Seller,
  seedCategories,
  TestHttp,
} from './pricing-fixtures';

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

describe('F3.9 kademeli fiyat kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyer: Buyer;
  let packagingA: string;
  let packagingB: string;

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function headers(who: { admin: { userId: string }; businessId: string }) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function packagingOf(who: Seller): Promise<string> {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who))
      .send(productBody(cats.child));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const packaging = (
      response.body as { variants: { packaging: { id: string; level: string }[] }[] }
    ).variants[0]?.packaging.find((item) => item.level === 'case');
    if (packaging === undefined) throw new Error('ambalaj yok');
    return packaging.id;
  }

  beforeAll(async () => {
    await runSeeds();
    const region = await newRegion('F3.9 izolasyon');
    cats = await seedCategories();
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    buyer = await newBuyer(region);
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    packagingA = await packagingOf(sellerA);
    packagingB = await packagingOf(sellerB);
    const put = await h
      .http()
      .put('/api/v1/tier-prices')
      .set(await headers(sellerA))
      .send({ packagingId: packagingA, tiers: [{ minQty: '10', discountPercent: '3' }] });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F3.9-ISO başka satıcı A'nın kademesini uçlarda göremez, yazamaz, silemez", async () => {
    const b = await headers(sellerB);
    const listed = await h
      .http()
      .get(`/api/v1/tier-prices?packagingId=${packagingA}&packagingId=${packagingB}`)
      .set(b);
    expect(listed.status).toBe(200);
    expect((listed.body as { items: unknown[] }).items).toEqual([
      { packagingId: packagingB, tiers: [] },
    ]);
    for (const tiers of [[], [{ minQty: '2', discountPercent: '50' }]]) {
      const res = await h
        .http()
        .put('/api/v1/tier-prices')
        .set(b)
        .send({ packagingId: packagingA, tiers });
      expect(res.status).toBe(404);
    }
    const rows = await platformRows<{ min_qty: string; discount_percent: string }>(
      'select min_qty, discount_percent from tier_prices where seller_id = $1',
      [sellerA.businessId],
    );
    expect(rows).toEqual([{ min_qty: '10.000', discount_percent: '3.00' }]);
  });

  it('F3.9-ISO veritabanı: B bağlamı ve perakendeci satırları görmez; A adına yazılamaz; bileşik FK başka satıcının ambalajını reddeder', async () => {
    const count = (tx: Tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from tier_prices`);
    expect((await as(sellerB.businessId, count)).rows[0]?.n).toBe(0);
    expect((await as(sellerA.businessId, count)).rows[0]?.n).toBe(1);
    expect((await as(buyer.businessId, count)).rows[0]?.n).toBe(0);

    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into tier_prices (seller_id, packaging_id, min_qty, discount_percent)
                         values (${sellerA.businessId}, ${packagingA}, 20, 5)`),
        ),
      ),
    ).toBe('42501');
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into tier_prices (seller_id, packaging_id, min_qty, discount_percent)
                         values (${sellerB.businessId}, ${packagingA}, 20, 5)`),
        ),
      ),
    ).toBe('23503');
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`update tier_prices set discount_percent = 1
                          where seller_id = ${sellerA.businessId}`),
        ),
      ),
    ).toBe('42501');
    const deleted = await as(sellerB.businessId, (tx) =>
      tx.execute(sql`delete from tier_prices where packaging_id = ${packagingA}`),
    );
    expect(deleted.rowCount).toBe(0);
  });

  it('F3.9-ISO platform yalnız okur (R39); politika kümesi bekçisi', async () => {
    const platform = <T>(fn: (tx: Tx) => Promise<T>) =>
      withPlatformTx({ userId: randomUUID() }, fn);
    const seen = await platform((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from tier_prices where seller_id = ${sellerA.businessId}`,
      ),
    );
    expect(seen.rows[0]?.n).toBe(1);
    const remove = await platform((tx) =>
      tx.execute(sql`delete from tier_prices where seller_id = ${sellerA.businessId}`),
    );
    expect(remove.rowCount).toBe(0);
    expect(
      await errorCode(() =>
        platform((tx) =>
          tx.execute(sql`insert into tier_prices (seller_id, packaging_id, min_qty, discount_percent)
                         values (${sellerA.businessId}, ${packagingA}, 30, 6)`),
        ),
      ),
    ).toBe('42501');
    const policies = await platformRows<{ policyname: string; cmd: string; roles: string[] }>(
      `select policyname, cmd, roles::text[] as roles from pg_policies
        where tablename = 'tier_prices' order by policyname`,
    );
    expect(policies).toEqual([
      { policyname: 'tier_prices_platform_select', cmd: 'SELECT', roles: ['public'] },
      { policyname: 'tier_prices_tenant', cmd: 'ALL', roles: ['public'] },
    ]);
  });
});
