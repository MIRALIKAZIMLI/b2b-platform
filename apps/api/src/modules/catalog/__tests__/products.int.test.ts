// F3.3a entegrasyon (US-030 AC1, AC2, AC5, AC6; kart K1–K10, V5): toptancının ürün uçları HTTP
// üzerinden, app_user ile (RLS'e tabi). İzolasyon ayrı dosyada (products.isolation.test.ts).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  activeConnection,
  businessRows,
  newActiveBrand,
  newBuyer,
  newCategory,
  newRegion,
  newRequestedBrand,
  newSeller,
  platformUser,
  TestHttp,
  platformRows,
  productBody,
  runSeeds,
  type SeedCategories,
  type Seller,
  seedCategories,
  sku,
} from './product-fixtures';

interface PackagingJson {
  id: string;
  level: string;
  unitCode: string;
  baseQty: string;
  isSalesUnit: boolean;
  minOrderQty: string;
  orderMultiple: string;
}

interface VariantJson {
  id: string;
  sku: string;
  status: string;
  attributes: Record<string, unknown>;
  packaging: PackagingJson[];
}

interface ProductJson {
  id: string;
  sku: string;
  status: string;
  brandId: string | null;
  categoryId: string;
  publishedAt: string | null;
  shelfLifeMonths: number | null;
  variants: VariantJson[];
  visibility: { regionIds: string[] };
}

interface ErrorJson {
  code: string;
  details?: Record<string, string[]>;
}

