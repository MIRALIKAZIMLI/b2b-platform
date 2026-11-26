// F3.3a kiracı izolasyonu (R26 hazırlığı, R39; kart F3.3a-ISO, F3.3a-S3). Uçlar HTTP üzerinden;
// veritabanı kuralları doğrudan SQL ile, uygulama rolü app_user (RLS'e tabi).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  activeConnection,
  type Buyer,
  newBuyer,
  newCategory,
  newRegion,
  newSeller,
  TestHttp,
  productBody,
  runSeeds,
  type SeedCategories,
  type Seller,
  seedCategories,
  sku,
} from './product-fixtures';

const PRODUCT_TABLES = ['products', 'product_variants', 'product_packaging', 'product_visibility'];

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

interface ProductJson {
  id: string;
  variants: { id: string; packaging: { id: string }[] }[];
}

describe('F3.3a ürün kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let region: string;
  let cats: SeedCategories;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyer: Buyer;
  let productA: ProductJson;

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function headers(who: { admin: { userId: string }; businessId: string }) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function createProduct(who: Seller, overrides: Record<string, unknown> = {}) {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who))
      .send(productBody(cats.child, overrides));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as ProductJson;
  }

  async function counts(tx: Tx): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const table of PRODUCT_TABLES) {
      const result = await tx.execute<{ n: number }>(
        sql.raw(`select count(*)::int as n from ${table}`),
      );
      out[table] = result.rows[0]?.n ?? -1;
    }
    return out;
  }

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    region = await newRegion('F3.3a izolasyon');
    cats = await seedCategories();
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    buyer = await newBuyer(region);
    await activeConnection(sellerA, buyer, new Date());
    productA = await createProduct(sellerA, { visibility: { regionIds: [region] } });
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F3.3a-ISO başka toptancı A'nın ürününü okuyamaz, değiştiremez, listede görmez (404)", async () => {
    const asB = await headers(sellerB);
    expect((await h.http().get(`/api/v1/products/${productA.id}`).set(asB)).status).toBe(404);
    const patched = await h
      .http()
      .patch(`/api/v1/products/${productA.id}`)
      .set(asB)
      .send({ name: { az: 'Ele geçir' } });
    expect(patched.status).toBe(404);
    expect(
      (
        await h
          .http()
          .patch(`/api/v1/products/${productA.id}`)
          .set(asB)
          .send({ status: 'archived' })
      ).status,
    ).toBe(404);
    const list = await h.http().get('/api/v1/products').set(asB);
    expect((list.body as { items: { id: string }[] }).items.map((item) => item.id)).not.toContain(
      productA.id,
    );
  });

  it('F3.3a-ISO bağlı perakendeci bile API ile ürün tablolarına ulaşamaz (403)', async () => {
    const asBuyer = await headers(buyer);
    expect((await h.http().get(`/api/v1/products/${productA.id}`).set(asBuyer)).status).toBe(403);
    expect((await h.http().get('/api/v1/products').set(asBuyer)).status).toBe(403);
    expect(
      (
        await h
          .http()
          .patch(`/api/v1/products/${productA.id}`)
          .set(asBuyer)
          .send({ status: 'archived' })
      ).status,
    ).toBe(403);
  });

  it('F3.3a-ISO doğrudan SQL: perakendeci, başka satıcı ve bağlamsız çağrı 4 tabloda 0 satır görür', async () => {
    const own = await as(sellerA.businessId, counts);
    for (const table of PRODUCT_TABLES) expect(own[table], table).toBeGreaterThan(0);
    const zero = Object.fromEntries(PRODUCT_TABLES.map((table) => [table, 0]));
    expect(await as(buyer.businessId, counts)).toEqual(zero);
    const b = await as(sellerB.businessId, counts);
    const sql0 = await withSystemTx(counts);
    expect(sql0).toEqual(zero);
    // B kendi ürünü yokken 0; varsa yalnız kendi satırları.
    expect(b.products).toBe(0);
  });

  it("F3.3a-ISO B bağlamında A'nın ürününe çocuk satır eklenemez; A'nın satırı güncellenemez", async () => {
    const variantId = productA.variants[0]?.id ?? '';
    const insertVariant = (tx: Tx) =>
      tx.execute(sql`insert into product_variants (id, product_id, seller_id, sku)
                     values (${randomUUID()}, ${productA.id}, ${sellerB.businessId}, ${sku('X')})`);
    // seller_id = B → bileşik FK (A'nın ürünü B'de yok) 23503.
    expect(await errorCode(() => as(sellerB.businessId, insertVariant))).toBe('23503');
    const insertAsA = (tx: Tx) =>
      tx.execute(sql`insert into product_variants (id, product_id, seller_id, sku)
                     values (${randomUUID()}, ${productA.id}, ${sellerA.businessId}, ${sku('X')})`);
    // seller_id = A → RLS WITH CHECK 42501.
    expect(await errorCode(() => as(sellerB.businessId, insertAsA))).toBe('42501');
    const insertPackaging = (tx: Tx) =>
      tx.execute(sql`insert into product_packaging (id, variant_id, seller_id, level, unit_code, base_qty)
                     values (${randomUUID()}, ${variantId}, ${sellerB.businessId}, 'inner', 'H87', 6)`);
    expect(await errorCode(() => as(sellerB.businessId, insertPackaging))).toBe('23503');

    const updated = await as(sellerB.businessId, (tx) =>
      tx.execute(sql`update products set sku = 'HACK' where id = ${productA.id}`),
    );
    expect(updated.rowCount).toBe(0);
    const deleted = await as(sellerB.businessId, (tx) =>
      tx.execute(sql`delete from product_packaging where variant_id = ${variantId}`),
    );
    expect(deleted.rowCount).toBe(0);
  });

  it('F3.3a-ISO ürün ve varyant silinmez; kimlik kolonları değişmez (app_user izni yok)', async () => {
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`delete from products where id = ${productA.id}`),
        ),
      ),
    ).toBe('42501');
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(
            sql`update products set seller_id = ${sellerB.businessId} where id = ${productA.id}`,
          ),
        ),
      ),
    ).toBe('42501');
  });

  it('F3.3a-ISO platform (R39) ürünleri okur, yazamaz', async () => {
    const seen = await withPlatformTx({ userId: sellerA.admin.userId }, (tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from products where id = ${productA.id}`,
      ),
    );
    expect(seen.rows[0]?.n).toBe(1);
    const updated = await withPlatformTx({ userId: sellerA.admin.userId }, (tx) =>
      tx.execute(sql`update products set status = 'archived' where id = ${productA.id}`),
    );
    expect(updated.rowCount).toBe(0);
    expect(
      await errorCode(() =>
        withPlatformTx({ userId: sellerA.admin.userId }, (tx) =>
          tx.execute(sql`insert into products (id, seller_id, sku, name, category_id, base_unit_code)
                         values (${randomUUID()}, ${sellerA.businessId}, ${sku('P')}, '{"az":"x"}', ${cats.child}, 'H87')`),
        ),
      ),
    ).toBe('42501');
  });

  it('F3.3a-S3 satıcı özetinde yalnız active ürünlerin aktif kök kategorileri; ilişkisiz satıcı dönmez', async () => {
    const summaries = (ids: readonly string[]) => (tx: Tx) =>
      tx.execute<{ id: string; categories: { id: string; name: Record<string, string> }[] }>(
        sql`select * from connection_seller_summaries(${`{${ids.join(',')}}`}::uuid[])`,
      );
    const seller = await newSeller(region);
    const stranger = await newSeller(region);
    await createProduct(stranger);
    await activeConnection(seller, buyer, new Date());

    const before = (await as(buyer.businessId, summaries([seller.businessId]))).rows;
    expect(before[0]?.categories).toEqual([]);

    // Taslak ürün kategori göstermez.
    const draft = await createProduct(seller);
    expect(
      (await as(buyer.businessId, summaries([seller.businessId]))).rows[0]?.categories,
    ).toEqual([]);

    // Yayınlanan alt kategori ürünü kök kategoriyi gösterir; ikinci kökteki ürün de.
    const publish = async (id: string) =>
      await h
        .http()
        .patch(`/api/v1/products/${id}`)
        .set(await headers(seller))
        .send({ status: 'active' });
    expect((await publish(draft.id)).status).toBe(200);
    const other = await createProduct(seller, { categoryId: cats.otherChild });
    expect((await publish(other.id)).status).toBe(200);
    // Pasif kökün ürünü sayılmaz.
    const inactiveRoot = await newCategory(true);
    const hidden = await createProduct(seller, { categoryId: inactiveRoot });
    expect((await publish(hidden.id)).status).toBe(200);
    await withPlatformTx({ userId: seller.admin.userId }, (tx) =>
      tx.execute(sql`update categories set is_active = false where id = ${inactiveRoot}`),
    );

    const rows = (await as(buyer.businessId, summaries([seller.businessId, stranger.businessId])))
      .rows;
    expect(rows.map((row) => row.id)).toEqual([seller.businessId]);
    expect(rows[0]?.categories.map((c) => c.id).sort()).toEqual([cats.root, cats.otherRoot].sort());
    expect(Object.keys(rows[0]?.categories[0]?.name ?? {})).toContain('az');
  });
});
