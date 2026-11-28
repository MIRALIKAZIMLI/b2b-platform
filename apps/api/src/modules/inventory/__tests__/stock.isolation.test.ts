// F3.11a miktarlı stok kiracı izolasyonu (kart F3.11a-ISO, R39). Uçlar HTTP üzerinden; veritabanı
// kuralları doğrudan SQL ile, uygulama rolü app_user (RLS'e tabi). B, A'nın stoğunu ve hareketlerini
// okuyamaz, A'nın deposuna / varyantına hareket yazamaz; platform bağlamı okur ama yazamaz.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { withPlatformTx, withTenantTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  businessRows,
  newRegion,
  newSeller,
  productBody,
  runSeeds,
  type Seller,
  seedCategories,
  TestHttp,
} from './inventory-fixtures';

describe('F3.11a miktarlı stok kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let sellerA: Seller;
  let sellerB: Seller;
  let warehouseA: string;
  let warehouseB: string;
  let variantA: string;
  let variantB: string;

  async function headers(who: Seller) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function setupSeller(seller: Seller, categoryId: string) {
    const warehouse = await h
      .http()
      .post('/api/v1/warehouses')
      .set(await headers(seller))
      .send({ name: 'Anbar' });
    expect(warehouse.status, JSON.stringify(warehouse.body)).toBe(201);
    const product = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(seller))
      .send(productBody(categoryId));
    expect(product.status, JSON.stringify(product.body)).toBe(201);
    return {
      warehouseId: (warehouse.body as { id: string }).id,
      variantId: (product.body as { variants: { id: string }[] }).variants[0]?.id ?? '',
    };
  }

  const move = async (who: Seller, body: object) =>
    await h
      .http()
      .post('/api/v1/stock/movements')
      .set(await headers(who))
      .set('Idempotency-Key', randomUUID())
      .send(body);

  async function stockOfA() {
    return await businessRows<{ on_hand: string }>(
      sellerA.businessId,
      'select on_hand::text from stock where variant_id = $1',
      [variantA],
    );
  }

  beforeAll(async () => {
    await runSeeds();
    const region = await newRegion('F3.11a izolasyon');
    const cats = await seedCategories();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    ({ warehouseId: warehouseA, variantId: variantA } = await setupSeller(sellerA, cats.child));
    ({ warehouseId: warehouseB, variantId: variantB } = await setupSeller(sellerB, cats.child));
    expect(
      (
        await move(sellerA, {
          warehouseId: warehouseA,
          variantId: variantA,
          type: 'receipt',
          qty: '10',
        })
      ).status,
    ).toBe(201);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F3.11a-ISO B, A'nın deposuna veya varyantına hareket yazamaz (404); A'nın stoğu değişmez", async () => {
    const attempts = [
      { warehouseId: warehouseA, variantId: variantA },
      { warehouseId: warehouseA, variantId: variantB },
      { warehouseId: warehouseB, variantId: variantA },
    ];
    for (const target of attempts) {
      const res = await move(sellerB, { ...target, type: 'adjustment', qty: '0' });
      expect(res.status, JSON.stringify(target)).toBe(404);
    }
    expect(await stockOfA()).toEqual([{ on_hand: '10.000' }]);
  });

  it("F3.11a-ISO B listede ve geçmişte A'nın satırlarını görmez; A'nın deposuyla süzmek boş döner", async () => {
    for (const url of [
      '/api/v1/stock',
      `/api/v1/stock?warehouseId=${warehouseA}`,
      `/api/v1/stock?variantId=${variantA}`,
      '/api/v1/stock/movements',
      `/api/v1/stock/movements?variantId=${variantA}`,
    ]) {
      const res = await h
        .http()
        .get(url)
        .set(await headers(sellerB));
      expect(res.status, url).toBe(200);
      expect((res.body as { items: unknown[] }).items, url).toEqual([]);
    }
  });

  it("F3.11a-ISO tenant işlemiyle B, A'nın stok ve hareket satırlarını göremez; A adına hareket ekleyemez (42501)", async () => {
    const seen = await withTenantTx(
      { businessId: sellerB.businessId, userId: null },
      async (tx) => {
        const stock = await tx.execute(
          sql`select 1 from stock where variant_id = ${variantA}::uuid`,
        );
        const moves = await tx.execute(
          sql`select 1 from stock_movements where variant_id = ${variantA}::uuid`,
        );
        return [stock.rows.length, moves.rows.length];
      },
    );
    expect(seen).toEqual([0, 0]);
    await expect(
      withTenantTx({ businessId: sellerB.businessId, userId: null }, (tx) =>
        tx.execute(sql`insert into stock_movements
            (id, seller_id, warehouse_id, variant_id, type, on_hand_delta, created_at)
          values (${randomUUID()}::uuid, ${sellerA.businessId}::uuid, ${warehouseA}::uuid,
                  ${variantA}::uuid, 'receipt', 5, now())`),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(await stockOfA()).toEqual([{ on_hand: '10.000' }]);
  });

  it('F3.11a-ISO R39: platform bağlamı stoğu okur, hareket yazamaz ve stok satırını değiştiremez', async () => {
    const read = await withPlatformTx(
      { userId: randomUUID() },
      async (tx) =>
        (
          await tx.execute(
            sql`select on_hand::text from stock where variant_id = ${variantA}::uuid`,
          )
        ).rows,
    );
    expect(read).toEqual([{ on_hand: '10.000' }]);
    await expect(
      withPlatformTx({ userId: randomUUID() }, (tx) =>
        tx.execute(sql`insert into stock_movements
            (id, seller_id, warehouse_id, variant_id, type, on_hand_delta, created_at)
          values (${randomUUID()}::uuid, ${sellerA.businessId}::uuid, ${warehouseA}::uuid,
                  ${variantA}::uuid, 'receipt', 5, now())`),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
      withPlatformTx({ userId: randomUUID() }, (tx) =>
        tx.execute(sql`update stock set on_hand = 0 where variant_id = ${variantA}::uuid`),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(await stockOfA()).toEqual([{ on_hand: '10.000' }]);
  });
});
