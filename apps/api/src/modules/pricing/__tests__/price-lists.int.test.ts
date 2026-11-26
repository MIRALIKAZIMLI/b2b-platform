// F3.6a fiyat listeleri API (US-034 AC1, AC2, AC4–AC6; kart K1–K10, K2 = A). Gerçek PostgreSQL;
// uygulama bağlantısı RLS'e tabi app_user. Saat sabit: Asia/Baku 2026-11-10 23:59 (19:59Z), R29
// sınırı için 00:01'e ilerletilir. Kiracı izolasyonu price-lists.isolation dosyasında.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { Clock, FixedClock } from '../../../core/clock';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
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

interface ListJson {
  id: string;
  name: string;
  currency: string;
  vatIncluded: boolean;
  vatRate: string;
  isDefault: boolean;
  status: string;
  itemCount: number;
}

interface ExplainJson {
  source: string;
  unitPrice: { amount: string; currency: string } | null;
  finalUnitPrice: { amount: string; currency: string } | null;
  vatIncluded: boolean | null;
  vatRate: string | null;
  priceList: { id: string; name: string } | null;
  validFrom: string | null;
}

interface ErrorJson {
  code: string;
  details?: Record<string, unknown>;
}

describe('F3.6a fiyat listeleri API (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let region: string;
  let cats: SeedCategories;
  const clock = new FixedClock(BAKU_2359);

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.6a fiyat');
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

  async function headers(userId: string, businessId: string) {
    return { ...(await h.bearer(userId)), 'X-Business-Id': businessId };
  }

  async function as(seller: Seller, userId = seller.admin.userId) {
    const set = await headers(userId, seller.businessId);
    return {
      get: (url: string) => h.http().get(url).set(set),
      post: (url: string, body: unknown) =>
        h
          .http()
          .post(url)
          .set(set)
          .send(body as object),
      patch: (url: string, body: unknown) =>
        h
          .http()
          .patch(url)
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

  const listBody = (name: string, extra: Record<string, unknown> = {}) => ({
    name,
    currency: 'AZN',
    vatIncluded: true,
    vatRate: '18',
    ...extra,
  });

  async function createList(seller: Seller, name: string, extra: Record<string, unknown> = {}) {
    const res = await (await as(seller)).post('/api/v1/price-lists', listBody(name, extra));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as ListJson;
  }

  /** Ürün açar; satış birimi (koli) ve adet ambalaj kimliklerini döner. */
  async function packagingOf(seller: Seller): Promise<{ caseId: string; unitId: string }> {
    const res = await (await as(seller)).post('/api/v1/products', productBody(cats.child));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const packaging = (res.body as { variants: { packaging: { id: string; level: string }[] }[] })
      .variants[0]?.packaging;
    const caseId = packaging?.find((item) => item.level === 'case')?.id;
    const unitId = packaging?.find((item) => item.level === 'unit')?.id;
    if (caseId === undefined || unitId === undefined) throw new Error('ambalaj yok');
    return { caseId, unitId };
  }

  async function setPrices(
    seller: Seller,
    listId: string,
    items: { packagingId: string; unitPrice: string }[],
    validFrom?: string,
  ) {
    return await (
      await as(seller)
    ).put(`/api/v1/price-lists/${listId}/items`, {
      items,
      ...(validFrom === undefined ? {} : { validFrom }),
    });
  }

  async function explain(seller: Seller, buyer: Buyer, packagingId: string, userId?: string) {
    return await (
      await as(seller, userId)
    ).get(`/api/v1/prices/explain?buyerId=${buyer.businessId}&packagingId=${packagingId}`);
  }

  async function explainOk(seller: Seller, buyer: Buyer, packagingId: string) {
    const res = await explain(seller, buyer, packagingId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as ExplainJson;
  }

  const code = (res: { body: unknown }) => (res.body as ErrorJson).code;

  it('F3.6a-AC1 ilk liste varsayılan olur, ikincisi olmaz; profil aynı listeyi gösterir; audit', async () => {
    clock.set(BAKU_2359);
    const seller = await newSeller(region);
    const first = await createList(seller, 'Əsas');
    expect(first).toMatchObject({
      name: 'Əsas',
      currency: 'AZN',
      vatIncluded: true,
      vatRate: '18.00',
      isDefault: true,
      status: 'active',
      itemCount: 0,
    });
    const second = await createList(seller, 'Böyük marketlər', { vatIncluded: false });
    expect(second.isDefault).toBe(false);

    const res = await (await as(seller)).get('/api/v1/price-lists');
    expect(res.status).toBe(200);
    expect(
      (res.body as { items: ListJson[] }).items.map((item) => [item.id, item.isDefault]),
    ).toEqual([
      [first.id, true],
      [second.id, false],
    ]);
    const [profile] = await platformRows<{ default_price_list_id: string }>(
      'select default_price_list_id from seller_profiles where business_id = $1',
      [seller.businessId],
    );
    expect(profile?.default_price_list_id).toBe(first.id);
    const audits = await platformRows<{ action: string }>(
      `select action from audit_logs where target_type = 'price_list' and business_id = $1`,
      [seller.businessId],
    );
    expect(audits.map((row) => row.action)).toEqual(['price_list.created', 'price_list.created']);
  });

  it('F3.6a-AC1-CONC iki paralel "ilk liste" isteğinde tek varsayılan', async () => {
    const seller = await newSeller(region);
    const client = await as(seller);
    const results = await Promise.all([
      client.post('/api/v1/price-lists', listBody('A')),
      client.post('/api/v1/price-lists', listBody('B')),
    ]);
    expect(results.map((res) => res.status)).toEqual([201, 201]);
    const rows = await businessRows<{ is_default: boolean }>(
      seller.businessId,
      'select is_default from price_lists where seller_id = $1',
      [seller.businessId],
    );
    expect(rows.filter((row) => row.is_default)).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it('F3.6a-AC1 doğrulama: para birimi satıcınınki değil 422 CURRENCY_MISMATCH (K6); gövde 422', async () => {
    const seller = await newSeller(region);
    const client = await as(seller);
    const usd = await client.post('/api/v1/price-lists', listBody('USD', { currency: 'USD' }));
    expect(usd.status).toBe(422);
    expect(code(usd)).toBe('CURRENCY_MISMATCH');
    for (const body of [
      listBody(' '),
      listBody('X', { vatRate: '100.01' }),
      listBody('X', { vatRate: '18.123' }),
      listBody('X', { currency: 'azn' }),
      { ...listBody('X'), extra: 1 },
    ]) {
      const res = await client.post('/api/v1/price-lists', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(code(res)).toBe('VALIDATION_FAILED');
    }
  });

  it('F3.6a-K1/K3 varsayılan devri; varsayılan arşivlenemez; arşiv ve geri alma; arşivli liste varsayılan olamaz', async () => {
    const seller = await newSeller(region);
    const client = await as(seller);
    const first = await createList(seller, 'Bir');
    const second = await createList(seller, 'İki');

    const archiveDefault = await client.patch(`/api/v1/price-lists/${first.id}`, {
      status: 'archived',
    });
    expect(archiveDefault.status).toBe(409);
    expect(code(archiveDefault)).toBe('PRICE_LIST_DEFAULT_PROTECTED');

    const moved = await client.patch(`/api/v1/price-lists/${second.id}`, { isDefault: true });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect((moved.body as ListJson).isDefault).toBe(true);
    const lists = await businessRows<{ id: string; is_default: boolean }>(
      seller.businessId,
      'select id, is_default from price_lists where seller_id = $1 order by name',
      [seller.businessId],
    );
    expect(lists).toEqual([
      { id: first.id, is_default: false },
      { id: second.id, is_default: true },
    ]);
    const [profile] = await platformRows<{ default_price_list_id: string }>(
      'select default_price_list_id from seller_profiles where business_id = $1',
      [seller.businessId],
    );
    expect(profile?.default_price_list_id).toBe(second.id);

    // Varsayılanlık "false" ile kaldırılamaz (yalnız devredilir).
    const unset = await client.patch(`/api/v1/price-lists/${second.id}`, { isDefault: false });
    expect(unset.status).toBe(422);

    const archived = await client.patch(`/api/v1/price-lists/${first.id}`, {
      status: 'archived',
      name: 'Bir (köhnə)',
    });
    expect(archived.status, JSON.stringify(archived.body)).toBe(200);
    expect(archived.body).toMatchObject({ status: 'archived', name: 'Bir (köhnə)' });
    const toDefault = await client.patch(`/api/v1/price-lists/${first.id}`, { isDefault: true });
    expect(toDefault.status).toBe(409);
    expect(code(toDefault)).toBe('INVALID_STATE_TRANSITION');
    const again = await client.patch(`/api/v1/price-lists/${first.id}`, { status: 'archived' });
    expect(again.status, 'aynı durum geçiş değildir').toBe(200);
    const write = await setPrices(seller, first.id, [
      { packagingId: (await packagingOf(seller)).caseId, unitPrice: '1' },
    ]);
    expect(write.status).toBe(409);
    expect(code(write)).toBe('INVALID_STATE_TRANSITION');

    const restored = await client.patch(`/api/v1/price-lists/${first.id}`, { status: 'active' });
    expect(restored.status).toBe(200);
    const audits = await platformRows<{ action: string }>(
      `select action from audit_logs where target_type = 'price_list' and target_id = $1
        order by occurred_at, action`,
      [first.id],
    );
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining(['price_list.archived', 'price_list.restored', 'price_list.updated']),
    );
  });

  it('F3.6a-K2 müşteriye atanmış liste arşivlenemez 409 PRICE_LIST_IN_USE; bağlantıya başka satıcının veya arşivli listesi atanamaz', async () => {
    const seller = await newSeller(region);
    const other = await newSeller(region);
    const buyer = await newBuyer(region);
    const connectionId = await activeConnection(seller, buyer, BAKU_2359);
    const client = await as(seller);
    await createList(seller, 'Əsas');
    const special = await createList(seller, 'Xüsusi');
    const spare = await createList(seller, 'Ehtiyat');
    const foreign = await createList(other, 'Başqası');

    const assign = await client.patch(`/api/v1/connections/${connectionId}/terms`, {
      priceListId: special.id,
    });
    expect(assign.status, JSON.stringify(assign.body)).toBe(200);
    expect((assign.body as { terms: { priceListId: string } }).terms.priceListId).toBe(special.id);

    const blocked = await client.patch(`/api/v1/price-lists/${special.id}`, { status: 'archived' });
    expect(blocked.status).toBe(409);
    expect(code(blocked)).toBe('PRICE_LIST_IN_USE');
    expect((blocked.body as ErrorJson).details).toEqual({ connections: 1 });

    for (const priceListId of [foreign.id, crypto.randomUUID()]) {
      const res = await client.patch(`/api/v1/connections/${connectionId}/terms`, { priceListId });
      expect(res.status).toBe(422);
      expect((res.body as ErrorJson).details).toEqual({ priceListId: ['invalid_price_list'] });
    }
    expect(
      (await client.patch(`/api/v1/price-lists/${spare.id}`, { status: 'archived' })).status,
    ).toBe(200);
    const archivedAssign = await client.patch(`/api/v1/connections/${connectionId}/terms`, {
      priceListId: spare.id,
    });
    expect(archivedAssign.status).toBe(422);

    // Atama kaldırılınca (null = varsayılan) arşivlenebilir; audit önce/sonra liste kimliği taşır.
    const cleared = await client.patch(`/api/v1/connections/${connectionId}/terms`, {
      priceListId: null,
    });
    expect(cleared.status).toBe(200);
    expect(
      (await client.patch(`/api/v1/price-lists/${special.id}`, { status: 'archived' })).status,
    ).toBe(200);
    const [audit] = await platformRows<{ before: { priceListId: string | null } }>(
      `select before from audit_logs where action = 'connection.terms_updated' and target_id = $1
          and after->>'priceListId' is null`,
      [connectionId],
    );
    expect(audit?.before.priceListId).toBe(special.id);
  });

  it('F3.6a-AC6 ileri tarihli fiyat Asia/Baku 23:59 eski, 00:01 yeni (R29); bekleyen fiyat güncellenir (K5)', async () => {
    clock.set(BAKU_2359);
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    await activeConnection(seller, buyer, BAKU_2359);
    const list = await createList(seller, 'Əsas');
    const { caseId } = await packagingOf(seller);

    const now = await setPrices(seller, list.id, [{ packagingId: caseId, unitPrice: '10.5' }]);
    expect(now.status, JSON.stringify(now.body)).toBe(200);
    expect(now.body).toEqual({ count: 1, validFrom: BAKU_2359.toISOString() });

    // Bugün (Baku 2026-11-10) ileri gün değil.
    const today = await setPrices(
      seller,
      list.id,
      [{ packagingId: caseId, unitPrice: '12' }],
      '2026-11-10',
    );
    expect(today.status).toBe(422);
    expect((today.body as ErrorJson).details).toEqual({ validFrom: ['must_be_future_day'] });

    const scheduled = await setPrices(
      seller,
      list.id,
      [{ packagingId: caseId, unitPrice: '12' }],
      '2026-11-11',
    );
    expect(scheduled.body).toEqual({ count: 1, validFrom: BAKU_MIDNIGHT });
    // K5: henüz geçerli olmayan fiyat aynı günle yeniden gönderilince güncellenir.
    const corrected = await setPrices(
      seller,
      list.id,
      [{ packagingId: caseId, unitPrice: '12.25' }],
      '2026-11-11',
    );
    expect(corrected.body).toEqual({ count: 1, validFrom: BAKU_MIDNIGHT });

    const before = await explainOk(seller, buyer, caseId);
    expect(before).toMatchObject({
      source: 'default_list',
      unitPrice: { amount: '10.5000', currency: 'AZN' },
      finalUnitPrice: { amount: '10.5000', currency: 'AZN' },
      vatIncluded: true,
      vatRate: '18.00',
      priceList: { id: list.id, name: 'Əsas' },
      validFrom: BAKU_2359.toISOString(),
    });
    const items = await (await as(seller)).get(`/api/v1/price-lists/${list.id}/items`);
    expect(items.body).toEqual({
      items: [
        {
          packagingId: caseId,
          current: { unitPrice: '10.5000', validFrom: BAKU_2359.toISOString() },
          scheduled: [{ unitPrice: '12.2500', validFrom: BAKU_MIDNIGHT }],
        },
      ],
      nextCursor: null,
    });

    clock.set(BAKU_0001);
    const after = await explainOk(seller, buyer, caseId);
    expect(after).toMatchObject({
      source: 'default_list',
      unitPrice: { amount: '12.2500', currency: 'AZN' },
      validFrom: BAKU_MIDNIGHT,
    });
    // Geçerli olmuş satır artık değişmez: aynı gün artık "bugün" (422); yeni fiyat yeni satırdır.
    const late = await setPrices(
      seller,
      list.id,
      [{ packagingId: caseId, unitPrice: '1' }],
      '2026-11-11',
    );
    expect(late.status).toBe(422);
    const rows = await businessRows<{ unit_price: string }>(
      seller.businessId,
      'select unit_price from price_list_items where price_list_id = $1 order by valid_from',
      [list.id],
    );
    expect(rows.map((row) => row.unit_price)).toEqual(['10.5000', '12.2500']);
    const audits = await platformRows<{ after: unknown }>(
      `select after from audit_logs where action = 'price_list.items_set' and target_id = $1
        order by occurred_at`,
      [list.id],
    );
    expect(audits[0]?.after).toEqual({ count: 1, validFrom: BAKU_2359.toISOString() });
    clock.set(BAKU_2359);
  });

  it('F3.6a-AC2 atanmış listede fiyat varsa price_list, yoksa varsayılana düşer; AC4 hiç fiyat yoksa none', async () => {
    clock.set(BAKU_2359);
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const connectionId = await activeConnection(seller, buyer, BAKU_2359);
    const defaultList = await createList(seller, 'Əsas');
    const special = await createList(seller, 'Xüsusi', { vatIncluded: false });
    const { caseId, unitId } = await packagingOf(seller);
    const other = await packagingOf(seller);
    await setPrices(seller, defaultList.id, [
      { packagingId: caseId, unitPrice: '20' },
      { packagingId: unitId, unitPrice: '1' },
    ]);
    await setPrices(seller, special.id, [{ packagingId: caseId, unitPrice: '18.9' }]);
    await (
      await as(seller)
    ).patch(`/api/v1/connections/${connectionId}/terms`, { priceListId: special.id });

    expect(await explainOk(seller, buyer, caseId)).toMatchObject({
      source: 'price_list',
      unitPrice: { amount: '18.9000' },
      vatIncluded: false,
      priceList: { id: special.id, name: 'Xüsusi' },
    });
    expect(await explainOk(seller, buyer, unitId)).toMatchObject({
      source: 'default_list',
      unitPrice: { amount: '1.0000' },
      priceList: { id: defaultList.id },
    });
    expect(await explainOk(seller, buyer, other.caseId)).toEqual({
      unitPrice: null,
      source: 'none',
      tierDiscountPercent: null,
      branchDiscountPercent: null,
      finalUnitPrice: null,
      vatIncluded: null,
      vatRate: null,
      priceList: null,
      validFrom: null,
    });
  });

  it('F3.6a-AC5 açıklama yalnız aktif bağlantılı alıcı (404); temsilci yalnız atandığı müşteri; ambalaj kendi', async () => {
    clock.set(BAKU_2359);
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const stranger = await newBuyer(region);
    const connectionId = await activeConnection(seller, buyer, BAKU_2359);
    const list = await createList(seller, 'Əsas');
    const { caseId } = await packagingOf(seller);
    await setPrices(seller, list.id, [{ packagingId: caseId, unitPrice: '5' }]);

    expect((await explain(seller, stranger, caseId)).status).toBe(404);
    const otherSeller = await newSeller(region);
    const foreignPackaging = (await packagingOf(otherSeller)).caseId;
    expect((await explain(seller, buyer, foreignPackaging)).status).toBe(404);

    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    expect((await explain(seller, buyer, caseId, rep.userId)).status).toBe(404);
    const assign = await (
      await as(seller)
    ).patch(`/api/v1/connections/${connectionId}/terms`, {
      salesRepMembershipId: rep.membershipId,
    });
    expect(assign.status).toBe(200);
    expect((await explain(seller, buyer, caseId, rep.userId)).status).toBe(200);
    // Temsilci (pricing.view assigned) liste yazamaz.
    const write = await (await as(seller, rep.userId)).post('/api/v1/price-lists', listBody('R'));
    expect(write.status).toBe(403);

    // Perakendeci fiyat uçlarına erişemez (yetenek seller).
    const buyerSet = await headers(buyer.admin.userId, buyer.businessId);
    expect((await h.http().get('/api/v1/price-lists').set(buyerSet)).status).toBe(403);
    expect(
      (
        await h
          .http()
          .get(`/api/v1/prices/explain?buyerId=${buyer.businessId}&packagingId=${caseId}`)
          .set(buyerSet)
      ).status,
    ).toBe(403);
  });

  it('F3.6a-K7 toplu fiyat: başka satıcının ambalajı 422 alan hatası; tekrar eden ambalaj 422; ambalaj silinince fiyatı da silinir', async () => {
    clock.set(BAKU_2359);
    const seller = await newSeller(region);
    const other = await newSeller(region);
    const list = await createList(seller, 'Əsas');
    const { caseId, unitId } = await packagingOf(seller);
    const foreign = (await packagingOf(other)).caseId;

    const res = await setPrices(seller, list.id, [
      { packagingId: caseId, unitPrice: '1' },
      { packagingId: foreign, unitPrice: '1' },
    ]);
    expect(res.status).toBe(422);
    expect((res.body as ErrorJson).details).toEqual({ 'items.1.packagingId': ['not_found'] });
    const duplicate = await setPrices(seller, list.id, [
      { packagingId: caseId, unitPrice: '1' },
      { packagingId: caseId, unitPrice: '2' },
    ]);
    expect(duplicate.status).toBe(422);
    for (const unitPrice of ['-1', '1.12345', '12345678901', '']) {
      const bad = await setPrices(seller, list.id, [{ packagingId: caseId, unitPrice }]);
      expect(bad.status, unitPrice).toBe(422);
    }

    expect(
      (await setPrices(seller, list.id, [{ packagingId: unitId, unitPrice: '0' }])).status,
    ).toBe(200);
    await businessRows(seller.businessId, 'delete from product_packaging where id = $1', [unitId]);
    const rows = await businessRows(
      seller.businessId,
      'select 1 from price_list_items where packaging_id = $1',
      [unitId],
    );
    expect(rows).toHaveLength(0);
  });
});
