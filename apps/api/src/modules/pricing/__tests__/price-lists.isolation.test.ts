// F3.6a kiracı izolasyonu (kart F3.6a-ISO; R39). Uçlar HTTP üzerinden; veritabanı kuralları doğrudan
// SQL ile, uygulama rolü app_user (RLS'e tabi). Ayrıca K2 yarışı (arşiv ↔ bağlantıya atama) ve K9:
// F3.3a DEFINER politikaları / marka reddi tetikleyicisi bekçisi (Müfettiş 26 N2).
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

describe('F3.6a fiyat listesi kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let region: string;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyer: Buyer;
  let listA: string;
  let packagingA: string;
  let packagingB: string;

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function headers(who: { admin: { userId: string }; businessId: string }) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function casePackaging(who: Seller): Promise<string> {
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

  async function createList(who: Seller, name: string): Promise<string> {
    const response = await h
      .http()
      .post('/api/v1/price-lists')
      .set(await headers(who))
      .send({ name, currency: 'AZN', vatIncluded: true, vatRate: '18' });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return (response.body as { id: string }).id;
  }

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.6a izolasyon');
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
    listA = await createList(sellerA, 'A əsas');
    await createList(sellerB, 'B əsas');
    packagingA = await casePackaging(sellerA);
    packagingB = await casePackaging(sellerB);
    const put = await h
      .http()
      .put(`/api/v1/price-lists/${listA}/items`)
      .set(await headers(sellerA))
      .send({ items: [{ packagingId: packagingA, unitPrice: '7' }] });
    expect(put.status).toBe(200);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F3.6a-ISO başka satıcının listesi uçlarda 404: okuma, düzenleme, fiyat yazma', async () => {
    const b = await headers(sellerB);
    expect((await h.http().get(`/api/v1/price-lists/${listA}/items`).set(b)).status).toBe(404);
    expect(
      (await h.http().patch(`/api/v1/price-lists/${listA}`).set(b).send({ name: 'X' })).status,
    ).toBe(404);
    expect(
      (
        await h
          .http()
          .put(`/api/v1/price-lists/${listA}/items`)
          .set(b)
          .send({ items: [{ packagingId: packagingB, unitPrice: '1' }] })
      ).status,
    ).toBe(404);
    const listed = await h.http().get('/api/v1/price-lists').set(b);
    expect((listed.body as { items: { id: string }[] }).items.map((item) => item.id)).not.toContain(
      listA,
    );
  });

  it('F3.6a-ISO B kendi listesine A ambalajının fiyatını yazamaz (422); A müşterisi için açıklama 404', async () => {
    const listB = await createList(sellerB, 'B ikinci');
    const res = await h
      .http()
      .put(`/api/v1/price-lists/${listB}/items`)
      .set(await headers(sellerB))
      .send({ items: [{ packagingId: packagingA, unitPrice: '1' }] });
    expect(res.status).toBe(422);
    await activeConnection(sellerA, buyer, new Date());
    const explain = await h
      .http()
      .get(`/api/v1/prices/explain?buyerId=${buyer.businessId}&packagingId=${packagingA}`)
      .set(await headers(sellerB));
    expect(explain.status).toBe(404);
  });

  it('F3.6a-ISO veritabanı: B bağlamı A satırlarını görmez, yazamaz; bileşik FK başka satıcıya bağlamayı reddeder', async () => {
    const countLists = (tx: Tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from price_lists
                                     where seller_id = ${sellerA.businessId}`);
    expect((await as(sellerB.businessId, countLists)).rows[0]?.n).toBe(0);
    expect((await as(sellerA.businessId, countLists)).rows[0]?.n).toBe(1);
    expect(
      (
        await as(sellerB.businessId, (tx) =>
          tx.execute<{ n: number }>(
            sql`select count(*)::int as n from price_list_items where price_list_id = ${listA}`,
          ),
        )
      ).rows[0]?.n,
    ).toBe(0);
    // B bağlamında A adına satır: RLS WITH CHECK (42501).
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into price_list_items (price_list_id, seller_id, packaging_id,
                                                       unit_price, valid_from)
                         values (${listA}, ${sellerA.businessId}, ${packagingA}, 1, now())`),
        ),
      ),
    ).toBe('42501');
    // B kendi adına A'nın listesine veya ambalajına: bileşik FK (23503).
    const listB = await as(sellerB.businessId, (tx) =>
      tx.execute<{ id: string }>(sql`select id from price_lists where is_default`),
    );
    for (const [list, packaging] of [
      [listA, packagingB],
      [listB.rows[0]?.id, packagingA],
    ]) {
      expect(
        await errorCode(() =>
          as(sellerB.businessId, (tx) =>
            tx.execute(sql`insert into price_list_items (price_list_id, seller_id, packaging_id,
                                                         unit_price, valid_from)
                           values (${list}, ${sellerB.businessId}, ${packaging}, 1, now())`),
          ),
        ),
      ).toBe('23503');
    }
    // B bağlantısına A'nın listesi atanamaz (bileşik FK; bekçi satıcı bağlamında izin verir).
    const connectionB = await activeConnection(sellerB, await newBuyer(region), new Date());
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`update connections set price_list_id = ${listA},
                                terms_set_at = now(), terms_set_by_user_id = ${sellerB.admin.userId}
                          where id = ${connectionB}`),
        ),
      ),
    ).toBe('23503');
    // Silme izni yok (liste arşivlenir, fiyat geçmişi kalır).
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`delete from price_lists where id = ${listA}`),
        ),
      ),
    ).toBe('42501');
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`delete from price_list_items where price_list_id = ${listA}`),
        ),
      ),
    ).toBe('42501');
  });

  it('F3.6a-ISO perakendeci fiyat tablolarını hiç görmez; platform yalnız okur (R39)', async () => {
    const lists = await as(buyer.businessId, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from price_lists`),
    );
    expect(lists.rows[0]?.n).toBe(0);
    const items = await as(buyer.businessId, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from price_list_items`),
    );
    expect(items.rows[0]?.n).toBe(0);

    const platform = <T>(fn: (tx: Tx) => Promise<T>) =>
      withPlatformTx({ userId: randomUUID(), role: 'super_admin' }, fn);
    const seen = await platform((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from price_lists where id = ${listA}`,
      ),
    );
    expect(seen.rows[0]?.n).toBe(1);
    const update = await platform((tx) =>
      tx.execute(sql`update price_lists set name = 'X' where id = ${listA}`),
    );
    expect(update.rowCount).toBe(0);
    expect(
      await errorCode(() =>
        platform((tx) =>
          tx.execute(sql`insert into price_lists (id, seller_id, name, currency_code, vat_included,
                                                  vat_rate)
                         values (${randomUUID()}, ${sellerA.businessId}, 'P', 'AZN', true, 0)`),
        ),
      ),
    ).toBe('42501');
  });

  it('F3.6a-K2-CONC arşivleme ve bağlantıya atama yarışında atanmış liste arşivlenmiş kalmaz', async () => {
    const seller = await newSeller(region);
    await createList(seller, 'Əsas');
    const auth = await headers(seller);
    for (let round = 0; round < 5; round += 1) {
      const list = await createList(seller, `Yarış ${String(round)}`);
      const connection = await activeConnection(seller, await newBuyer(region), new Date());
      const [archive, assign] = await Promise.all([
        h.http().patch(`/api/v1/price-lists/${list}`).set(auth).send({ status: 'archived' }),
        h
          .http()
          .patch(`/api/v1/connections/${connection}/terms`)
          .set(auth)
          .send({ priceListId: list }),
      ]);
      const [row] = await platformRows<{ status: string; assigned: number }>(
        `select l.status,
                (select count(*)::int from connections c
                  where c.price_list_id = l.id and c.status = 'active') as assigned
           from price_lists l where l.id = $1`,
        [list],
      );
      // Biri kazanır: arşivlendiyse atama 422, atandıysa arşiv 409.
      expect([archive.status, assign.status].sort()).toEqual(
        row?.status === 'archived' ? [200, 422] : [200, 409],
      );
      expect(row?.status === 'archived' && row.assigned > 0).toBe(false);
    }
  });

  it('F3.6a-K9 bekçi: products DEFINER politikaları yalnız migrator; marka reddi tetikleyicisi etkin (Müfettiş 26 N2)', async () => {
    const policies = await platformRows<{ policyname: string; roles: string[] }>(
      `select policyname, roles::text[] as roles from pg_policies
        where tablename = 'products' and policyname like 'products_definer_%'
        order by policyname`,
    );
    expect(policies).toEqual([
      { policyname: 'products_definer_brand_clear', roles: ['migrator'] },
      { policyname: 'products_definer_select', roles: ['migrator'] },
    ]);
    const triggers = await platformRows<{ tgenabled: string }>(
      `select tgenabled from pg_trigger
        where tgname = 'brands_rejected_clear_products' and tgrelid = 'brands'::regclass`,
    );
    expect(triggers).toEqual([{ tgenabled: 'O' }]);
  });
});
