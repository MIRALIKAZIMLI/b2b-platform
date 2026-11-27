// F3.7a müşteri fiyatı kiracı izolasyonu (R30, R39; kart F3.7a-ISO). Uçlar HTTP üzerinden;
// veritabanı kuralları doğrudan SQL ile, uygulama rolü app_user (RLS'e tabi). A perakendecisi
// B perakendecisinin özel fiyatını hiçbir yoldan alamaz; başka satıcı göremez, yazamaz, silemez.
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
  activeConnection,
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

describe('F3.7a müşteri fiyatı kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyer: Buyer;
  let otherBuyer: Buyer;
  let packagingA: string;
  let packagingB: string;

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function headers(who: { admin: { userId: string }; businessId: string }) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function setup(who: Seller): Promise<string> {
    const list = await h
      .http()
      .post('/api/v1/price-lists')
      .set(await headers(who))
      .send({ name: 'Əsas', currency: 'AZN', vatIncluded: true, vatRate: '18' });
    expect(list.status, JSON.stringify(list.body)).toBe(201);
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
    const put = await h
      .http()
      .put(`/api/v1/price-lists/${(list.body as { id: string }).id}/items`)
      .set(await headers(who))
      .send({ items: [{ packagingId: packaging.id, unitPrice: '10' }] });
    expect(put.status).toBe(200);
    return packaging.id;
  }

  beforeAll(async () => {
    await runSeeds();
    const region = await newRegion('F3.7a izolasyon');
    cats = await seedCategories();
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    buyer = await newBuyer(region);
    otherBuyer = await newBuyer(region);
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    packagingA = await setup(sellerA);
    packagingB = await setup(sellerB);
    await activeConnection(sellerA, buyer, new Date());
    await activeConnection(sellerA, otherBuyer, new Date());
    await activeConnection(sellerB, otherBuyer, new Date());
    const put = await h
      .http()
      .put('/api/v1/customer-prices')
      .set(await headers(sellerA))
      .send({ buyerId: buyer.businessId, items: [{ packagingId: packagingA, unitPrice: '7' }] });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F3.7a-ISO başka satıcı A'nın müşteri fiyatını uçlarda göremez, yazamaz, silemez", async () => {
    const b = await headers(sellerB);
    const listed = await h.http().get(`/api/v1/customer-prices?buyerId=${buyer.businessId}`).set(b);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ items: [], nextCursor: null });
    const removed = await h
      .http()
      .delete(`/api/v1/customer-prices?buyerId=${buyer.businessId}&packagingId=${packagingA}`)
      .set(b);
    expect(removed.status).toBe(404);
    // B'nin bu perakendeciyle bağlantısı yok: 404.
    const noConnection = await h
      .http()
      .put('/api/v1/customer-prices')
      .set(b)
      .send({ buyerId: buyer.businessId, items: [{ packagingId: packagingB, unitPrice: '1' }] });
    expect(noConnection.status).toBe(404);
    // B'nin bağlı olduğu perakendeciye A'nın ambalajı: 422.
    const foreign = await h
      .http()
      .put('/api/v1/customer-prices')
      .set(b)
      .send({
        buyerId: otherBuyer.businessId,
        items: [{ packagingId: packagingA, unitPrice: '1' }],
      });
    expect(foreign.status).toBe(422);
    const rows = await platformRows<{ unit_price: string }>(
      `select unit_price from customer_prices where seller_id = $1`,
      [sellerA.businessId],
    );
    expect(rows).toEqual([{ unit_price: '7.0000' }]);
  });

  it("F3.7a-ISO R30: başka perakendeci (A'ya bağlı) aynı ürünün açıklamasında liste fiyatını alır, özel fiyatı değil", async () => {
    const explain = await h
      .http()
      .get(`/api/v1/prices/explain?buyerId=${otherBuyer.businessId}&packagingId=${packagingA}`)
      .set(await headers(sellerA));
    expect(explain.status).toBe(200);
    expect(explain.body).toMatchObject({
      source: 'default_list',
      unitPrice: { amount: '10.0000' },
    });
    // Perakendeci müşteri fiyatı uçlarına erişemez (yetenek seller).
    const asBuyer = await headers(buyer);
    expect(
      (await h.http().get(`/api/v1/customer-prices?buyerId=${buyer.businessId}`).set(asBuyer))
        .status,
    ).toBe(403);
  });

  it('F3.7a-ISO veritabanı: B bağlamı ve perakendeci satırları görmez; A adına yazılamaz; bileşik FK başka satıcının ambalajını reddeder', async () => {
    const count = (tx: Tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from customer_prices`);
    expect((await as(sellerB.businessId, count)).rows[0]?.n).toBe(0);
    expect((await as(sellerA.businessId, count)).rows[0]?.n).toBe(1);
    // Fiyat satırı perakendecinin kimliğini taşısa da perakendeciye politika yok.
    expect((await as(buyer.businessId, count)).rows[0]?.n).toBe(0);

    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into customer_prices (seller_id, buyer_id, packaging_id,
                                                      unit_price, valid_from)
                         values (${sellerA.businessId}, ${buyer.businessId}, ${packagingA}, 1, now())`),
        ),
      ),
    ).toBe('42501');
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into customer_prices (seller_id, buyer_id, packaging_id,
                                                      unit_price, valid_from)
                         values (${sellerB.businessId}, ${buyer.businessId}, ${packagingA}, 1, now())`),
        ),
      ),
    ).toBe('23503');
    // Perakendeci kendi adına fiyat yazamaz (kiracı koşulu `seller_id`).
    expect(
      await errorCode(() =>
        as(buyer.businessId, (tx) =>
          tx.execute(sql`insert into customer_prices (seller_id, buyer_id, packaging_id,
                                                      unit_price, valid_from)
                         values (${sellerA.businessId}, ${buyer.businessId}, ${packagingA}, 0, now())`),
        ),
      ),
    ).toBe('42501');
    const deleted = await as(sellerB.businessId, (tx) =>
      tx.execute(sql`delete from customer_prices where buyer_id = ${buyer.businessId}`),
    );
    expect(deleted.rowCount).toBe(0);
  });

  it('F3.7a-ISO platform yalnız okur (R39); politika kümesi ve arşiv tetikleyicisi bekçisi', async () => {
    const platform = <T>(fn: (tx: Tx) => Promise<T>) =>
      withPlatformTx({ userId: randomUUID() }, fn);
    const seen = await platform((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from customer_prices where seller_id = ${sellerA.businessId}`,
      ),
    );
    expect(seen.rows[0]?.n).toBe(1);
    const update = await platform((tx) =>
      tx.execute(sql`update customer_prices set unit_price = 0
                      where seller_id = ${sellerA.businessId}`),
    );
    expect(update.rowCount).toBe(0);
    const remove = await platform((tx) =>
      tx.execute(sql`delete from customer_prices where seller_id = ${sellerA.businessId}`),
    );
    expect(remove.rowCount).toBe(0);
    expect(
      await errorCode(() =>
        platform((tx) =>
          tx.execute(sql`insert into customer_prices (seller_id, buyer_id, packaging_id,
                                                      unit_price, valid_from)
                         values (${sellerA.businessId}, ${otherBuyer.businessId}, ${packagingA}, 1, now())`),
        ),
      ),
    ).toBe('42501');

    const policies = await platformRows<{ policyname: string; cmd: string; roles: string[] }>(
      `select policyname, cmd, roles::text[] as roles from pg_policies
        where tablename = 'customer_prices' order by policyname`,
    );
    expect(policies).toEqual([
      { policyname: 'customer_prices_definer_archive', cmd: 'DELETE', roles: ['migrator'] },
      { policyname: 'customer_prices_definer_select', cmd: 'SELECT', roles: ['migrator'] },
      { policyname: 'customer_prices_platform_select', cmd: 'SELECT', roles: ['public'] },
      { policyname: 'customer_prices_tenant', cmd: 'ALL', roles: ['public'] },
    ]);
    const triggers = await platformRows<{ tgenabled: string }>(
      `select tgenabled from pg_trigger
        where tgname = 'businesses_archived_clear_customer_prices'
          and tgrelid = 'businesses'::regclass`,
    );
    expect(triggers).toEqual([{ tgenabled: 'O' }]);
  });
});
