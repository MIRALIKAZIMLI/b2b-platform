// F3.11b depo stok ekranı uçları (US-039 AC1, AC6, AC7; kullanıcı kararı S1 = A). Gerçek PostgreSQL;
// uygulama bağlantısı RLS'e tabi app_user. `GET /stock/warehouses` depo seçicisi, `GET /stock/items`
// depodaki tüm satılabilir varyantlar (sayılmamışlar dahil), "az qalan" eşiği satış biriminde
// toptancı ayarı. İzolasyon stock.isolation'da.
import { randomUUID } from 'node:crypto';
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

interface ItemJson {
  variantId: string;
  sku: string;
  counted: boolean;
  onHand: string | null;
  available: string | null;
  low: boolean;
  displayUnit: { unitCode: string; baseQty: string } | null;
  packaging: { level: string; baseQty: string; isSalesUnit: boolean }[];
}

interface PageJson {
  items: ItemJson[];
  nextCursor: string | null;
}

interface ProductJson {
  id: string;
  variants: { id: string; sku: string }[];
}

describe('F3.11b depo stok ekranı (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let region: string;
  let cats: SeedCategories;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.11b stok ekranı');
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

  async function as(businessId: string, userId: string) {
    const set = { ...(await h.bearer(userId)), 'X-Business-Id': businessId };
    return {
      get: (url: string) => h.http().get(url).set(set),
      post: (url: string, body: object) =>
        h.http().post(url).set(set).set('Idempotency-Key', randomUUID()).send(body),
      patch: (url: string, body: object) => h.http().patch(url).set(set).send(body),
    };
  }

  const admin = (seller: Seller) => as(seller.businessId, seller.admin.userId);

  async function newWarehouse(seller: Seller, name: string): Promise<string> {
    const res = await (await admin(seller)).post('/api/v1/warehouses', { name });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { id: string }).id;
  }

  async function newProduct(
    seller: Seller,
    overrides: Record<string, unknown> = {},
  ): Promise<ProductJson> {
    const res = await (
      await admin(seller)
    ).post('/api/v1/products', productBody(cats.child, overrides));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as ProductJson;
  }

  async function receipt(seller: Seller, warehouseId: string, variantId: string, qty: string) {
    const res = await (
      await admin(seller)
    ).post('/api/v1/stock/movements', { warehouseId, variantId, type: 'receipt', qty });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }

  async function items(seller: Seller, query: string, userId = seller.admin.userId) {
    return await (await as(seller.businessId, userId)).get(`/api/v1/stock/items?${query}`);
  }

  it('F3.11b-LIST depo ekranı sayılmamış varyantı counted:false döner; arşivli varyant yok; ambalaj ve koli birimi gelir', async () => {
    const seller = await newSeller(region);
    const warehouseId = await newWarehouse(seller, 'Əsas anbar');
    const counted = await newProduct(seller);
    const uncounted = await newProduct(seller);
    const archived = await newProduct(seller);
    const countedId = counted.variants[0]?.id ?? '';
    await receipt(seller, warehouseId, countedId, '48');
    const del = await (
      await admin(seller)
    ).patch(`/api/v1/products/${archived.id}`, { status: 'archived' });
    expect(del.status, JSON.stringify(del.body)).toBe(200);

    const res = await items(seller, `warehouseId=${warehouseId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = res.body as PageJson;
    const byId = new Map(body.items.map((item) => [item.variantId, item]));
    expect([...byId.keys()].sort()).toEqual([countedId, uncounted.variants[0]?.id ?? ''].sort());
    expect(byId.get(countedId)).toMatchObject({
      counted: true,
      onHand: '48.000',
      available: '48.000',
      displayUnit: { unitCode: 'XCT', baseQty: '24.000' },
    });
    expect(byId.get(countedId)?.packaging.map((p) => p.level)).toEqual(['unit', 'case', 'pallet']);
    expect(byId.get(uncounted.variants[0]?.id ?? '')).toMatchObject({
      counted: false,
      onHand: null,
      available: null,
      low: false,
    });

    const onlyUncounted = (await items(seller, `warehouseId=${warehouseId}&filter=uncounted`))
      .body as PageJson;
    expect(onlyUncounted.items.map((i) => i.variantId)).toEqual([uncounted.variants[0]?.id]);
  });

  it('F3.11b-LIST arama SKU ve ürün adında (harf duyarsız, % harfiyen); imleç sayfalar; olmayan depo 404', async () => {
    const seller = await newSeller(region);
    const warehouseId = await newWarehouse(seller, 'Anbar');
    const marker = sku('Q');
    const named = await newProduct(seller, { name: { az: `Sabun ${marker} 100%` } });
    for (let i = 0; i < 2; i++) await newProduct(seller);

    const bySku = (
      await items(
        seller,
        `warehouseId=${warehouseId}&q=${named.variants[0]?.sku.toLowerCase() ?? ''}`,
      )
    ).body as PageJson;
    expect(bySku.items.map((i) => i.variantId)).toEqual([named.variants[0]?.id]);
    const byName = (
      await items(
        seller,
        `warehouseId=${warehouseId}&q=${encodeURIComponent(marker.toLowerCase())}`,
      )
    ).body as PageJson;
    expect(byName.items.map((i) => i.variantId)).toEqual([named.variants[0]?.id]);
    const percent = (
      await items(seller, `warehouseId=${warehouseId}&q=${encodeURIComponent('0%')}`)
    ).body as PageJson;
    expect(percent.items.map((i) => i.variantId)).toEqual([named.variants[0]?.id]);

    const page1 = (await items(seller, `warehouseId=${warehouseId}&limit=2`)).body as PageJson;
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = (
      await items(seller, `warehouseId=${warehouseId}&limit=2&cursor=${page1.nextCursor ?? ''}`)
    ).body as PageJson;
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((i) => i.variantId)).size).toBe(3);

    expect((await items(seller, `warehouseId=${randomUUID()}`)).status).toBe(404);
    expect((await items(seller, 'filter=all')).status).toBe(422);
  });

  it('F3.11b-AC6 az qalan eşiği satış biriminde (5 koli = 120 adet), karşılaştırma temel birimde; eşik ayarı süzgeci değiştirir', async () => {
    const seller = await newSeller(region);
    const warehouseId = await newWarehouse(seller, 'Anbar');
    const variants: string[] = [];
    for (let i = 0; i < 3; i++) variants.push((await newProduct(seller)).variants[0]?.id ?? '');
    const qtys = ['96', '120', '144'];
    for (const [i, variantId] of variants.entries()) {
      await receipt(seller, warehouseId, variantId, qtys[i] ?? '1');
    }
    await newProduct(seller); // sayılmamış: az qalan sayılmaz

    const low = (await items(seller, `warehouseId=${warehouseId}&filter=low`)).body as PageJson;
    expect(low.items.map((i) => i.variantId).sort()).toEqual([variants[0], variants[1]].sort());
    const all = (await items(seller, `warehouseId=${warehouseId}`)).body as PageJson;
    expect(
      all.items
        .filter((i) => i.low)
        .map((i) => i.variantId)
        .sort(),
    ).toEqual([variants[0], variants[1]].sort());
    const legacy = await (
      await admin(seller)
    ).get(`/api/v1/stock?low=true&warehouseId=${warehouseId}`);
    expect(
      (legacy.body as { items: { variantId: string }[] }).items.map((i) => i.variantId).sort(),
    ).toEqual([variants[0], variants[1]].sort());

    const patch = await (
      await admin(seller)
    ).patch('/api/v1/business/seller-profile', { lowStockDisplayThreshold: '4' });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect((patch.body as { lowStockDisplayThreshold: string }).lowStockDisplayThreshold).toBe('4');
    const lowAfter = (await items(seller, `warehouseId=${warehouseId}&filter=low`))
      .body as PageJson;
    expect(lowAfter.items.map((i) => i.variantId)).toEqual([variants[0]]);
  });

  it('F3.11b-THR eşik 0–9999 tam sayı; geçersiz 422; değişiklik audit kaydı yazar; profil varsayılanı 5', async () => {
    const seller = await newSeller(region);
    const http = await admin(seller);
    const profile = await http.get('/api/v1/business/seller-profile');
    expect((profile.body as { lowStockDisplayThreshold: string }).lowStockDisplayThreshold).toBe(
      '5',
    );
    for (const bad of ['-1', '1.5', '10000', 'abc', '']) {
      const res = await http.patch('/api/v1/business/seller-profile', {
        lowStockDisplayThreshold: bad,
      });
      expect(res.status, bad).toBe(422);
    }
    expect(
      (await http.patch('/api/v1/business/seller-profile', { lowStockDisplayThreshold: '0' }))
        .status,
    ).toBe(200);
    const audits = await platformRows<{
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }>(
      `select before, after from audit_logs
        where business_id = $1 and action = 'seller_profile.updated' order by occurred_at`,
      [seller.businessId],
    );
    expect(audits.at(-1)).toMatchObject({
      before: { lowStockDisplayThreshold: '5' },
      after: { lowStockDisplayThreshold: '0' },
    });
  });

  it('F3.11b-SCOPE depo sorumlusu seçicide ve ekranda yalnız kendi deposu; başka depo 403; deposuz 403; perakendeci 403', async () => {
    const seller = await newSeller(region);
    const own = await newWarehouse(seller, 'Birinci');
    const second = await newWarehouse(seller, 'İkinci');
    const passive = await newWarehouse(seller, 'Pasiv');
    const off = await (
      await admin(seller)
    ).patch(`/api/v1/warehouses/${passive}`, {
      status: 'inactive',
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    await newProduct(seller);
    const keeper = await addMember(seller.businessId, 'seller_warehouse');
    await platformRows('update memberships set warehouse_id = $1 where id = $2', [
      own,
      keeper.membershipId,
    ]);
    const unassigned = await addMember(seller.businessId, 'seller_warehouse');

    const adminList = await (await admin(seller)).get('/api/v1/stock/warehouses');
    expect((adminList.body as { id: string; isDefault: boolean }[]).map((w) => w.id)).toEqual([
      own,
      second,
    ]);
    const keeperHttp = await as(seller.businessId, keeper.userId);
    const keeperList = await keeperHttp.get('/api/v1/stock/warehouses');
    expect((keeperList.body as { id: string }[]).map((w) => w.id)).toEqual([own]);
    expect((await items(seller, `warehouseId=${own}`, keeper.userId)).status).toBe(200);
    expect((await items(seller, `warehouseId=${second}`, keeper.userId)).status).toBe(403);
    expect((await items(seller, `warehouseId=${passive}`)).status).toBe(404);
    expect(
      (await (await as(seller.businessId, unassigned.userId)).get('/api/v1/stock/warehouses'))
        .status,
    ).toBe(403);

    const buyer = await newBuyer(region);
    const buyerHttp = await as(buyer.businessId, buyer.admin.userId);
    expect((await buyerHttp.get('/api/v1/stock/warehouses')).status).toBe(403);
    expect((await buyerHttp.get(`/api/v1/stock/items?warehouseId=${own}`)).status).toBe(403);
  });
});
