// F3.9 kademeli fiyat API (US-037 AC1; ADR-0019; test-strategy §3.1 P7; kart F3.9 S1 = A, S2 = A).
// Gerçek PostgreSQL; uygulama bağlantısı RLS'e tabi app_user. Kademe bütün perakendecilere
// uygulanır ve seçilen fiyatın (liste, müşteri fiyatı) üzerine gelir; `/prices/explain?qty=` ile
// denenir. Kiracı izolasyonu tier-prices.isolation dosyasında.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { SettingsService } from '../../settings';
import {
  activeConnection,
  addMember,
  businessRows,
  type Buyer,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  productBody,
  runSeeds,
  type SeedCategories,
  seedCategories,
  type Seller,
  TestHttp,
} from './pricing-fixtures';

interface ExplainJson {
  source: string;
  unitPrice: { amount: string; currency: string } | null;
  tierDiscountPercent: string | null;
  finalUnitPrice: { amount: string; currency: string } | null;
}

interface ErrorJson {
  code: string;
  details?: Record<string, string[]>;
}

describe('F3.9 kademeli fiyat API (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let region: string;
  let cats: SeedCategories;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.9 kademe');
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

  async function as(who: { businessId: string; admin: { userId: string } }, userId?: string) {
    const set = {
      ...(await h.bearer(userId ?? who.admin.userId)),
      'X-Business-Id': who.businessId,
    };
    return {
      get: (url: string) => h.http().get(url).set(set),
      post: (url: string, body: unknown) =>
        h
          .http()
          .post(url)
          .set(set)
          .send(body as object),
      put: (url: string, body: unknown) =>
        h
          .http()
          .put(url)
          .set(set)
          .send(body as object),
    };
  }

  /** Varsayılan liste (20 AZN) + bir ürünün koli ve adet ambalajı. */
  async function sellerWithProduct() {
    const seller = await newSeller(region);
    const list = await (
      await as(seller)
    ).post('/api/v1/price-lists', {
      name: 'Əsas',
      currency: 'AZN',
      vatIncluded: true,
      vatRate: '18',
    });
    expect(list.status, JSON.stringify(list.body)).toBe(201);
    const product = await (await as(seller)).post('/api/v1/products', productBody(cats.child));
    expect(product.status, JSON.stringify(product.body)).toBe(201);
    const packaging = (
      product.body as { variants: { packaging: { id: string; level: string }[] }[] }
    ).variants[0]?.packaging;
    const caseId = packaging?.find((item) => item.level === 'case')?.id;
    const unitId = packaging?.find((item) => item.level === 'unit')?.id;
    if (caseId === undefined || unitId === undefined) throw new Error('ambalaj yok');
    const set = await (
      await as(seller)
    ).put(`/api/v1/price-lists/${(list.body as { id: string }).id}/items`, {
      items: [{ packagingId: caseId, unitPrice: '20' }],
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    return { seller, caseId, unitId };
  }

  async function putTiers(
    seller: Seller,
    packagingId: string,
    tiers: { minQty: string; discountPercent: string }[],
    userId?: string,
  ) {
    return await (await as(seller, userId)).put('/api/v1/tier-prices', { packagingId, tiers });
  }

  async function explain(
    seller: Seller,
    buyer: Buyer,
    packagingId: string,
    qty?: string,
  ): Promise<ExplainJson> {
    const res = await (
      await as(seller)
    ).get(
      `/api/v1/prices/explain?buyerId=${buyer.businessId}&packagingId=${packagingId}` +
        (qty === undefined ? '' : `&qty=${qty}`),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as ExplainJson;
  }

  it('F3.9-AC1 kademe tanımlanır; miktar eşiğe ulaşınca fiyat düşer, altında değişmez; bütün perakendecilere uygulanır', async () => {
    const { seller, caseId } = await sellerWithProduct();
    const buyer = await newBuyer(region);
    const other = await newBuyer(region);
    await activeConnection(seller, buyer, new Date());
    await activeConnection(seller, other, new Date());

    const res = await putTiers(seller, caseId, [
      { minQty: '50', discountPercent: '5' },
      { minQty: '10', discountPercent: '3' },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      packagingId: caseId,
      tiers: [
        { minQty: '10.000', discountPercent: '3.00' },
        { minQty: '50.000', discountPercent: '5.00' },
      ],
    });

    expect(await explain(seller, buyer, caseId)).toMatchObject({
      source: 'default_list',
      tierDiscountPercent: null,
      finalUnitPrice: { amount: '20.0000' },
    });
    expect(await explain(seller, buyer, caseId, '9.999')).toMatchObject({
      tierDiscountPercent: null,
      finalUnitPrice: { amount: '20.0000' },
    });
    // 20 × 0,97 = 19,40; 20 × 0,95 = 19,00 (en büyük ulaşılan kademe).
    expect(await explain(seller, buyer, caseId, '12')).toMatchObject({
      unitPrice: { amount: '20.0000' },
      tierDiscountPercent: '3.00',
      finalUnitPrice: { amount: '19.4000', currency: 'AZN' },
    });
    expect(await explain(seller, other, caseId, '75')).toMatchObject({
      tierDiscountPercent: '5.00',
      finalUnitPrice: { amount: '19.0000' },
    });

    const listed = await (await as(seller)).get(`/api/v1/tier-prices?packagingId=${caseId}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
      items: [
        {
          packagingId: caseId,
          tiers: [
            { minQty: '10.000', discountPercent: '3.00' },
            { minQty: '50.000', discountPercent: '5.00' },
          ],
        },
      ],
      maxPerPackaging: 5,
    });
  });

  it('F3.9-P7 miktar eşiğe tam eşitse indirim uygulanır (yükleyici üzerinden)', async () => {
    const { seller, caseId } = await sellerWithProduct();
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, new Date());
    expect((await putTiers(seller, caseId, [{ minQty: '10', discountPercent: '3' }])).status).toBe(
      200,
    );
    expect(await explain(seller, buyer, caseId, '10')).toMatchObject({
      tierDiscountPercent: '3.00',
      finalUnitPrice: { amount: '19.4000' },
    });
    expect(await explain(seller, buyer, caseId, '10.000')).toMatchObject({
      tierDiscountPercent: '3.00',
    });
  });

  it('F3.9-AC1b müşteri fiyatı da kademeyle indirilir (önce kaynak, sonra kademe; ADR-0019)', async () => {
    const { seller, caseId } = await sellerWithProduct();
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, new Date());
    const custom = await (
      await as(seller)
    ).put('/api/v1/customer-prices', {
      buyerId: buyer.businessId,
      items: [{ packagingId: caseId, unitPrice: '15.55' }],
    });
    expect(custom.status, JSON.stringify(custom.body)).toBe(200);
    expect((await putTiers(seller, caseId, [{ minQty: '10', discountPercent: '3' }])).status).toBe(
      200,
    );
    // 15,55 × 0,97 = 15,0835 (4 hane).
    expect(await explain(seller, buyer, caseId, '10')).toMatchObject({
      source: 'customer_price',
      unitPrice: { amount: '15.5500' },
      tierDiscountPercent: '3.00',
      finalUnitPrice: { amount: '15.0835' },
    });
  });

  it('F3.9-V1 kurallar 422 alan hatasıyla: eşik ≤ 1, indirim 0 veya ≥ 100, tekrar eşik, artmayan indirim, sınırı aşan sayı', async () => {
    const { seller, caseId } = await sellerWithProduct();
    const details = async (tiers: { minQty: string; discountPercent: string }[]) => {
      const res = await putTiers(seller, caseId, tiers);
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect((res.body as ErrorJson).code).toBe('VALIDATION_FAILED');
      return (res.body as ErrorJson).details;
    };
    expect(await details([{ minQty: '1', discountPercent: '3' }])).toEqual({
      'tiers.0.minQty': ['min_qty_too_small'],
    });
    expect(await details([{ minQty: '5', discountPercent: '0' }])).toEqual({
      'tiers.0.discountPercent': ['percent_out_of_range'],
    });
    expect(Object.keys((await details([{ minQty: '5', discountPercent: '100' }])) ?? {})).toEqual([
      'tiers.0.discountPercent',
    ]);
    expect(
      await details([
        { minQty: '10', discountPercent: '3' },
        { minQty: '10.0', discountPercent: '4' },
      ]),
    ).toEqual({ 'tiers.1.minQty': ['duplicate_min_qty'] });
    expect(
      await details([
        { minQty: '50', discountPercent: '2' },
        { minQty: '10', discountPercent: '3' },
      ]),
    ).toEqual({ 'tiers.0.discountPercent': ['percent_not_increasing'] });
    expect(
      await details(
        ['2', '3', '4', '5', '6', '7'].map((minQty, index) => ({
          minQty,
          discountPercent: String(index + 1),
        })),
      ),
    ).toEqual({ tiers: ['too_many'] });
    const rows = await platformRows('select 1 from tier_prices where seller_id = $1', [
      seller.businessId,
    ]);
    expect(rows).toEqual([]);
  });

  it('F3.9-V1b kademe sayısı sınırı ayardan (işletme katmanı)', async () => {
    const { seller, caseId } = await sellerWithProduct();
    const settings = app.get(SettingsService);
    await settings.set(
      'pricing.tier_max_per_packaging',
      2,
      { scope: 'business', businessId: seller.businessId },
      { userId: seller.admin.userId },
    );
    const three = ['2', '3', '4'].map((minQty, index) => ({
      minQty,
      discountPercent: String(index + 1),
    }));
    expect((await putTiers(seller, caseId, three)).status).toBe(422);
    expect((await putTiers(seller, caseId, three.slice(0, 2))).status).toBe(200);
    const listed = await (await as(seller)).get(`/api/v1/tier-prices?packagingId=${caseId}`);
    expect((listed.body as { maxPerPackaging: number }).maxPerPackaging).toBe(2);
  });

  it('F3.9-V2 PUT bütün kademeleri değiştirir; aynı gövde tekrarı aynı sonuç; boş liste kaldırır; audit', async () => {
    const { seller, caseId, unitId } = await sellerWithProduct();
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, new Date());
    const first = [
      { minQty: '10', discountPercent: '3' },
      { minQty: '50', discountPercent: '5' },
    ];
    expect((await putTiers(seller, caseId, first)).status).toBe(200);
    const again = await putTiers(seller, caseId, first);
    expect(again.status).toBe(200);
    const replaced = await putTiers(seller, caseId, [{ minQty: '20', discountPercent: '4.5' }]);
    expect(replaced.body).toEqual({
      packagingId: caseId,
      tiers: [{ minQty: '20.000', discountPercent: '4.50' }],
    });
    expect(await explain(seller, buyer, caseId, '15')).toMatchObject({
      tierDiscountPercent: null,
    });

    const removed = await putTiers(seller, caseId, []);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ packagingId: caseId, tiers: [] });
    expect(await explain(seller, buyer, caseId, '100')).toMatchObject({
      tierDiscountPercent: null,
      finalUnitPrice: { amount: '20.0000' },
    });
    // Kademesi olmayan ambalaj boş listeyle döner.
    const listed = await (
      await as(seller)
    ).get(`/api/v1/tier-prices?packagingId=${caseId}&packagingId=${unitId}`);
    expect((listed.body as { items: unknown[] }).items).toEqual([
      { packagingId: caseId, tiers: [] },
      { packagingId: unitId, tiers: [] },
    ]);

    const audits = await platformRows<{
      target_type: string;
      target_id: string;
      before: unknown;
      after: unknown;
    }>(
      `select target_type, target_id, before, after from audit_logs
        where action = 'tier_price.set' and business_id = $1 order by id`,
      [seller.businessId],
    );
    expect(audits).toHaveLength(4);
    expect(audits[0]).toEqual({
      target_type: 'tier_price',
      target_id: caseId,
      before: { tiers: [] },
      after: {
        tiers: [
          { minQty: '10.000', discountPercent: '3.00' },
          { minQty: '50.000', discountPercent: '5.00' },
        ],
      },
    });
    expect(audits[3]?.before).toEqual({ tiers: [{ minQty: '20.000', discountPercent: '4.50' }] });
    expect(audits[3]?.after).toEqual({ tiers: [] });
  });

  it('F3.9-V3 eşzamanlı iki PUT sıralanır: son yazan kazanır, karışık küme veya 500 yok', async () => {
    const { seller, caseId } = await sellerWithProduct();
    const a = [
      { minQty: '10', discountPercent: '3' },
      { minQty: '20', discountPercent: '4' },
    ];
    const b = [
      { minQty: '10', discountPercent: '2' },
      { minQty: '30', discountPercent: '6' },
    ];
    const results = await Promise.all([putTiers(seller, caseId, a), putTiers(seller, caseId, b)]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    const rows = await platformRows<{ min_qty: string; discount_percent: string }>(
      `select min_qty, discount_percent from tier_prices where packaging_id = $1 order by min_qty`,
      [caseId],
    );
    const asBody = rows.map((row) => ({
      minQty: String(Number(row.min_qty)),
      discountPercent: String(Number(row.discount_percent)),
    }));
    expect([a, b]).toContainEqual(asBody);
  });

  it('F3.9-V4 izin: pricing.view okur ama yazamaz (403); temsilci (assigned) de okur; perakendeci 403', async () => {
    const { seller, caseId } = await sellerWithProduct();
    expect((await putTiers(seller, caseId, [{ minQty: '10', discountPercent: '3' }])).status).toBe(
      200,
    );
    const accountant = await addMember(seller.businessId, 'seller_accountant');
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    for (const member of [accountant, rep]) {
      const read = await (
        await as(seller, member.userId)
      ).get(`/api/v1/tier-prices?packagingId=${caseId}`);
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      expect(
        (await putTiers(seller, caseId, [{ minQty: '5', discountPercent: '1' }], member.userId))
          .status,
      ).toBe(403);
    }
    const buyer = await newBuyer(region);
    const asBuyer = await as(buyer);
    expect((await asBuyer.get(`/api/v1/tier-prices?packagingId=${caseId}`)).status).toBe(403);
    expect(
      (await asBuyer.put('/api/v1/tier-prices', { packagingId: caseId, tiers: [] })).status,
    ).toBe(403);
  });

  it('F3.9-V5 explain qty doğrulaması: sıfır veya desen dışı 422', async () => {
    const { seller, caseId } = await sellerWithProduct();
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, new Date());
    for (const qty of ['0', '0.000', '-1', 'abc', '1.2345']) {
      const res = await (
        await as(seller)
      ).get(`/api/v1/prices/explain?buyerId=${buyer.businessId}&packagingId=${caseId}&qty=${qty}`);
      expect(res.status, qty).toBe(422);
    }
  });

  it('F3.9-V6 ambalaj silinince kademeleri de silinir (FK kaskadı)', async () => {
    const { seller, caseId } = await sellerWithProduct();
    expect((await putTiers(seller, caseId, [{ minQty: '10', discountPercent: '3' }])).status).toBe(
      200,
    );
    // Ürün kodu ambalaj silmez (taslakta varyant düzenlemesi); kaskad doğrudan SQL ile denenir.
    await businessRows(seller.businessId, 'delete from product_packaging where id = $1', [caseId]);
    expect(
      await platformRows('select 1 from tier_prices where packaging_id = $1', [caseId]),
    ).toEqual([]);
  });
});
