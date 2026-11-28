// F3.11a miktarlı stok (US-039 AC1, AC7; ADR-0018, R35, R36; kullanıcı kararları S1 = A, S2 = A).
// Gerçek PostgreSQL; uygulama bağlantısı RLS'e tabi app_user. Stok yalnız hareketle değişir
// (`stock_movements_apply` tetikleyicisi); sayım düzeltmesinde kullanıcı sayılan toplamı girer.
// "Son X koli" gösterim kuralı (AC6) `@b2b/shared` stock.test.ts'te; izolasyon stock.isolation'da.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { withTenantTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  addMember,
  businessRows,
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
} from './inventory-fixtures';

interface ErrorJson {
  code: string;
  details?: Record<string, unknown>;
}

interface StockRowJson {
  warehouseId: string;
  variantId: string;
  sku: string;
  onHand: string;
  reserved: string;
  available: string;
}

interface MovementJson {
  id: string;
  type: string;
  onHandDelta: string;
  lotNo: string | null;
  createdBy: string | null;
}

interface RecordJson {
  movement: MovementJson | null;
  stock: StockRowJson;
}

interface ProductJson {
  id: string;
  variants: { id: string; sku: string }[];
}

const num = (value: string | undefined) => Number(value);

describe('F3.11a miktarlı stok (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let region: string;
  let cats: SeedCategories;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.11a stok');
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
      post: (url: string, body: object, key: string | null = randomUUID()) => {
        const req = h.http().post(url).set(set);
        return (key === null ? req : req.set('Idempotency-Key', key)).send(body);
      },
      patch: (url: string, body: object) => h.http().patch(url).set(set).send(body),
    };
  }

  const admin = (seller: Seller) => as(seller.businessId, seller.admin.userId);

  async function newWarehouse(seller: Seller, name: string): Promise<string> {
    const res = await (await admin(seller)).post('/api/v1/warehouses', { name });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { id: string }).id;
  }

  async function newProduct(seller: Seller): Promise<ProductJson> {
    const res = await (await admin(seller)).post('/api/v1/products', productBody(cats.child));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as ProductJson;
  }

  async function setup() {
    const seller = await newSeller(region);
    const warehouseId = await newWarehouse(seller, 'Əsas anbar');
    const product = await newProduct(seller);
    const variantId = product.variants[0]?.id ?? '';
    return { seller, warehouseId, product, variantId };
  }

  async function move(
    seller: Seller,
    body: Record<string, unknown>,
    userId = seller.admin.userId,
    key: string | null = randomUUID(),
  ) {
    return await (await as(seller.businessId, userId)).post('/api/v1/stock/movements', body, key);
  }

  async function onHand(seller: Seller, warehouseId: string, variantId: string) {
    const [row] = await businessRows<{ on_hand: string; reserved: string }>(
      seller.businessId,
      'select on_hand::text, reserved::text from stock where warehouse_id = $1 and variant_id = $2',
      [warehouseId, variantId],
    );
    return row;
  }

  async function movements(seller: Seller, variantId: string) {
    return await businessRows<{ type: string; on_hand_delta: string; created_by: string | null }>(
      seller.businessId,
      `select type, on_hand_delta::text, created_by from stock_movements
        where variant_id = $1 order by created_at, id`,
      [variantId],
    );
  }

  it('F3.11a-AC1 mal girişi on_hand değerini artırır ve receipt hareketi yazılır; liste ve geçmiş okunur', async () => {
    const { seller, warehouseId, variantId, product } = await setup();
    const first = await move(seller, {
      warehouseId,
      variantId,
      type: 'receipt',
      qty: '24',
      lotNo: 'L-1',
      expiryDate: '2027-06-30',
      note: 'Tədarükçüdən',
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const body = first.body as RecordJson;
    expect(body.movement).toMatchObject({
      type: 'receipt',
      lotNo: 'L-1',
      createdBy: seller.admin.userId,
    });
    expect(num(body.movement?.onHandDelta)).toBe(24);
    expect(num(body.stock.onHand)).toBe(24);
    expect(num(body.stock.available)).toBe(24);

    const second = await move(seller, { warehouseId, variantId, type: 'receipt', qty: '0.5' });
    expect(num((second.body as RecordJson).stock.onHand)).toBe(24.5);
    expect(num((await onHand(seller, warehouseId, variantId))?.on_hand)).toBe(24.5);

    const list = await (await admin(seller)).get('/api/v1/stock');
    expect(list.status).toBe(200);
    expect((list.body as { items: StockRowJson[] }).items).toEqual([
      expect.objectContaining({
        warehouseId,
        variantId,
        sku: product.variants[0]?.sku,
        onHand: expect.stringMatching(/^24\.5/) as unknown as string,
      }),
    ]);
    const history = await (
      await admin(seller)
    ).get(`/api/v1/stock/movements?variantId=${variantId}`);
    expect(history.status).toBe(200);
    const items = (history.body as { items: MovementJson[] }).items;
    expect(items.map((item) => num(item.onHandDelta))).toEqual([0.5, 24]);
  });

  it('F3.11a-AC7 sayım düzeltmesi sayılan toplamı girer (S1 = A): fark hareketi yazılır; aynı sayı hareket yazmaz; ilk sayım 0 satırı açar', async () => {
    const { seller, warehouseId, variantId } = await setup();
    await move(seller, { warehouseId, variantId, type: 'receipt', qty: '40' });
    const counted = await move(seller, { warehouseId, variantId, type: 'adjustment', qty: '37' });
    expect(counted.status).toBe(201);
    const body = counted.body as RecordJson;
    expect(body.movement?.type).toBe('adjustment');
    expect(num(body.movement?.onHandDelta)).toBe(-3);
    expect(num(body.stock.onHand)).toBe(37);

    const same = await move(seller, { warehouseId, variantId, type: 'adjustment', qty: '37.000' });
    expect(same.status).toBe(201);
    expect((same.body as RecordJson).movement).toBeNull();
    expect((await movements(seller, variantId)).map((m) => m.type)).toEqual([
      'receipt',
      'adjustment',
    ]);

    const zero = await move(seller, { warehouseId, variantId, type: 'adjustment', qty: '0' });
    expect(num((zero.body as RecordJson).stock.onHand)).toBe(0);

    // İlk sayımı 0 olan varyant: 0 farklı hareket satırı açar ("sayıldı").
    const other = await newProduct(seller);
    const otherVariant = other.variants[0]?.id ?? '';
    const firstZero = await move(seller, {
      warehouseId,
      variantId: otherVariant,
      type: 'adjustment',
      qty: '0',
    });
    expect(firstZero.status).toBe(201);
    expect(num((firstZero.body as RecordJson).movement?.onHandDelta)).toBe(0);
    expect(num((await onHand(seller, warehouseId, otherVariant))?.on_hand)).toBe(0);
    const again = await move(seller, {
      warehouseId,
      variantId: otherVariant,
      type: 'adjustment',
      qty: '0',
    });
    expect((again.body as RecordJson).movement).toBeNull();
  });

  it('F3.11a-AC7 on_hand doğrudan değiştirilemez: app_user stok satırına yazamaz, hareketi güncelleyemez/silemez (42501); tetikleyici etkin', async () => {
    const { seller, warehouseId, variantId } = await setup();
    await move(seller, { warehouseId, variantId, type: 'receipt', qty: '10' });
    const attempts = [
      sql`update stock set on_hand = 999 where variant_id = ${variantId}::uuid`,
      sql`update stock set low_threshold = 1 where variant_id = ${variantId}::uuid`,
      sql`delete from stock where variant_id = ${variantId}::uuid`,
      sql`insert into stock (seller_id, warehouse_id, variant_id, on_hand, updated_at)
          values (${seller.businessId}::uuid, ${warehouseId}::uuid, ${randomUUID()}::uuid, 5, now())`,
      sql`update stock_movements set on_hand_delta = 999 where variant_id = ${variantId}::uuid`,
      sql`delete from stock_movements where variant_id = ${variantId}::uuid`,
    ];
    for (const attempt of attempts) {
      await expect(
        withTenantTx({ businessId: seller.businessId, userId: null }, (tx) => tx.execute(attempt)),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    }
    expect(num((await onHand(seller, warehouseId, variantId))?.on_hand)).toBe(10);
    expect(await movements(seller, variantId)).toHaveLength(1);

    const [guard] = await platformRows<Record<string, unknown>>(
      `select (select tgenabled from pg_trigger where tgname = 'stock_movements_apply'
                and tgrelid = 'stock_movements'::regclass) as trigger_enabled,
              has_table_privilege('app_user', 'stock', 'SELECT') as stock_select,
              has_any_column_privilege('app_user', 'stock', 'INSERT') as stock_insert,
              has_any_column_privilege('app_user', 'stock', 'UPDATE') as stock_update,
              has_table_privilege('app_user', 'stock', 'DELETE') as stock_delete,
              has_table_privilege('app_user', 'stock_movements', 'INSERT') as movement_insert,
              has_any_column_privilege('app_user', 'stock_movements', 'UPDATE') as movement_update,
              has_table_privilege('app_user', 'stock_movements', 'DELETE') as movement_delete,
              (select count(*)::int from pg_policies
                where tablename in ('stock', 'stock_movements')) as policies,
              (select array_agg(conname::text order by conname) from pg_constraint
                where contype = 'f' and conrelid in ('stock'::regclass, 'stock_movements'::regclass))
                as foreign_keys`,
    );
    expect(guard).toEqual({
      trigger_enabled: 'O',
      stock_select: true,
      stock_insert: false,
      stock_update: false,
      stock_delete: false,
      movement_insert: true,
      movement_update: false,
      movement_delete: false,
      policies: 4,
      foreign_keys: [
        'stock_movements_created_by_users_id_fk',
        'stock_movements_stock_fk',
        'stock_seller_id_businesses_id_fk',
        'stock_variant_fk',
        'stock_warehouse_fk',
      ],
    });
  });

  it('F3.11a-AC7 doğrudan hareket eklemek de stoğu yalnız hareket kadar değiştirir; negatif stok hareketi geri alır', async () => {
    const { seller, warehouseId, variantId } = await setup();
    await move(seller, { warehouseId, variantId, type: 'receipt', qty: '5' });
    await expect(
      withTenantTx({ businessId: seller.businessId, userId: null }, (tx) =>
        tx.execute(sql`insert into stock_movements
            (id, seller_id, warehouse_id, variant_id, type, on_hand_delta, created_at)
          values (${randomUUID()}::uuid, ${seller.businessId}::uuid, ${warehouseId}::uuid,
                  ${variantId}::uuid, 'adjustment', -6, now())`),
      ),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    expect(num((await onHand(seller, warehouseId, variantId))?.on_hand)).toBe(5);
    expect(await movements(seller, variantId)).toHaveLength(1);
  });

  it('F3.11a-V4 sayılan miktar rezerveden az olamaz (409 STOCK_INSUFFICIENT); stok değişmez', async () => {
    const { seller, warehouseId, variantId } = await setup();
    await move(seller, { warehouseId, variantId, type: 'receipt', qty: '20' });
    // Rezervasyon F4.4'te; burada tetikleyici yoluyla doğrudan bir `reserve` hareketi.
    await businessRows(
      seller.businessId,
      `insert into stock_movements
         (id, seller_id, warehouse_id, variant_id, type, on_hand_delta, reserved_delta, created_at)
       values ($1, $2, $3, $4, 'reserve', 0, 8, now())`,
      [randomUUID(), seller.businessId, warehouseId, variantId],
    );
    const res = await move(seller, { warehouseId, variantId, type: 'adjustment', qty: '7' });
    expect(res.status).toBe(409);
    expect((res.body as ErrorJson).code).toBe('STOCK_INSUFFICIENT');
    expect(await onHand(seller, warehouseId, variantId)).toEqual({
      on_hand: '20.000',
      reserved: '8.000',
    });
    const ok = await move(seller, { warehouseId, variantId, type: 'adjustment', qty: '8' });
    expect(num((ok.body as RecordJson).stock.available)).toBe(0);
  });

  it('F3.11a-CONC eşzamanlı mal girişleri ve sayımlar kayıpsız sıralanır', async () => {
    const { seller, warehouseId, variantId } = await setup();
    const receipts = await Promise.all(
      Array.from({ length: 8 }, () =>
        move(seller, { warehouseId, variantId, type: 'receipt', qty: '3' }),
      ),
    );
    expect(receipts.map((r) => r.status)).toEqual(Array.from({ length: 8 }, () => 201));
    expect(num((await onHand(seller, warehouseId, variantId))?.on_hand)).toBe(24);

    // Aynı sayım aynı anda beş kez: tek fark hareketi, sonuç sayılan toplam.
    const counts = await Promise.all(
      Array.from({ length: 5 }, () =>
        move(seller, { warehouseId, variantId, type: 'adjustment', qty: '30' }),
      ),
    );
    expect(counts.map((r) => r.status)).toEqual(Array.from({ length: 5 }, () => 201));
    expect(counts.filter((r) => (r.body as RecordJson).movement !== null)).toHaveLength(1);
    expect(num((await onHand(seller, warehouseId, variantId))?.on_hand)).toBe(30);

    // Servis kilidi olmadan aynı yeni satıra eşzamanlı doğrudan hareketler: tetikleyici satırı bir
    // kez açar, diğerleri güncellemeye döner (tekil ihlali kaybolmaz).
    const fresh = (await newProduct(seller)).variants[0]?.id ?? '';
    await Promise.all(
      Array.from({ length: 6 }, () =>
        withTenantTx({ businessId: seller.businessId, userId: null }, (tx) =>
          tx.execute(sql`insert into stock_movements
              (id, seller_id, warehouse_id, variant_id, type, on_hand_delta, created_at)
            values (${randomUUID()}::uuid, ${seller.businessId}::uuid, ${warehouseId}::uuid,
                    ${fresh}::uuid, 'receipt', 2, now())`),
        ),
      ),
    );
    expect(num((await onHand(seller, warehouseId, fresh))?.on_hand)).toBe(12);

    // Hareketlerin toplamı her zaman satırdaki sayıya eşit.
    const [sum] = await businessRows<{ total: string }>(
      seller.businessId,
      'select sum(on_hand_delta)::text as total from stock_movements where variant_id = $1',
      [variantId],
    );
    expect(num(sum?.total)).toBe(30);
  });

  it('F3.11a-SCOPE depo sorumlusu yalnız kendi deposunda yazar ve okur; başka depo 403, deposu olmayan 403', async () => {
    const { seller, warehouseId, variantId } = await setup();
    const second = await newWarehouse(seller, 'İkinci anbar');
    const keeper = await addMember(seller.businessId, 'seller_warehouse');
    await platformRows('update memberships set warehouse_id = $1 where id = $2', [
      warehouseId,
      keeper.membershipId,
    ]);
    const unassigned = await addMember(seller.businessId, 'seller_warehouse');
    await move(seller, { warehouseId: second, variantId, type: 'receipt', qty: '9' });

    const own = await move(
      seller,
      { warehouseId, variantId, type: 'receipt', qty: '4' },
      keeper.userId,
    );
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    const foreign = await move(
      seller,
      { warehouseId: second, variantId, type: 'receipt', qty: '4' },
      keeper.userId,
    );
    expect(foreign.status).toBe(403);
    expect(num((await onHand(seller, second, variantId))?.on_hand)).toBe(9);

    const keeperHttp = await as(seller.businessId, keeper.userId);
    const list = await keeperHttp.get('/api/v1/stock');
    expect((list.body as { items: StockRowJson[] }).items.map((i) => i.warehouseId)).toEqual([
      warehouseId,
    ]);
    expect((await keeperHttp.get(`/api/v1/stock?warehouseId=${second}`)).status).toBe(403);
    expect((await keeperHttp.get(`/api/v1/stock/movements?warehouseId=${second}`)).status).toBe(
      403,
    );
    const history = await keeperHttp.get('/api/v1/stock/movements');
    expect(
      (history.body as { items: { warehouseId: string }[] }).items.every(
        (i) => i.warehouseId === warehouseId,
      ),
    ).toBe(true);

    expect(
      (await move(seller, { warehouseId, variantId, type: 'receipt', qty: '1' }, unassigned.userId))
        .status,
    ).toBe(403);
    expect(
      (await (await as(seller.businessId, unassigned.userId)).get('/api/v1/stock')).status,
    ).toBe(403);
  });

  it('F3.11a-SCOPE izinler: muhasebe okur ama yazamaz; perakendeci 403', async () => {
    const { seller, warehouseId, variantId } = await setup();
    const accountant = await addMember(seller.businessId, 'seller_accountant');
    const accountantHttp = await as(seller.businessId, accountant.userId);
    expect((await accountantHttp.get('/api/v1/stock')).status).toBe(200);
    expect(
      (await move(seller, { warehouseId, variantId, type: 'receipt', qty: '1' }, accountant.userId))
        .status,
    ).toBe(403);
    const buyer = await newBuyer(region);
    const buyerHttp = await as(buyer.businessId, buyer.admin.userId);
    expect((await buyerHttp.get('/api/v1/stock')).status).toBe(403);
    expect(
      (
        await buyerHttp.post('/api/v1/stock/movements', {
          warehouseId,
          variantId,
          type: 'receipt',
          qty: '1',
        })
      ).status,
    ).toBe(403);
  });

  it('F3.11a-IDEM aynı Idempotency-Key ile tekrar tek hareket yazar; anahtarsız istek 422', async () => {
    const { seller, warehouseId, variantId } = await setup();
    const key = randomUUID();
    const body = { warehouseId, variantId, type: 'receipt', qty: '6' };
    const first = await move(seller, body, seller.admin.userId, key);
    const replay = await move(seller, body, seller.admin.userId, key);
    expect([first.status, replay.status]).toEqual([201, 201]);
    expect((replay.body as RecordJson).movement?.id).toBe((first.body as RecordJson).movement?.id);
    expect(await movements(seller, variantId)).toHaveLength(1);
    expect(num((await onHand(seller, warehouseId, variantId))?.on_hand)).toBe(6);

    const conflict = await move(seller, { ...body, qty: '7' }, seller.admin.userId, key);
    expect(conflict.status).toBe(409);
    const missing = await move(seller, body, seller.admin.userId, null);
    expect(missing.status).toBe(422);
    expect(await movements(seller, variantId)).toHaveLength(1);
  });

  it('F3.11a-V1 gövde doğrulanır (422): negatif, 4 ondalık, sıfır giriş, bilinmeyen tür ve alan', async () => {
    const { seller, warehouseId, variantId } = await setup();
    const base = { warehouseId, variantId };
    const bad = [
      { ...base, type: 'receipt', qty: '-1' },
      { ...base, type: 'receipt', qty: '1.0005' },
      { ...base, type: 'receipt', qty: '0' },
      { ...base, type: 'receipt', qty: 5 },
      { ...base, type: 'reserve', qty: '1' },
      { ...base, type: 'receipt', qty: '1', onHand: '9' },
      { ...base, type: 'receipt', qty: '1', expiryDate: '2027-13-01' },
      { ...base, type: 'receipt', qty: '1', lotNo: 'x'.repeat(65) },
      { ...base, variantId: 'abc', type: 'receipt', qty: '1' },
    ];
    for (const body of bad) {
      const res = await move(seller, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect(await movements(seller, variantId)).toHaveLength(0);
    expect((await (await admin(seller)).get('/api/v1/stock?cursor=bozuk')).status).toBe(422);
    expect((await (await admin(seller)).get('/api/v1/stock?limit=500')).status).toBe(422);
  });

  it('F3.11a-V2 olmayan varyant ve pasif / olmayan depo 404; arşivli varyant ve ürün 409', async () => {
    const { seller, warehouseId, variantId, product } = await setup();
    expect(
      (await move(seller, { warehouseId, variantId: randomUUID(), type: 'receipt', qty: '1' }))
        .status,
    ).toBe(404);
    expect(
      (await move(seller, { warehouseId: randomUUID(), variantId, type: 'receipt', qty: '1' }))
        .status,
    ).toBe(404);
    const inactive = await newWarehouse(seller, 'Pasif anbar');
    await platformRows(`update warehouses set status = 'inactive' where id = $1`, [inactive]);
    expect(
      (await move(seller, { warehouseId: inactive, variantId, type: 'receipt', qty: '1' })).status,
    ).toBe(404);

    await platformRows(`update products set status = 'archived' where id = $1`, [product.id]);
    const archived = await move(seller, { warehouseId, variantId, type: 'receipt', qty: '1' });
    expect(archived.status).toBe(409);
    expect((archived.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');
    expect(await movements(seller, variantId)).toHaveLength(0);
  });

  it('F3.11a-V3 low=true satılabilir miktarı eşiğe eşit veya altındaki satırları döner; imleç sayfalar', async () => {
    const seller = await newSeller(region);
    const warehouseId = await newWarehouse(seller, 'Anbar');
    const variants: string[] = [];
    for (let i = 0; i < 3; i++) variants.push((await newProduct(seller)).variants[0]?.id ?? '');
    const qtys = ['3', '5', '12'];
    for (const [i, variantId] of variants.entries()) {
      await move(seller, { warehouseId, variantId, type: 'receipt', qty: qtys[i] });
    }
    const low = await (await admin(seller)).get('/api/v1/stock?low=true');
    expect(
      (low.body as { items: StockRowJson[] }).items.map((i) => num(i.onHand)).sort((a, b) => a - b),
    ).toEqual([3, 5]);

    const page1 = await (await admin(seller)).get('/api/v1/stock?limit=2');
    const body1 = page1.body as { items: StockRowJson[]; nextCursor: string | null };
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).not.toBeNull();
    const page2 = await (
      await admin(seller)
    ).get(`/api/v1/stock?limit=2&cursor=${body1.nextCursor ?? ''}`);
    const body2 = page2.body as { items: StockRowJson[]; nextCursor: string | null };
    expect(body2.items).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();
    expect(new Set([...body1.items, ...body2.items].map((i) => i.variantId))).toEqual(
      new Set(variants),
    );
  });

  it('F3.11a-MODE iki adımlı geçiş (S5 = B, S2 = A): stok her modda girilir; sayılmamış varyantla 409 + sayı, onayla açılır; audit; tekrar audit yazmaz', async () => {
    const { seller, warehouseId, variantId } = await setup();
    const other = await newProduct(seller);
    const archivedProduct = await newProduct(seller);
    await platformRows(`update products set status = 'archived' where id = $1`, [
      archivedProduct.id,
    ]);
    // Hazırlık: mod availability iken stok girilir.
    expect(
      (await move(seller, { warehouseId, variantId, type: 'receipt', qty: '10' })).status,
    ).toBe(201);
    const http = await admin(seller);
    expect(
      (await http.patch('/api/v1/business/seller-profile', { stockMode: 'quantity' })).status,
    ).toBe(422);

    const blocked = await http.post('/api/v1/stock-mode/quantity', {});
    expect(blocked.status).toBe(409);
    expect(blocked.body as ErrorJson).toMatchObject({
      code: 'STOCK_UNCOUNTED_VARIANTS',
      details: { uncountedCount: 1 },
    });
    expect((await http.get('/api/v1/stock-mode')).body).toEqual({ stockMode: 'availability' });

    const activated = await http.post('/api/v1/stock-mode/quantity', { confirmUncounted: true });
    expect(activated.status).toBe(200);
    expect(activated.body).toEqual({ stockMode: 'quantity', uncountedCount: 1 });
    expect((await http.get('/api/v1/stock-mode')).body).toEqual({ stockMode: 'quantity' });
    const again = await http.post('/api/v1/stock-mode/quantity', {});
    expect(again.status).toBe(200);
    const audits = await platformRows<{ before: unknown; after: unknown }>(
      `select before, after from audit_logs
        where business_id = $1 and action = 'seller_profile.updated' order by occurred_at`,
      [seller.businessId],
    );
    expect(audits).toEqual([
      {
        before: { stockMode: 'availability' },
        after: { stockMode: 'quantity', uncountedCount: 1 },
      },
    ]);

    // Sayılan (0 dahil) varyant sayılmamış sayılmaz; pasif depodaki satır sayılmaz.
    await move(seller, {
      warehouseId,
      variantId: other.variants[0]?.id ?? '',
      type: 'adjustment',
      qty: '0',
    });
    expect((await http.post('/api/v1/stock-mode/quantity', {})).body).toEqual({
      stockMode: 'quantity',
      uncountedCount: 0,
    });
    await platformRows(`update warehouses set status = 'inactive' where id = $1`, [warehouseId]);
    expect((await http.post('/api/v1/stock-mode/quantity', {})).body).toMatchObject({
      uncountedCount: 2,
    });

    // Çıkış satıcı profilinden; stok satırları saklanır (K3).
    expect(
      (await http.patch('/api/v1/business/seller-profile', { stockMode: 'availability' })).status,
    ).toBe(200);
    expect(num((await onHand(seller, warehouseId, variantId))?.on_hand)).toBe(10);
  });

  it('F3.11a-MODE izin ve gövde: business.manage olmayan 403; bilinmeyen alan 422; eşzamanlı iki geçiş tek audit', async () => {
    const seller = await newSeller(region);
    const keeper = await addMember(seller.businessId, 'seller_warehouse');
    expect(
      (await (await as(seller.businessId, keeper.userId)).post('/api/v1/stock-mode/quantity', {}))
        .status,
    ).toBe(403);
    const http = await admin(seller);
    expect((await http.post('/api/v1/stock-mode/quantity', { confirm: true })).status).toBe(422);
    const both = await Promise.all([
      http.post('/api/v1/stock-mode/quantity', {}),
      http.post('/api/v1/stock-mode/quantity', {}),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    const [audits] = await platformRows<{ n: number }>(
      `select count(*)::int as n from audit_logs
        where business_id = $1 and action = 'seller_profile.updated'`,
      [seller.businessId],
    );
    expect(audits?.n).toBe(1);
  });
});
