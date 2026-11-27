// F3.10 stok modları kiracı izolasyonu (kart F3.10-ISO). Uçlar HTTP üzerinden; veritabanı kuralları
// doğrudan SQL ile, uygulama rolü app_user (RLS'e tabi). Başka satıcı A'nın varyantını işaretleyemez
// (404, satır değişmez), A'nın modunu okuyamaz; tenant işlemiyle A'nın satırları görünmez.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { type Tx, withTenantTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  newRegion,
  newSeller,
  platformRows,
  productBody,
  runSeeds,
  type SeedCategories,
  type Seller,
  seedCategories,
  TestHttp,
} from './inventory-fixtures';

describe('F3.10 stok modları kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let sellerA: Seller;
  let sellerB: Seller;
  let variantA: string;

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function headers(who: Seller) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  beforeAll(async () => {
    await runSeeds();
    const region = await newRegion('F3.10 izolasyon');
    cats = await seedCategories();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    const created = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(sellerA))
      .send(productBody(cats.child));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    variantA = (created.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
    await platformRows(`update seller_profiles set stock_mode = 'none' where business_id = $1`, [
      sellerA.businessId,
    ]);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F3.10-ISO B, A'nın varyantını işaretleyemez (404) ve A'nın satırı değişmez", async () => {
    const res = await h
      .http()
      .put(`/api/v1/variants/${variantA}/availability`)
      .set(await headers(sellerB))
      .send({ isAvailable: false });
    expect(res.status).toBe(404);
    const [row] = await platformRows<{ is_available: boolean }>(
      'select is_available from product_variants where id = $1',
      [variantA],
    );
    expect(row?.is_available).toBe(true);
  });

  it("F3.10-ISO B kendi modunu okur, A'nınkini görmez", async () => {
    const res = await h
      .http()
      .get('/api/v1/stock-mode')
      .set(await headers(sellerB));
    expect(res.body).toEqual({ stockMode: 'availability' });
  });

  it("F3.10-ISO tenant işlemiyle B, A'nın profilini ve varyantını göremez, güncelleyemez", async () => {
    const seen = await as(sellerB.businessId, async (tx) => {
      const profile = await tx.execute(
        sql`select stock_mode from seller_profiles where business_id = ${sellerA.businessId}`,
      );
      const variant = await tx.execute(
        sql`select id from product_variants where id = ${variantA}::uuid`,
      );
      const updated = await tx.execute(
        sql`update product_variants set is_available = false where id = ${variantA}::uuid`,
      );
      const modeUpdated = await tx.execute(
        sql`update seller_profiles set stock_mode = 'availability'
             where business_id = ${sellerA.businessId}`,
      );
      return [profile.rows.length, variant.rows.length, updated.rowCount, modeUpdated.rowCount];
    });
    expect(seen).toEqual([0, 0, 0, 0]);
    const [row] = await platformRows<{ stock_mode: string }>(
      'select stock_mode from seller_profiles where business_id = $1',
      [sellerA.businessId],
    );
    expect(row?.stock_mode).toBe('none');
  });
});
