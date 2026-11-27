// F3.7a müşteriye özel fiyat API (US-035 AC1; ADR-0019 P3; kart K1–K8, S1 = A, S3 = A; R29, R30,
// R40). Gerçek PostgreSQL; uygulama bağlantısı RLS'e tabi app_user. Saat sabit: Asia/Baku
// 2026-11-10 23:59 (19:59Z), ileri tarih sınırı için 00:01'e ilerletilir. Kiracı izolasyonu
// customer-prices.isolation dosyasında.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser, connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { Clock, FixedClock } from '../../../core/clock';
import { withTenantTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { CustomerPricesRepository } from '../customer-prices.repository';
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

const BAKU_2359 = new Date('2026-11-10T19:59:00Z');
const BAKU_0001 = new Date('2026-11-10T20:01:00Z');
const BAKU_MIDNIGHT = '2026-11-10T20:00:00.000Z';

interface ExplainJson {
  source: string;
  unitPrice: { amount: string; currency: string } | null;
  vatIncluded: boolean | null;
  priceList: { id: string; name: string } | null;
  validFrom: string | null;
}

interface PageJson {
  items: {
    packagingId: string;
    variantId: string;
    sku: string;
    productName: Record<string, string>;
    packagingLevel: string;
    current: { unitPrice: string; validFrom: string } | null;
    scheduled: { unitPrice: string; validFrom: string }[];
  }[];
  nextCursor: string | null;
}

interface ErrorJson {
  code: string;
  details?: Record<string, unknown>;
}

describe('F3.7a müşteri fiyatı API (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let region: string;
  let cats: SeedCategories;
  const clock = new FixedClock(BAKU_2359);

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.7a müşteri fiyatı');
    cats = await seedCategories();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        { provide: Clock, useValue: clock },
      ],
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
      del: (url: string) => h.http().delete(url).set(set),
      patch: (url: string, body: unknown) =>
        h
          .http()
          .patch(url)
          .set(set)
          .send(body as object),
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

  const code = (res: { body: unknown }) => (res.body as ErrorJson).code;

  /** Varsayılan liste + bir ürün; satış birimi (koli) ve liste fiyatı. */
  async function sellerWithProduct(listPrice = '20') {
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
    const listId = (list.body as { id: string }).id;
    const product = await (await as(seller)).post('/api/v1/products', productBody(cats.child));
    expect(product.status, JSON.stringify(product.body)).toBe(201);
    const caseId = (
      product.body as { variants: { packaging: { id: string; level: string }[] }[] }
    ).variants[0]?.packaging.find((item) => item.level === 'case')?.id;
    if (caseId === undefined) throw new Error('ambalaj yok');
    const set = await (
      await as(seller)
    ).put(`/api/v1/price-lists/${listId}/items`, {
      items: [{ packagingId: caseId, unitPrice: listPrice }],
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    return { seller, listId, caseId };
  }

  async function explain(seller: Seller, buyer: Buyer, packagingId: string): Promise<ExplainJson> {
    const res = await (
      await as(seller)
    ).get(`/api/v1/prices/explain?buyerId=${buyer.businessId}&packagingId=${packagingId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as ExplainJson;
  }

  async function setCustomerPrice(
    seller: Seller,
    buyer: Buyer,
    items: { packagingId: string; unitPrice: string }[],
    extra: Record<string, unknown> = {},
    userId?: string,
  ) {
    return await (
      await as(seller, userId)
    ).put('/api/v1/customer-prices', { buyerId: buyer.businessId, items, ...extra });
  }

  async function page(seller: Seller, buyer: Buyer, userId?: string) {
    return await (
      await as(seller, userId)
    ).get(`/api/v1/customer-prices?buyerId=${buyer.businessId}`);
  }

  async function cancel(seller: Seller, connectionId: string) {
    await businessRows(
      seller.businessId,
      `update connections set status = 'cancelled', ended_at = $2, ended_by_side = 'seller',
              end_reason = 'other', ended_by_user_id = $3
        where id = $1`,
      [connectionId, clock.now(), seller.admin.userId],
    );
  }

  it('F3.7a-AC1 müşteri fiyatı bu perakendecide liste fiyatının yerine geçer (P3); diğer perakendeci liste fiyatını görür; GET ve audit', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    const other = await newBuyer(region);
    await activeConnection(seller, buyer, BAKU_2359);
    await activeConnection(seller, other, BAKU_2359);

    const res = await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '17.5' }]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ count: 1, validFrom: BAKU_2359.toISOString() });

    expect(await explain(seller, buyer, caseId)).toMatchObject({
      source: 'customer_price',
      unitPrice: { amount: '17.5000', currency: 'AZN' },
      // ƏDV bilgisi referans listeden; müşteri fiyatında liste adı yok.
      vatIncluded: true,
      priceList: null,
      validFrom: BAKU_2359.toISOString(),
    });
    expect(await explain(seller, other, caseId)).toMatchObject({
      source: 'default_list',
      unitPrice: { amount: '20.0000' },
    });

    const list = await page(seller, buyer);
    expect(list.status).toBe(200);
    const body = list.body as PageJson;
    expect(body.nextCursor).toBeNull();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      packagingId: caseId,
      packagingLevel: 'case',
      current: { unitPrice: '17.5000', validFrom: BAKU_2359.toISOString() },
      scheduled: [],
    });
    expect(body.items[0]?.sku).toEqual(expect.any(String));
    expect(body.items[0]?.productName.az).toEqual(expect.any(String));
    expect(((await page(seller, other)).body as PageJson).items).toEqual([]);

    const [audit] = await platformRows<{ before: unknown; after: unknown; target_id: string }>(
      `select before, after, target_id from audit_logs
        where action = 'customer_price.set' and business_id = $1`,
      [seller.businessId],
    );
    expect(audit?.target_id).toBe(buyer.businessId);
    expect(audit?.before).toEqual({ prices: [{ packagingId: caseId, unitPrice: null }] });
    expect(audit?.after).toEqual({
      validFrom: BAKU_2359.toISOString(),
      count: 1,
      prices: [{ packagingId: caseId, unitPrice: '17.5000' }],
    });
  });

  it('F3.7a-K4 ileri tarihli müşteri fiyatı Asia/Baku 00:00 (R29); bekleyen güncellenir, geçerli olmuş değişmez; bugün 422', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, BAKU_2359);
    expect(
      (await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '18' }])).status,
    ).toBe(200);

    const future = await setCustomerPrice(
      seller,
      buyer,
      [{ packagingId: caseId, unitPrice: '15' }],
      { validFrom: '2026-11-11' },
    );
    expect(future.status, JSON.stringify(future.body)).toBe(200);
    expect(future.body).toEqual({ count: 1, validFrom: BAKU_MIDNIGHT });
    // Bekleyen fiyat aynı günle güncellenir.
    await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '14' }], {
      validFrom: '2026-11-11',
    });
    expect(await explain(seller, buyer, caseId)).toMatchObject({
      source: 'customer_price',
      unitPrice: { amount: '18.0000' },
    });
    expect(((await page(seller, buyer)).body as PageJson).items[0]).toMatchObject({
      current: { unitPrice: '18.0000' },
      scheduled: [{ unitPrice: '14.0000', validFrom: BAKU_MIDNIGHT }],
    });

    clock.set(BAKU_0001);
    expect(await explain(seller, buyer, caseId)).toMatchObject({
      source: 'customer_price',
      unitPrice: { amount: '14.0000' },
      validFrom: BAKU_MIDNIGHT,
    });
    // Geçerli olmuş satır değişmez: hemen geçerli yeni fiyat yeni satır olarak eklenir.
    const again = await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '13' }]);
    expect(again.status).toBe(200);
    const rows = await businessRows<{ unit_price: string; valid_from: Date }>(
      seller.businessId,
      `select unit_price, valid_from from customer_prices where buyer_id = $1 order by valid_from`,
      [buyer.businessId],
    );
    expect(rows.map((row) => row.unit_price)).toEqual(['18.0000', '14.0000', '13.0000']);
    const today = await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '9' }], {
      validFrom: '2026-11-11',
    });
    expect(today.status).toBe(422);
    expect((today.body as ErrorJson).details).toEqual({ validFrom: ['must_be_future_day'] });
    clock.set(BAKU_2359);
  });

  it('F3.7a-K3 yazma yalnız aktif bağlantıya (404); iptalden sonra fiyat saklanır ve listelenir (S3 = A); başka satıcının ambalajı ve branchId 422', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    const stranger = await newBuyer(region);
    const connectionId = await activeConnection(seller, buyer, BAKU_2359);

    const none = await setCustomerPrice(seller, stranger, [
      { packagingId: caseId, unitPrice: '1' },
    ]);
    expect(none.status).toBe(404);
    expect(
      (await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '16' }])).status,
    ).toBe(200);

    const foreign = (await sellerWithProduct('5')).caseId;
    const bad = await setCustomerPrice(seller, buyer, [
      { packagingId: caseId, unitPrice: '16' },
      { packagingId: foreign, unitPrice: '1' },
    ]);
    expect(bad.status).toBe(422);
    expect((bad.body as ErrorJson).details).toEqual({ 'items.1.packagingId': ['not_found'] });
    const branch = await setCustomerPrice(
      seller,
      buyer,
      [{ packagingId: caseId, unitPrice: '1' }],
      {
        branchId: buyer.businessId,
      },
    );
    expect(branch.status).toBe(422);
    const negative = await setCustomerPrice(seller, buyer, [
      { packagingId: caseId, unitPrice: '-1' },
    ]);
    expect(negative.status).toBe(422);

    await cancel(seller, connectionId);
    const after = await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '1' }]);
    expect(after.status).toBe(404);
    expect(code(after)).toBe('NOT_FOUND');
    const kept = (await page(seller, buyer)).body as PageJson;
    expect(kept.items[0]?.current?.unitPrice).toBe('16.0000');
  });

  it('F3.7a-K3-CONC fiyat yazımı bağlantı satırını FOR SHARE kilitler: iptal yazım bitene kadar bekler', async () => {
    clock.set(BAKU_2359);
    const { seller } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    const connectionId = await activeConnection(seller, buyer, BAKU_2359);
    const repository = new CustomerPricesRepository();

    let releaseLock: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const writer = withTenantTx({ businessId: seller.businessId, userId: null }, async (tx) => {
      const connection = await repository.activeConnectionTx(
        tx,
        seller.businessId,
        buyer.businessId,
        'share',
      );
      expect(connection).toBeDefined();
      locked();
      await held;
    });
    await lockTaken;

    const client = await connectAsMigrator();
    try {
      await client.query('begin');
      await client.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
      await client.query("set local lock_timeout = '300ms'");
      let error: unknown;
      try {
        await client.query(`update connections set end_reason = 'other' where id = $1`, [
          connectionId,
        ]);
      } catch (caught) {
        error = caught;
      }
      expect(pgErrorCode(error)).toBe('55P03');
      await client.query('rollback');
    } finally {
      await client.end();
      releaseLock();
      await writer;
    }
  });

  it('F3.7a-K6 kaldırma (S1 = A): liste fiyatına döner; geçerli ve ileri tarihli satırlar silinir; yoksa 404; audit', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, BAKU_2359);
    await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '17' }]);
    await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '16' }], {
      validFrom: '2026-11-12',
    });

    const url = `/api/v1/customer-prices?buyerId=${buyer.businessId}&packagingId=${caseId}`;
    const removed = await (await as(seller)).del(url);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body).toEqual({ count: 2 });
    expect(await explain(seller, buyer, caseId)).toMatchObject({
      source: 'default_list',
      unitPrice: { amount: '20.0000' },
    });
    expect(((await page(seller, buyer)).body as PageJson).items).toEqual([]);
    expect((await (await as(seller)).del(url)).status).toBe(404);

    const [audit] = await platformRows<{ before: { prices: unknown[] }; after: unknown }>(
      `select before, after from audit_logs
        where action = 'customer_price.removed' and business_id = $1`,
      [seller.businessId],
    );
    expect(audit?.after).toBeNull();
    expect(audit?.before).toEqual({
      packagingId: caseId,
      prices: expect.arrayContaining([
        { unitPrice: '17.0000', validFrom: BAKU_2359.toISOString() },
        { unitPrice: '16.0000', validFrom: '2026-11-11T20:00:00.000Z' },
      ]) as unknown,
    });
  });

  it('F3.7a-K5 yetki: temsilci yalnız atandığı müşterinin fiyatlarını görür, yazamaz ve kaldıramaz; perakendeci 403', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    const connectionId = await activeConnection(seller, buyer, BAKU_2359);
    await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '17' }]);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);

    expect((await page(seller, buyer, rep.userId)).status).toBe(404);
    const assign = await (
      await as(seller)
    ).patch(`/api/v1/connections/${connectionId}/terms`, {
      salesRepMembershipId: rep.membershipId,
    });
    expect(assign.status, JSON.stringify(assign.body)).toBe(200);
    const seen = await page(seller, buyer, rep.userId);
    expect(seen.status).toBe(200);
    expect((seen.body as PageJson).items).toHaveLength(1);
    expect(
      (
        await setCustomerPrice(
          seller,
          buyer,
          [{ packagingId: caseId, unitPrice: '1' }],
          {},
          rep.userId,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await (
          await as(seller, rep.userId)
        ).del(`/api/v1/customer-prices?buyerId=${buyer.businessId}&packagingId=${caseId}`)
      ).status,
    ).toBe(403);

    const buyerApi = await as(buyer);
    expect((await buyerApi.get(`/api/v1/customer-prices?buyerId=${buyer.businessId}`)).status).toBe(
      403,
    );
    expect(
      (
        await buyerApi.put('/api/v1/customer-prices', {
          buyerId: buyer.businessId,
          items: [{ packagingId: caseId, unitPrice: '1' }],
        })
      ).status,
    ).toBe(403);
  });

  it('F3.7a-R40 arşivlenen perakendecinin müşteri fiyatları silinir (tetikleyici); başka perakendecininki kalır', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    const other = await newBuyer(region);
    await activeConnection(seller, buyer, BAKU_2359);
    await activeConnection(seller, other, BAKU_2359);
    await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '17' }]);
    await setCustomerPrice(seller, other, [{ packagingId: caseId, unitPrice: '18' }]);

    await platformRows(`update businesses set status = 'archived' where id = $1`, [
      buyer.businessId,
    ]);
    const rows = await platformRows<{ buyer_id: string }>(
      `select buyer_id from customer_prices where seller_id = $1 order by buyer_id`,
      [seller.businessId],
    );
    expect(rows.map((row) => row.buyer_id)).toEqual([other.businessId]);
  });
  /** Satıcı bağlamında, işlenmemiş bir işlemde müşteri fiyatı satırı yazan app_user bağlantısı. */
  async function openWriter(seller: Seller) {
    const client = await connectAsAppUser();
    await client.query('begin');
    await client.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
    return client;
  }

  const insertPrice = `insert into customer_prices (seller_id, buyer_id, packaging_id, unit_price,
                                                     valid_from, created_at)
                       values ($1, $2, $3, 9, now(), now())`;

  it('F3.7b-R40-CONC arşiv, işlenmemiş fiyat yazımını bekler ve satırı siler (Müfettiş 30 not 1)', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, BAKU_2359);
    const writer = await openWriter(seller);
    try {
      await writer.query(insertPrice, [seller.businessId, buyer.businessId, caseId]);
      let archived = false;
      const archive = platformRows(`update businesses set status = 'archived' where id = $1`, [
        buyer.businessId,
      ]).then(() => {
        archived = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Arşiv tetikleyicisi tablo kilidini bekliyor.
      expect(archived).toBe(false);
      await writer.query('commit');
      await archive;
    } finally {
      await writer.end();
    }
    const rows = await platformRows(`select 1 from customer_prices where buyer_id = $1`, [
      buyer.businessId,
    ]);
    expect(rows).toEqual([]);
  });

  it('F3.7b-R40-CONC arşivden sonra başlayan yazım bekler ve 55000 ile reddedilir; uç 404 döner', async () => {
    clock.set(BAKU_2359);
    const { seller, caseId } = await sellerWithProduct('20');
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, BAKU_2359);
    const archiver = await connectAsMigrator();
    const writer = await openWriter(seller);
    try {
      await archiver.query('begin');
      await archiver.query("select set_config('app.is_platform', 'true', true)");
      await archiver.query(`update businesses set status = 'archived' where id = $1`, [
        buyer.businessId,
      ]);
      const write = writer.query(insertPrice, [seller.businessId, buyer.businessId, caseId]).then(
        () => undefined,
        (error: unknown) => error,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await archiver.query('commit');
      expect(pgErrorCode(await write)).toBe('55000');
      await writer.query('rollback');
    } finally {
      await writer.end();
      await archiver.end();
    }
    // Bağlantı hâlâ aktif olsa da (bu yol bağlantıyı kapatmıyor) uç arşivli perakendeciye 404.
    const res = await setCustomerPrice(seller, buyer, [{ packagingId: caseId, unitPrice: '5' }]);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    const rows = await platformRows(`select 1 from customer_prices where buyer_id = $1`, [
      buyer.businessId,
    ]);
    expect(rows).toEqual([]);
  });
});
