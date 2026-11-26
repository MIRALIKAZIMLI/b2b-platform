// F3.4a kiracı izolasyonu (kart F3.4a-ISO; R39). Uçlar HTTP üzerinden; veritabanı kuralları
// doğrudan SQL ile, uygulama rolü app_user (RLS'e tabi).
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
  newRegion,
  newSeller,
  platformRows,
  productBody,
  runSeeds,
  type SeedCategories,
  type Seller,
  seedCategories,
  TestHttp,
} from './product-fixtures';

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

describe('F3.4a ürün görseli kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyer: Buyer;
  let productA: string;
  let productB: string;
  let imageA: string;

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function headers(who: { admin: { userId: string }; businessId: string }) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function createProduct(who: Seller): Promise<string> {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who))
      .send(productBody(cats.child));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function readyFile(who: Seller): Promise<string> {
    const fileId = randomUUID();
    await platformRows(
      `insert into files (id, owner_business_id, purpose, bucket, object_key, content_type,
                          size_bytes, status, created_by)
       values ($1, $2, 'product_image', 'public', $3, 'image/png', 100, 'ready', $4)`,
      [fileId, who.businessId, `${who.businessId}/product_image/${fileId}.png`, who.admin.userId],
    );
    return fileId;
  }

  async function count(tx: Tx): Promise<number> {
    const result = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from product_images`,
    );
    return result.rows[0]?.n ?? -1;
  }

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    const region = await newRegion('F3.4a izolasyon');
    cats = await seedCategories();
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    buyer = await newBuyer(region);
    await activeConnection(sellerA, buyer, new Date());
    productA = await createProduct(sellerA);
    productB = await createProduct(sellerB);
    const added = await h
      .http()
      .post(`/api/v1/products/${productA}/images`)
      .set(await headers(sellerA))
      .send({ fileId: await readyFile(sellerA) });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    imageA = (added.body as { id: string }).id;
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F3.4a-ISO başka toptancı A'nın ürününe görsel ekleyemez, sıralayamaz, silemez (404)", async () => {
    const asB = await headers(sellerB);
    const add = await h
      .http()
      .post(`/api/v1/products/${productA}/images`)
      .set(asB)
      .send({ fileId: await readyFile(sellerB) });
    expect(add.status).toBe(404);
    const order = await h
      .http()
      .put(`/api/v1/products/${productA}/images/order`)
      .set(asB)
      .send({ imageIds: [imageA] });
    expect(order.status).toBe(404);
    expect(
      (await h.http().delete(`/api/v1/products/${productA}/images/${imageA}`).set(asB)).status,
    ).toBe(404);
    // A'nın görsel kimliği B'nin kendi ürününde de bulunmaz.
    expect(
      (await h.http().delete(`/api/v1/products/${productB}/images/${imageA}`).set(asB)).status,
    ).toBe(404);
    // B, A'nın dosyasını kendi ürününe bağlayamaz.
    const [row] = await platformRows<{ file_id: string }>(
      'select file_id from product_images where id = $1',
      [imageA],
    );
    const steal = await h
      .http()
      .post(`/api/v1/products/${productB}/images`)
      .set(asB)
      .send({ fileId: row?.file_id });
    expect(steal.status).toBe(404);
  });

  it('F3.4a-ISO bağlı perakendeci görsel uçlarına ulaşamaz (403)', async () => {
    const asBuyer = await headers(buyer);
    const add = await h
      .http()
      .post(`/api/v1/products/${productA}/images`)
      .set(asBuyer)
      .send({ fileId: randomUUID() });
    expect(add.status).toBe(403);
    expect(
      (await h.http().delete(`/api/v1/products/${productA}/images/${imageA}`).set(asBuyer)).status,
    ).toBe(403);
  });

  it('F3.4a-ISO doğrudan SQL: perakendeci, başka satıcı ve bağlamsız çağrı 0 satır; yabancı satır eklenemez, silinemez', async () => {
    expect(await as(sellerA.businessId, count)).toBeGreaterThan(0);
    expect(await as(buyer.businessId, count)).toBe(0);
    expect(await as(sellerB.businessId, count)).toBe(0);
    expect(await withSystemTx(count)).toBe(0);

    const fileB = await readyFile(sellerB);
    // seller_id = B, ürün A'nın → bileşik ürün FK'sı 23503.
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into product_images (id, product_id, seller_id, file_id, sort_order)
                         values (${randomUUID()}, ${productA}, ${sellerB.businessId}, ${fileB}, 0)`),
        ),
      ),
    ).toBe('23503');
    // B'nin ürününe A'nın dosyası → bileşik dosya FK'sı 23503 (K9).
    const fileA = await readyFile(sellerA);
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into product_images (id, product_id, seller_id, file_id, sort_order)
                         values (${randomUUID()}, ${productB}, ${sellerB.businessId}, ${fileA}, 0)`),
        ),
      ),
    ).toBe('23503');
    const deleted = await as(sellerB.businessId, (tx) =>
      tx.execute(sql`delete from product_images where id = ${imageA}`),
    );
    expect(deleted.rowCount).toBe(0);
    // Kimlik kolonları değişmez (app_user UPDATE izni yalnız sıra ve durum).
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`update product_images set product_id = ${productB} where id = ${imageA}`),
        ),
      ),
    ).toBe('42501');
  });

  it('F3.4a-ISO platform (R39) görselleri okur, yazamaz', async () => {
    const ctx = { userId: sellerA.admin.userId };
    const seen = await withPlatformTx(ctx, (tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from product_images where id = ${imageA}`,
      ),
    );
    expect(seen.rows[0]?.n).toBe(1);
    const updated = await withPlatformTx(ctx, (tx) =>
      tx.execute(sql`update product_images set status = 'failed' where id = ${imageA}`),
    );
    expect(updated.rowCount).toBe(0);
    const deleted = await withPlatformTx(ctx, (tx) =>
      tx.execute(sql`delete from product_images where id = ${imageA}`),
    );
    expect(deleted.rowCount).toBe(0);
  });
});
