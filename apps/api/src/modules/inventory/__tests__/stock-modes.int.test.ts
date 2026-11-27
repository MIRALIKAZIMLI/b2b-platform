// F3.10 stok modları 0–1 (US-038 AC1–AC2; ADR-0018). Gerçek PostgreSQL; uygulama bağlantısı RLS'e
// tabi app_user. Mod satıcı profilinde (`PATCH /business/seller-profile`), var/yok işareti
// `PUT /variants/{id}/availability`; perakendecideki etiket ve sepet engeli `variantBlockedByStock`
// kuralıyla F3.12a / F4.1'de (kural birim testi `@b2b/shared` stock.test.ts). İzolasyon
// stock-modes.isolation dosyasında.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  addMember,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  productBody,
  runSeeds,
  type SeedCategories,
  seedCategories,
  type Seller,
  sku,
  TestHttp,
} from './inventory-fixtures';

interface ErrorJson {
  code: string;
}

interface ProductJson {
  id: string;
  variants: { id: string; sku: string; isAvailable: boolean; status: string }[];
}

describe('F3.10 stok modları (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let region: string;
  let cats: SeedCategories;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.10 stok');
    cats = await seedCategories();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function as(who: { businessId: string }, userId: string) {
    const set = { ...(await h.bearer(userId)), 'X-Business-Id': who.businessId };
    return {
      get: (url: string) => h.http().get(url).set(set),
      post: (url: string, body: object) => h.http().post(url).set(set).send(body),
      patch: (url: string, body: object) => h.http().patch(url).set(set).send(body),
      put: (url: string, body: unknown) =>
        h
          .http()
          .put(url)
          .set(set)
          .send(body as object),
    };
  }

  const admin = (seller: Seller) => as(seller, seller.admin.userId);

  async function sellerWithProduct() {
    const seller = await newSeller(region);
    const created = await (await admin(seller)).post('/api/v1/products', productBody(cats.child));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const product = created.body as ProductJson;
    const variantId = product.variants[0]?.id;
    if (variantId === undefined) throw new Error('varyant yok');
    return { seller, product, variantId };
  }

  async function setMode(seller: Seller, stockMode: string) {
    const res = await (await admin(seller)).patch('/api/v1/business/seller-profile', { stockMode });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as { stockMode: string }).stockMode).toBe(stockMode);
  }

  async function mark(seller: Seller, variantId: string, isAvailable: unknown, userId?: string) {
    return await (
      await as(seller, userId ?? seller.admin.userId)
    ).put(`/api/v1/variants/${variantId}/availability`, { isAvailable });
  }

  async function variantFlag(seller: Seller, productId: string, variantId: string) {
    const res = await (await admin(seller)).get(`/api/v1/products/${productId}`);
    expect(res.status).toBe(200);
    return (res.body as ProductJson).variants.find((v) => v.id === variantId)?.isAvailable;
  }

  async function availabilityAudits(sellerId: string, variantId: string) {
    return await platformRows<{ before: unknown; after: unknown }>(
      `select before, after from audit_logs
        where business_id = $1 and action = 'variant.availability_set' and target_id = $2
        order by id`,
      [sellerId, variantId],
    );
  }

  it('F3.10-AC1 varsayılan mod availability; none seçilir, okunur ve audit yazılır; none modunda işaret yazılamaz (409)', async () => {
    const { seller, variantId } = await sellerWithProduct();
    const initial = await (await admin(seller)).get('/api/v1/stock-mode');
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ stockMode: 'availability' });

    await setMode(seller, 'none');
    expect((await (await admin(seller)).get('/api/v1/stock-mode')).body).toEqual({
      stockMode: 'none',
    });
    const blocked = await mark(seller, variantId, false);
    expect(blocked.status).toBe(409);
    expect((blocked.body as ErrorJson).code).toBe('STOCK_MODE_MISMATCH');

    const audits = await platformRows<{ before: unknown; after: unknown }>(
      `select before, after from audit_logs
        where business_id = $1 and action = 'seller_profile.updated' order by id`,
      [seller.businessId],
    );
    expect(audits.at(-1)).toEqual({
      before: { stockMode: 'availability' },
      after: { stockMode: 'none' },
    });
  });

  it('F3.10-AC1b quantity ve bilinmeyen mod seçilemez (422); mod değişmez', async () => {
    const seller = await newSeller(region);
    for (const stockMode of ['quantity', 'sync', '', null]) {
      const res = await (
        await admin(seller)
      ).patch('/api/v1/business/seller-profile', {
        stockMode,
      });
      expect(res.status, String(stockMode)).toBe(422);
    }
    expect((await (await admin(seller)).get('/api/v1/stock-mode')).body).toEqual({
      stockMode: 'availability',
    });
  });

  it('F3.10-AC2 availability modunda varyant "yok" işaretlenir; ürün okumasında görünür; tekrar aynı değer audit yazmaz; "var" geri alır', async () => {
    const { seller, product, variantId } = await sellerWithProduct();
    expect(await variantFlag(seller, product.id, variantId)).toBe(true);

    const off = await mark(seller, variantId, false);
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body).toEqual({ variantId, isAvailable: false });
    expect(await variantFlag(seller, product.id, variantId)).toBe(false);

    expect((await mark(seller, variantId, false)).status).toBe(200);
    expect(await availabilityAudits(seller.businessId, variantId)).toEqual([
      { before: { isAvailable: true }, after: { isAvailable: false } },
    ]);

    expect((await mark(seller, variantId, true)).body).toEqual({ variantId, isAvailable: true });
    expect(await variantFlag(seller, product.id, variantId)).toBe(true);
    expect(await availabilityAudits(seller.businessId, variantId)).toHaveLength(2);
  });

  it("F3.10-AC2b mod none olunca işaret saklanır, availability'ye dönünce yeniden geçerli; ürün düzenlemesi işareti değiştirmez", async () => {
    const { seller, product, variantId } = await sellerWithProduct();
    expect((await mark(seller, variantId, false)).status).toBe(200);
    await setMode(seller, 'none');
    expect(await variantFlag(seller, product.id, variantId)).toBe(false);
    await setMode(seller, 'availability');
    expect(await variantFlag(seller, product.id, variantId)).toBe(false);

    const edited = await (
      await admin(seller)
    ).patch(`/api/v1/products/${product.id}`, { name: { az: 'Yeni ad' } });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(await variantFlag(seller, product.id, variantId)).toBe(false);
  });

  it('F3.10-V1 gövde ve kimlik doğrulanır (422); olmayan varyant 404', async () => {
    const { seller, variantId } = await sellerWithProduct();
    for (const body of [{}, { isAvailable: 'false' }, { isAvailable: null }]) {
      const res = await (
        await admin(seller)
      ).put(`/api/v1/variants/${variantId}/availability`, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    const extra = await (
      await admin(seller)
    ).put(`/api/v1/variants/${variantId}/availability`, { isAvailable: false, qty: 1 });
    expect(extra.status).toBe(422);
    expect((await mark(seller, 'not-a-uuid', false)).status).toBe(422);
    const missing = await mark(seller, '0190a0c0-0000-7000-8000-000000000000', false);
    expect(missing.status).toBe(404);
    expect((missing.body as ErrorJson).code).toBe('NOT_FOUND');
  });

  it('F3.10-V2 arşivli varyant ve arşivli ürün işaretlenemez (409 INVALID_STATE_TRANSITION)', async () => {
    const { seller, product, variantId } = await sellerWithProduct();
    const first = product.variants[0];
    if (first === undefined) throw new Error('varyant yok');
    const second = {
      sku: sku('V2'),
      packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
    };
    const firstInput = {
      id: first.id,
      sku: first.sku,
      packaging: [
        { level: 'unit', unitCode: 'H87', baseQty: '1' },
        { level: 'case', unitCode: 'XCT', baseQty: '24', isSalesUnit: true },
      ],
    };
    const added = await (
      await admin(seller)
    ).patch(`/api/v1/products/${product.id}`, { variants: [firstInput, second] });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const secondId =
      (added.body as ProductJson).variants.find((v) => v.sku === second.sku)?.id ?? '';
    const removed = await (
      await admin(seller)
    ).patch(`/api/v1/products/${product.id}`, { variants: [firstInput] });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);

    const archivedVariant = await mark(seller, secondId, false);
    expect(archivedVariant.status).toBe(409);
    expect((archivedVariant.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');

    const archived = await (
      await admin(seller)
    ).patch(`/api/v1/products/${product.id}`, { status: 'archived' });
    expect(archived.status, JSON.stringify(archived.body)).toBe(200);
    const archivedProduct = await mark(seller, variantId, false);
    expect(archivedProduct.status).toBe(409);
    expect((archivedProduct.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');
  });

  it('F3.10-V3 izinler: depo sorumlusu (warehouse kapsamı) işaretler; muhasebe yalnız modu okur; perakendeci 403', async () => {
    const { seller, variantId } = await sellerWithProduct();
    const warehouse = await addMember(seller.businessId, 'seller_warehouse');
    const accountant = await addMember(seller.businessId, 'seller_accountant');

    expect((await mark(seller, variantId, false, warehouse.userId)).status).toBe(200);
    expect((await (await as(seller, warehouse.userId)).get('/api/v1/stock-mode')).status).toBe(200);

    const denied = await mark(seller, variantId, true, accountant.userId);
    expect(denied.status).toBe(403);
    expect((await (await as(seller, accountant.userId)).get('/api/v1/stock-mode')).body).toEqual({
      stockMode: 'availability',
    });
    // Mod yazımı `business.manage` ister.
    const modeDenied = await (
      await as(seller, warehouse.userId)
    ).patch('/api/v1/business/seller-profile', { stockMode: 'none' });
    expect(modeDenied.status).toBe(403);

    const buyer = await newBuyer(region);
    const buyerAs = await as(buyer, buyer.admin.userId);
    expect((await buyerAs.get('/api/v1/stock-mode')).status).toBe(403);
    expect(
      (await buyerAs.put(`/api/v1/variants/${variantId}/availability`, { isAvailable: false }))
        .status,
    ).toBe(403);
  });

  it('F3.10-V4 eşzamanlı iki aynı işaret sıralanır: tek değişiklik, tek audit', async () => {
    const { seller, variantId } = await sellerWithProduct();
    const results = await Promise.all([
      mark(seller, variantId, false),
      mark(seller, variantId, false),
    ]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    expect(await availabilityAudits(seller.businessId, variantId)).toHaveLength(1);
  });
});