describe('F3.3a ürün uçları (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let regionId: string;
  let cats: SeedCategories;
  let seller: Seller;

  async function headers(userId: string, businessId: string) {
    return { ...(await h.bearer(userId)), 'X-Business-Id': businessId };
  }

  async function create(body: unknown, who: Seller = seller) {
    return await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who.admin.userId, who.businessId))
      .send(body as object);
  }

  async function patch(id: string, body: unknown, who: Seller = seller) {
    return await h
      .http()
      .patch(`/api/v1/products/${id}`)
      .set(await headers(who.admin.userId, who.businessId))
      .send(body as object);
  }

  async function createOk(overrides: Record<string, unknown> = {}): Promise<ProductJson> {
    const response = await create(productBody(cats.child, overrides));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as ProductJson;
  }

  function details(response: { body: unknown }): Record<string, string[]> {
    return (response.body as ErrorJson).details ?? {};
  }

  beforeAll(async () => {
    await runSeeds();
    regionId = await newRegion('F3.3a ürün');
    cats = await seedCategories();
    seller = await newSeller(regionId);
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

  it('F3.3a-AC1 en az bir dilde ad, kategori, birim ve varyantla ürün draft açılır', async () => {
    const product = await createOk();
    expect(product.status).toBe('draft');
    expect(product.publishedAt).toBeNull();
    expect(product.variants).toHaveLength(1);
    const packaging = product.variants[0]?.packaging ?? [];
    expect(packaging.map((item) => [item.level, item.baseQty])).toEqual([
      ['unit', '1'],
      ['case', '24'],
      ['pallet', '1440'],
    ]);
    expect(packaging[1]).toMatchObject({ isSalesUnit: true, minOrderQty: '2', orderMultiple: '1' });

    const read = await h
      .http()
      .get(`/api/v1/products/${product.id}`)
      .set(await headers(seller.admin.userId, seller.businessId));
    expect(read.status).toBe(200);
    expect((read.body as ProductJson).sku).toBe(product.sku);
  });

  it('F3.3a-AC1 eksik veya geçersiz alanlar 422 (ad, kategori, marka, birim, bölge)', async () => {
    const noName = await create(productBody(cats.child, { name: { az: '  ', ru: '' } }));
    expect(noName.status).toBe(422);
    expect(Object.keys(details(noName))).toContain('name');

    const inactive = await create(productBody(await newCategory(false)));
    expect(details(inactive).categoryId).toEqual(['inactive']);

    const inactiveParentChild = await newCategory(true, await newCategory(false));
    expect(details(await create(productBody(inactiveParentChild))).categoryId).toEqual([
      'inactive',
    ]);
    expect(details(await create(productBody(randomUUID()))).categoryId).toEqual(['not_found']);

    const other = await newSeller(regionId);
    const othersBrand = await newRequestedBrand(other.businessId, other.admin.userId);
    expect(
      details(await create(productBody(cats.child, { brandId: othersBrand }))).brandId,
    ).toEqual(['not_found']);

    expect(
      details(await create(productBody(cats.child, { baseUnitCode: 'ZZ9' }))).baseUnitCode,
    ).toEqual(['not_found']);
    expect(
      details(await create(productBody(cats.child, { visibility: { regionIds: [randomUUID()] } })))[
        'visibility.regionIds'
      ],
    ).toEqual(['not_found']);

    // Kendi bekleyen talebiyle taslak açılır (V5).
    const own = await newRequestedBrand(seller.businessId, seller.admin.userId);
    const draft = await createOk({ brandId: own, visibility: { regionIds: [regionId] } });
    expect(draft.brandId).toBe(own);
    expect(draft.visibility.regionIds).toEqual([regionId]);
  });

  it('F3.3a-AC2 ambalaj kuralları ihlali 422 (K4)', async () => {
    const withPackaging = (packaging: unknown[]) =>
      productBody(cats.child, { variants: [{ sku: sku('V'), packaging }] });
    const unitTwo = await create(
      withPackaging([{ level: 'unit', unitCode: 'H87', baseQty: '2', isSalesUnit: true }]),
    );
    expect(details(unitTwo)['variants.0.packaging.0.baseQty']).toEqual(['must_be_one']);

    const notIncreasing = await create(
      withPackaging([
        { level: 'unit', unitCode: 'H87', baseQty: '1' },
        { level: 'case', unitCode: 'XCT', baseQty: '24', isSalesUnit: true },
        { level: 'pallet', unitCode: 'XPX', baseQty: '24' },
      ]),
    );
    expect(details(notIncreasing)['variants.0.packaging.2.baseQty']).toEqual(['not_increasing']);

    const noSalesUnit = await create(
      withPackaging([{ level: 'unit', unitCode: 'H87', baseQty: '1' }]),
    );
    expect(details(noSalesUnit)['variants.0.packaging']).toEqual(['sales_unit_required']);

    const notMultiple = await create(
      withPackaging([
        {
          level: 'case',
          unitCode: 'XCT',
          baseQty: '24',
          isSalesUnit: true,
          minOrderQty: '3',
          orderMultiple: '2',
        },
      ]),
    );
    expect(details(notMultiple)['variants.0.packaging.0.minOrderQty']).toEqual([
      'not_multiple_of_order_multiple',
    ]);

    const decimalCount = await create(
      withPackaging([{ level: 'case', unitCode: 'XCT', baseQty: '24.5', isSalesUnit: true }]),
    );
    expect(details(decimalCount)['variants.0.packaging.0.baseQty']).toEqual(['integer_required']);

    const badGtin = await create(
      productBody(cats.child, {
        variants: [
          {
            sku: sku('V'),
            gtin: '4006381333932',
            packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
          },
        ],
      }),
    );
    expect(Object.keys(details(badGtin))).toContain('variants.0.gtin');

    // Ondalığa izin veren temel birim (kg): 0,5 kg'lık paket satış birimi olabilir.
    const kg = await create(
      productBody(cats.child, {
        baseUnitCode: 'KGM',
        variants: [
          {
            sku: sku('V'),
            packaging: [
              { level: 'inner', unitCode: 'XPK', baseQty: '0.5', isSalesUnit: true },
              { level: 'case', unitCode: 'XCT', baseQty: '10' },
            ],
          },
        ],
      }),
    );
    expect(kg.status, JSON.stringify(kg.body)).toBe(201);
  });

  it('F3.3a-AC5 son kullanma tarihli üründe raf ömrü zorunlu (API 422 + DB CHECK)', async () => {
    const missing = await create(productBody(cats.child, { hasExpiry: true }));
    expect(details(missing).shelfLifeMonths).toEqual(['required']);
    const extra = await create(productBody(cats.child, { shelfLifeMonths: 12 }));
    expect(details(extra).shelfLifeMonths).toEqual(['must_be_empty']);

    const product = await createOk({ hasExpiry: true, shelfLifeMonths: 24 });
    expect(product.shelfLifeMonths).toBe(24);
    const off = await patch(product.id, { hasExpiry: false });
    expect(off.status).toBe(200);
    expect((off.body as ProductJson).shelfLifeMonths).toBeNull();

    let code: string | undefined;
    try {
      await businessRows(
        seller.businessId,
        'update products set has_expiry = true, shelf_life_months = null where id = $1',
        [product.id],
      );
    } catch (error) {
      code = pgErrorCode(error);
    }
    expect(code).toBe('23514');
  });

  it('F3.3a-AC6 draft → active yayın; geçişler §14; audit yalnız durum değişikliğinde', async () => {
    const product = await createOk();
    const edited = await patch(product.id, { name: { az: 'Yeni ad' } });
    expect(edited.status).toBe(200);

    const published = await patch(product.id, { status: 'active' });
    expect(published.status).toBe(200);
    expect((published.body as ProductJson).status).toBe('active');
    expect((published.body as ProductJson).publishedAt).not.toBeNull();

    expect((await patch(product.id, { status: 'draft' })).status).toBe(409);
    expect((await patch(product.id, { status: 'archived' })).status).toBe(200);
    // Arşivdeki ürün düzenlenmez, yalnız geri alınır.
    expect((await patch(product.id, { name: { az: 'X' } })).status).toBe(409);
    expect((await patch(product.id, { status: 'active' })).status).toBe(409);
    const restored = await patch(product.id, { status: 'draft' });
    expect((restored.body as ProductJson).status).toBe('draft');

    const audits = await platformRows<{ action: string }>(
      `select action from audit_logs where target_type = 'product' and target_id = $1
        order by occurred_at, id`,
      [product.id],
    );
    expect(audits.map((row) => row.action)).toEqual([
      'product.published',
      'product.archived',
      'product.restored',
    ]);
  });

  it('F3.3a-AC6 onay bekleyen markalı ürün yayınlanamaz (422 brandId: not_approved, V5)', async () => {
    const own = await newRequestedBrand(seller.businessId, seller.admin.userId);
    const product = await createOk({ brandId: own });
    const blocked = await patch(product.id, { status: 'active' });
    expect(blocked.status).toBe(422);
    expect(details(blocked).brandId).toEqual(['not_approved']);

    // Yayındaki ürünün markası bekleyen markaya çevrilemez.
    const active = await createOk({ brandId: await newActiveBrand() });
    expect((await patch(active.id, { status: 'active' })).status).toBe(200);
    expect(details(await patch(active.id, { brandId: own })).brandId).toEqual(['not_approved']);

    await platformRows(`update brands set status = 'active', decided_at = now() where id = $1`, [
      own,
    ]);
    expect((await patch(product.id, { status: 'active' })).status).toBe(200);
  });

  it('F3.3a-V5 marka reddedilince ürünün markası boşalır (tetikleyici)', async () => {
    const own = await newRequestedBrand(seller.businessId, seller.admin.userId);
    const product = await createOk({ brandId: own });
    const content = await h.bearer(await platformUser('content'));
    const rejected = await h
      .http()
      .patch(`/api/v1/admin/catalog/brands/${own}`)
      .set(content)
      .send({ status: 'rejected' });
    expect(rejected.status).toBe(200);
    const read = await h
      .http()
      .get(`/api/v1/products/${product.id}`)
      .set(await headers(seller.admin.userId, seller.businessId));
    expect((read.body as ProductJson).brandId).toBeNull();
  });

  it('F3.3a-SKU ürün ve varyant SKU satıcı içinde tek; başka satıcıda serbest; yarışta 500 yok', async () => {
    const product = await createOk();
    const dupProduct = await create(productBody(cats.child, { sku: product.sku }));
    expect(dupProduct.status).toBe(422);
    expect(details(dupProduct).sku).toEqual(['taken']);

    const variantSku = product.variants[0]?.sku ?? '';
    const dupVariant = await create(
      productBody(cats.child, {
        variants: [
          {
            sku: variantSku,
            packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
          },
        ],
      }),
    );
    // F3.5a (#78): çakışma ilgili varyantın alanına iner.
    expect(details(dupVariant)['variants.0.sku']).toEqual(['taken']);

    const other = await newSeller(regionId);
    const elsewhere = await create(productBody(cats.child, { sku: product.sku }), other);
    expect(elsewhere.status).toBe(201);

    const body = productBody(cats.child);
    const race = await Promise.all([
      create(body),
      create({ ...body, variants: productBody(cats.child).variants }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 422]);
  });

  it('F3.3a-K3 kaldırılan varyant arşivlenir, geri eklenir; ambalaj seviyesi kimliğini korur', async () => {
    const product = await createOk();
    const first = product.variants[0];
    if (first === undefined) throw new Error('varyant yok');
    const caseId = first.packaging.find((item) => item.level === 'case')?.id;
    const second = {
      sku: sku('V2'),
      packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
    };
    const firstInput = {
      id: first.id,
      sku: first.sku,
      packaging: [
        { level: 'unit', unitCode: 'H87', baseQty: '1' },
        { level: 'case', unitCode: 'XCT', baseQty: '12', isSalesUnit: true },
      ],
    };
    const added = await patch(product.id, { variants: [firstInput, second] });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const after = added.body as ProductJson;
    const updatedFirst = after.variants.find((v) => v.id === first.id);
    expect(updatedFirst?.packaging.map((p) => p.level)).toEqual(['unit', 'case']);
    expect(updatedFirst?.packaging.find((p) => p.level === 'case')).toMatchObject({
      id: caseId,
      baseQty: '12',
    });
    const secondId = after.variants.find((v) => v.sku === second.sku)?.id ?? '';

    const removed = await patch(product.id, { variants: [firstInput] });
    const variants = (removed.body as ProductJson).variants;
    expect(variants.find((v) => v.id === secondId)?.status).toBe('archived');
    // Arşivli SKU yeniden kullanılamaz.
    expect(
      details(await patch(product.id, { variants: [firstInput, { ...second, sku: second.sku }] }))[
        'variants.1.sku'
      ],
    ).toEqual(['taken']);
    const back = await patch(product.id, { variants: [firstInput, { ...second, id: secondId }] });
    expect((back.body as ProductJson).variants.find((v) => v.id === secondId)?.status).toBe(
      'active',
    );

    expect(
      details(await patch(product.id, { variants: [{ ...firstInput, id: randomUUID() }] }))[
        'variants.0.id'
      ],
    ).toEqual(['not_found']);
  });

  it('F3.3a-R38 pasifleşen kategori üründe kalır; yeni seçilen pasif kategori 422', async () => {
    const category = await newCategory(true);
    const product = await createOk({ categoryId: category });
    await platformRows('update categories set is_active = false where id = $1', [category]);
    expect((await patch(product.id, { name: { az: 'Kalır' } })).status).toBe(200);
    expect((await patch(product.id, { status: 'active' })).status).toBe(200);
    const other = await createOk();
    expect(details(await patch(other.id, { categoryId: category })).categoryId).toEqual([
      'inactive',
    ]);
  });

  it('F3.3a liste: durum süzgeci, arama ve imleç', async () => {
    const tag = randomUUID().slice(0, 8);
    const own = await newSeller(regionId);
    for (let i = 0; i < 3; i++) {
      const response = await create(
        productBody(cats.child, { name: { az: `Liste ${tag} ${String(i)}` } }),
        own,
      );
      expect(response.status).toBe(201);
    }
    const list = async (query: Record<string, string | number>) =>
      await h
        .http()
        .get('/api/v1/products')
        .query(query)
        .set(await headers(own.admin.userId, own.businessId));
    const page1 = await list({ q: tag, limit: 2 });
    expect(page1.status).toBe(200);
    const body1 = page1.body as { items: { id: string; status: string }[]; nextCursor: string };
    expect(body1.items).toHaveLength(2);
    const page2 = await list({ q: tag, limit: 2, cursor: body1.nextCursor });
    const body2 = page2.body as { items: { id: string }[]; nextCursor: string | null };
    expect(body2.items).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();
    expect((await list({ status: 'active' })).body).toMatchObject({ items: [] });
    expect((await list({ cursor: 'bozuk' })).status).toBe(422);
  });

  it('F3.3a-ISO perakendeci uçlara erişemez (403); yazma izni olmayan rol yazamaz', async () => {
    const product = await createOk();
    const buyerRegion = await newRegion('F3.3a alıcı');
    const buyer = await newBuyer(buyerRegion);
    await activeConnection(seller, buyer, new Date());
    const asBuyer = await headers(buyer.admin.userId, buyer.businessId);
    expect((await h.http().get('/api/v1/products').set(asBuyer)).status).toBe(403);
    expect((await h.http().get(`/api/v1/products/${product.id}`).set(asBuyer)).status).toBe(403);
    expect(
      (await h.http().post('/api/v1/products').set(asBuyer).send(productBody(cats.child))).status,
    ).toBe(403);
  });
});
