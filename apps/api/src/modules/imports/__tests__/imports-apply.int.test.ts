// F3.5c entegrasyon (US-031 AC3–AC5; SF-08; kart K1–K16, S1 = A, S2 = A): onay ucu HTTP üzerinden
// (app_user, RLS); doğrulama, uygulama ve süpürücü worker sınıflarıyla doğrudan çalıştırılır.
import { Global, Module } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { AuditService } from '../../../core/audit';
import { SystemClock } from '../../../core/clock';
import { withTenantTx } from '../../../core/db';
import { IdGenerator, UuidV7IdGenerator } from '../../../core/id-generator';
import { FileStorage } from '../../../core/ports/file-storage';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  CatalogImportWriterModule,
  type ImportProductWrite,
  isImportSkuTaken,
  ProductImportLookup,
  ProductImportWriter,
} from '../../catalog';
import { FilesService } from '../../files';
import { I18nService } from '../../i18n';
import { DefaultPriceListLookup, ImportPriceWriter, PricingImportModule } from '../../pricing';
import { SettingsService } from '../../settings';
import { ImportsRepository } from '../imports.repository';
import { ApplyImportJob } from '../jobs/apply-import.job';
import { ExpireImportsJob } from '../jobs/expire-imports.job';
import { ValidateImportJob } from '../jobs/validate-import.job';
import {
  addMember,
  arrayBufferOf,
  businessRows,
  newRegion,
  newSeller,
  platformRows,
  productBody,
  readyImportFile,
  runSeeds,
  type SeedCategories,
  type Seller,
  seedCategories,
  sku,
  TestHttp,
  xlsx,
} from './imports-fixtures';

interface JobJson {
  id: string;
  status: string;
  stats: { insert: number; update: number; error: number; warning: number };
  problems: { row: number; sku: string | null; issues: { column: string; code: string }[] }[];
  failureCode: string | null;
  appliedUntilRow: number | null;
  resultReportUrl: string | null;
}

const HEADER = [
  'sku',
  'barcode',
  'name_az',
  'name_ru',
  'name_tr',
  'category',
  'brand',
  'unit',
  'case_qty',
  'price',
  'stock',
];
const silentLog = { warn: () => undefined };
const directRunner = {
  run: async (_name: string, _lock: number, fn: () => Promise<number>) => ({
    status: 'done' as const,
    processed: await fn(),
  }),
};

const clock = new SystemClock();

/** Testte worker'ın global IdGenerator'ı. */
@Global()
@Module({
  providers: [{ provide: IdGenerator, useValue: new UuidV7IdGenerator(clock) }],
  exports: [IdGenerator],
})
class TestIdModule {}

describe('F3.5c Excel içe aktarmayı uygulama (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let categoryName: string;
  let seller: Seller;
  let storage: FileStorage;
  let validate: ValidateImportJob;
  let expire: ExpireImportsJob;
  let writer: ProductImportWriter;
  let priceWriter: ImportPriceWriter;
  let deps: {
    files: FilesService;
    lookup: ProductImportLookup;
    prices: DefaultPriceListLookup;
    i18n: I18nService;
    settings: SettingsService;
  };

  function applyJob(
    overrides: {
      writer?: Pick<ProductImportWriter, 'writeTx'>;
      priceWriter?: Pick<ImportPriceWriter, 'setUnitPriceTx'>;
    } = {},
  ): ApplyImportJob {
    return new ApplyImportJob(
      new ImportsRepository(),
      deps.files,
      deps.lookup,
      overrides.writer ?? writer,
      deps.prices,
      overrides.priceWriter ?? priceWriter,
      deps.i18n,
      deps.settings,
      new AuditService(clock),
      clock,
    );
  }

  async function headers(who: { businessId: string; admin: { userId: string } } = seller) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function preview(rows: unknown[][], who: Seller = seller): Promise<JobJson> {
    const fileId = await readyImportFile(storage, who, await xlsx(HEADER, rows));
    const created = await h
      .http()
      .post('/api/v1/imports')
      .set(await headers(who))
      .set('Accept-Language', 'tr')
      .send({ type: 'products', fileId });
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    const id = (created.body as JobJson).id;
    await validate.run({ businessId: who.businessId, jobId: id });
    return await getJob(id, who);
  }

  async function getJob(id: string, who: Seller = seller): Promise<JobJson> {
    const response = await h
      .http()
      .get(`/api/v1/imports/${id}`)
      .set(await headers(who));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body as JobJson;
  }

  async function approve(
    id: string,
    who: { businessId: string; admin: { userId: string } } = seller,
  ) {
    return await h
      .http()
      .post(`/api/v1/imports/${id}/apply`)
      .set(await headers(who));
  }

  /** Önizleme → onay → worker uygulaması; son iş görünümü. */
  async function run(rows: unknown[][], job = applyJob()): Promise<JobJson> {
    const ready = await preview(rows);
    expect(ready.status, JSON.stringify(ready)).toBe('preview_ready');
    expect((await approve(ready.id)).status).toBe(202);
    await job.run({ businessId: seller.businessId, jobId: ready.id }, silentLog);
    return await getJob(ready.id);
  }

  async function download(url: string): Promise<Buffer> {
    const parsed = new URL(url);
    const response = await h
      .http()
      .get(`${parsed.pathname}${parsed.search}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      });
    expect(response.status).toBe(200);
    return response.body as Buffer;
  }

  async function createProduct(body: Record<string, unknown>) {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers())
      .send(body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string; sku: string; variants: { id: string; sku: string }[] };
  }

  /** Varyantın ambalajları (seviye → baseQty, satış birimi, en az sipariş). */
  async function packagingOf(variantSku: string) {
    return await businessRows<{
      id: string;
      level: string;
      base_qty: string;
      is_sales_unit: boolean;
      min_order_qty: string;
    }>(
      seller.businessId,
      `select k.id, k.level, k.base_qty, k.is_sales_unit, k.min_order_qty
         from product_packaging k join product_variants v on v.id = k.variant_id
        where lower(v.sku) = lower($1) order by k.base_qty`,
      [variantSku],
    );
  }

  /** Varsayılan listedeki `unit` fiyat satırları (eski → yeni). */
  async function unitPrices(variantSku: string): Promise<string[]> {
    const rows = await businessRows<{ unit_price: string }>(
      seller.businessId,
      `select i.unit_price from price_list_items i
         join price_lists l on l.id = i.price_list_id and l.is_default
         join product_packaging k on k.id = i.packaging_id and k.level = 'unit'
         join product_variants v on v.id = k.variant_id
        where lower(v.sku) = lower($1) order by i.valid_from, i.created_at`,
      [variantSku],
    );
    return rows.map((row) => row.unit_price);
  }

  beforeAll(async () => {
    await runSeeds();
    const regionId = await newRegion('F3.5c uygulama');
    cats = await seedCategories();
    const [category] = await platformRows<{ name: string }>(
      `select name->>'az' as name from categories where id = $1`,
      [cats.child],
    );
    categoryName = category?.name ?? '';
    seller = await newSeller(regionId);
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    storage = app.get(FileStorage);
    const ports = await Test.createTestingModule({
      imports: [TestIdModule, CatalogImportWriterModule, PricingImportModule],
    }).compile();
    writer = ports.get(ProductImportWriter);
    priceWriter = ports.get(ImportPriceWriter);
    deps = {
      files: app.get(FilesService),
      lookup: app.get(ProductImportLookup),
      prices: ports.get(DefaultPriceListLookup),
      i18n: app.get(I18nService),
      settings: app.get(SettingsService),
    };
    validate = new ValidateImportJob(
      new ImportsRepository(),
      deps.files,
      deps.lookup,
      deps.prices,
      deps.i18n,
      deps.settings,
      clock,
    );
    expire = new ExpireImportsJob(
      new ImportsRepository(),
      storage,
      deps.settings,
      clock,
      directRunner,
    );
    const list = await h
      .http()
      .post('/api/v1/price-lists')
      .set(await headers())
      .send({ name: 'Əsas', currency: 'AZN', vatIncluded: true, vatRate: '18' });
    expect(list.status, JSON.stringify(list.body)).toBe(201);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F3.5c-AC3 onay yalnız hatasız satırları uygular; sonuç raporu indirilir; audit iş başına tek kayıt', async () => {
    const existing = await createProduct(productBody(cats.child));
    const variantSku = existing.variants[0]?.sku ?? '';
    const newSku = sku('N');
    const done = await run([
      [newSku, '4006381333931', 'Yeni', '', '', categoryName, '', 'H87', 12, '2,50', ''],
      // AC4: harf farkı güncellemedir; ad dil bazında birleşir.
      [variantSku.toLowerCase(), '', '', 'Новое', '', '', '', '', '', '3', ''],
      [sku('E'), '', 'Hatalı', '', '', categoryName, '', 'YOK', '', '', ''],
    ]);
    expect(done).toMatchObject({
      status: 'done',
      stats: { insert: 1, update: 1, error: 1, warning: 0 },
      failureCode: null,
    });
    expect(done.problems.map((p) => [p.row, p.issues])).toEqual([
      [4, [{ column: 'unit', code: 'not_found' }]],
    ]);

    const [created] = await businessRows<{ status: string; name: Record<string, string> }>(
      seller.businessId,
      'select status, name from products where lower(sku) = lower($1)',
      [newSku],
    );
    expect(created).toEqual({ status: 'draft', name: { az: 'Yeni' } });
    expect((await packagingOf(newSku)).map((k) => [k.level, k.base_qty, k.is_sales_unit])).toEqual([
      ['unit', '1.000', true],
      ['case', '12.000', false],
    ]);
    expect(await unitPrices(newSku)).toEqual(['2.5000']);

    const [updated] = await businessRows<{ n: number; name: Record<string, string> }>(
      seller.businessId,
      `select (select count(*)::int from products where id = $1) as n, name from products where id = $1`,
      [existing.id],
    );
    expect(updated?.name).toEqual({ az: 'Şampun 400 ml', ru: 'Новое' });
    expect(await unitPrices(variantSku)).toEqual(['3.0000']);

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(arrayBufferOf(await download(done.resultReportUrl ?? '')));
    const rows = book.worksheets[0]
      ?.getSheetValues()
      .slice(2)
      .map((row) => (row as unknown[]).slice(1, 4));
    expect(rows).toEqual([
      [2, newSku, 'Eklendi'],
      [3, variantSku.toLowerCase(), 'Güncellendi'],
      [4, expect.any(String), 'Uygulanmadı'],
    ]);

    const audit = await platformRows<{ action: string; after: unknown; actor_user_id: string }>(
      `select action, after, actor_user_id from audit_logs where target_type = 'import_job' and target_id = $1`,
      [done.id],
    );
    expect(audit).toEqual([
      {
        action: 'import.applied',
        after: { insert: 1, update: 1, error: 1 },
        actor_user_id: seller.admin.userId,
      },
    ]);
  });

  it('F3.5c-STATE yalnız işi açan onaylar (S1 = A); ikinci onay 409; süresi dolan önizleme 404', async () => {
    const ready = await preview([
      [sku('S'), '', 'Ad', '', '', categoryName, '', 'H87', '', '', ''],
    ]);
    const colleague = await addMember(seller.businessId, 'seller_business_admin');
    const forbidden = await approve(ready.id, { businessId: seller.businessId, admin: colleague });
    expect(forbidden.status).toBe(403);
    const accepted = await approve(ready.id);
    expect(accepted.status).toBe(202);
    expect((accepted.body as JobJson).status).toBe('applying');
    expect((await approve(ready.id)).status).toBe(409);
    // Yinelenen teslim: ikinci çalışma işi almaz.
    const job = applyJob();
    const [first, second] = await Promise.all([
      job.run({ businessId: seller.businessId, jobId: ready.id }, silentLog),
      job.run({ businessId: seller.businessId, jobId: ready.id }, silentLog),
    ]);
    expect([first, second].sort()).toEqual(['done', 'skipped']);
    expect((await approve(ready.id)).status).toBe(409);

    const stale = await preview([
      [sku('S'), '', 'Ad', '', '', categoryName, '', 'H87', '', '', ''],
    ]);
    await businessRows(
      seller.businessId,
      `update import_jobs set updated_at = now() - interval '25 hours' where id = $1`,
      [stale.id],
    );
    expect((await approve(stale.id)).status).toBe(404);
  });

  it('F3.5c-STATE fiyat izni onay anında da aranır: izin kalkınca onay 403, iş preview_ready kalır (Müfettiş 29 D1)', async () => {
    const member = await addMember(seller.businessId, 'seller_sales_manager');
    await platformRows(
      `insert into role_permissions (role_id, permission_code, scope)
       select role_id, code, 'all' from memberships, unnest(array['imports.run', 'pricing.manage']) code
        where id = $1
       on conflict do nothing`,
      [member.membershipId],
    );
    const who = { businessId: seller.businessId, admin: member };
    const ready = await preview(
      [[sku('M'), '', 'Ad', '', '', categoryName, '', 'H87', '', '3', '']],
      who,
    );
    expect(ready.stats).toMatchObject({ insert: 1, warning: 0 });
    await platformRows(
      `with r as (select role_id from memberships where id = $1),
            d as (delete from role_permissions where role_id = (select role_id from r)
                   and permission_code = 'pricing.manage')
       update roles set permissions_version = permissions_version + 1
        where id = (select role_id from r)`,
      [member.membershipId],
    );
    expect((await approve(ready.id, who)).status).toBe(403);
    expect((await getJob(ready.id, who)).status).toBe('preview_ready');
  });

  it('F3.5c-REVAL önizlemeden sonra arşivlenen ürün uygulamada hata; yeni eklenen SKU güncelleme olur', async () => {
    const existing = await createProduct(productBody(cats.child));
    const lateSku = sku('L');
    const ready = await preview([
      [existing.sku, '', 'Ad', '', '', '', '', '', '', '', ''],
      [lateSku, '', 'Geç', '', '', categoryName, '', 'H87', '', '', ''],
    ]);
    expect(ready.stats).toMatchObject({ insert: 1, update: 1, error: 0 });
    await businessRows(seller.businessId, `update products set status = 'archived' where id = $1`, [
      existing.id,
    ]);
    await createProduct(
      productBody(cats.child, {
        sku: lateSku,
        variants: [
          {
            sku: lateSku,
            packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
          },
        ],
      }),
    );
    expect((await approve(ready.id)).status).toBe(202);
    await applyJob().run({ businessId: seller.businessId, jobId: ready.id }, silentLog);
    const done = await getJob(ready.id);
    expect(done.stats).toMatchObject({ insert: 0, update: 1, error: 1 });
    expect(done.problems[0]?.issues).toEqual([{ column: 'sku', code: 'archived' }]);
  });

  it('F3.5c-PRICE aynı fiyat yazılmaz; izinsiz işte fiyat yazılmaz; unit ambalajı yoksa hata; geçerli olmuş satır değişmez (>)', async () => {
    const product = await createProduct(productBody(cats.child));
    const variantSku = product.variants[0]?.sku ?? '';
    await run([[variantSku, '', '', '', '', '', '', '', '', '4.5', '']]);
    await run([[variantSku, '', '', '', '', '', '', '', '', '4,5000', '']]);
    expect(await unitPrices(variantSku)).toEqual(['4.5000']);

    // İşi açanın fiyat izni yok (iş açılırken yazılan bayrak, Mimar S2).
    const ready = await preview([[variantSku, '', '', '', '', '', '', '', '', '9', '']]);
    await businessRows(
      seller.businessId,
      'update import_jobs set can_write_prices = false where id = $1',
      [ready.id],
    );
    expect((await approve(ready.id)).status).toBe(202);
    await applyJob().run({ businessId: seller.businessId, jobId: ready.id }, silentLog);
    expect((await getJob(ready.id)).stats).toMatchObject({ update: 1, warning: 1 });
    expect(await unitPrices(variantSku)).toEqual(['4.5000']);

    // `unit` ambalajı olmayan varyant: önizlemede hata.
    const caseOnly = await createProduct(
      productBody(cats.child, {
        variants: [
          {
            sku: sku('C'),
            packaging: [
              { level: 'unit', unitCode: 'H87', baseQty: '1' },
              { level: 'case', unitCode: 'XCT', baseQty: '6', isSalesUnit: true },
            ],
          },
        ],
      }),
    );
    const caseSku = caseOnly.variants[0]?.sku ?? '';
    await businessRows(
      seller.businessId,
      `delete from product_packaging where level = 'unit'
          and variant_id = (select id from product_variants where sku = $1)`,
      [caseSku],
    );
    const noUnit = await preview([[caseSku, '', '', '', '', '', '', '', '', '1', '']]);
    expect(noUnit.problems[0]?.issues).toEqual([{ column: 'price', code: 'no_unit_packaging' }]);

    // Müfettiş 28 not 1: aynı anda (valid_from = now) yazılmış satır sonradan değişmez.
    const [ids] = await businessRows<{ list_id: string; packaging_id: string }>(
      seller.businessId,
      `select l.id as list_id, k.id as packaging_id from price_lists l, product_packaging k
         join product_variants v on v.id = k.variant_id
        where l.seller_id = $1 and l.is_default and k.level = 'unit' and v.sku = $2`,
      [seller.businessId, variantSku],
    );
    const at = new Date(Date.now() + 60_000);
    const sameInstant: string[] = [];
    for (const price of ['7', '8']) {
      sameInstant.push(
        await withTenantTx({ businessId: seller.businessId, userId: seller.admin.userId }, (tx) =>
          priceWriter.setUnitPriceTx(tx, {
            sellerId: seller.businessId,
            listId: ids?.list_id ?? '',
            packagingId: ids?.packaging_id ?? '',
            unitPrice: price,
            userId: seller.admin.userId,
            now: at,
          }),
        ),
      );
    }
    // Müfettiş 29 D2: ikinci yazım 0 satır; "yazıldı" denmez.
    expect(sameInstant).toEqual(['written', 'conflict']);
    expect((await unitPrices(variantSku)).at(-1)).toBe('7.0000');

    // Uygulamada `conflict` satırı hatalı sayar; savepoint satırın yazdıklarını geri alır.
    const conflicting: Pick<ImportPriceWriter, 'setUnitPriceTx'> = {
      setUnitPriceTx: () => Promise.resolve('conflict' as const),
    };
    const fresh = sku('Q');
    const rejected = await run(
      [[fresh, '', 'Ad', '', '', categoryName, '', 'H87', '', '2', '']],
      applyJob({ priceWriter: conflicting }),
    );
    expect(rejected.stats).toMatchObject({ insert: 0, error: 1 });
    expect(rejected.problems[0]?.issues).toEqual([{ column: 'price', code: 'duplicate_in_file' }]);
    expect(await packagingOf(fresh)).toEqual([]);
  });

  it('F3.5c-PACK koli eklenir/güncellenir, satış birimi ve en az sipariş korunur; palet aşılırsa packaging_conflict', async () => {
    const product = await createProduct(productBody(cats.child));
    const variantSku = product.variants[0]?.sku ?? '';
    // Müfettiş 29 D2: farklı SKU metniyle aynı varyant iki kez → ikisi de duplicate_in_file.
    const twice = await run([
      [variantSku, '', '', '', '', '', '', '', 30, '5', ''],
      [product.sku, '', '', '', '', '', '', '', '', '6', ''],
    ]);
    expect(twice.stats).toMatchObject({ update: 0, error: 2 });
    expect(twice.problems.map((p) => p.issues)).toEqual([
      [{ column: 'sku', code: 'duplicate_in_file' }],
      [{ column: 'sku', code: 'duplicate_in_file' }],
    ]);
    const done = await run([[variantSku, '', '', '', '', '', '', '', 30, '', '']]);
    expect(done.stats).toMatchObject({ update: 1, error: 0 });
    expect(
      (await packagingOf(variantSku)).map((k) => [
        k.level,
        k.base_qty,
        k.is_sales_unit,
        k.min_order_qty,
      ]),
    ).toEqual([
      ['unit', '1.000', false, '1.000'],
      ['case', '30.000', true, '2.000'],
      ['pallet', '1440.000', false, '1.000'],
    ]);
    const conflict = await run([[variantSku, '', '', '', '', '', '', '', 2000, '', '']]);
    expect(conflict.problems[0]?.issues).toEqual([
      { column: 'case_qty', code: 'packaging_conflict' },
    ]);
    expect((await packagingOf(variantSku))[1]?.base_qty).toBe('30.000');
  });

  it('F3.5c-SKU yazımda 23505 yalnız o satırı düşürür; savepoint satırın yazdıklarını geri alır', async () => {
    const race = sku('R');
    const ok = sku('O');
    const racing: Pick<ProductImportWriter, 'writeTx'> = {
      writeTx: async (tx, sellerId, write: ImportProductWrite, now) => {
        const result = await writer.writeTx(tx, sellerId, write, now);
        if (write.sku === race) {
          throw Object.assign(new Error('duplicate'), {
            code: '23505',
            constraint: 'products_seller_sku_lower_uq',
          });
        }
        return result;
      },
    };
    expect(isImportSkuTaken({ code: '23505', constraint: 'products_seller_sku_lower_uq' })).toBe(
      true,
    );
    const done = await run(
      [
        [race, '', 'Yarış', '', '', categoryName, '', 'H87', '', '1', ''],
        [ok, '', 'Tamam', '', '', categoryName, '', 'H87', '', '', ''],
      ],
      applyJob({ writer: racing }),
    );
    expect(done.stats).toMatchObject({ insert: 1, error: 1 });
    expect(done.problems[0]?.issues).toEqual([{ column: 'sku', code: 'taken' }]);
    const products = await businessRows<{ sku: string }>(
      seller.businessId,
      'select sku from products where sku = any($1::text[]) order by sku',
      [[race, ok]],
    );
    expect(products.map((row) => row.sku)).toEqual([ok]);
  });

  it('F3.5c-RESUME parti hatası: önceki partiler kalır, iş failed + APPLY_FAILED + appliedUntilRow', async () => {
    const prefix = sku('B');
    const rows = Array.from({ length: 501 }, (_, index) => [
      `${prefix}-${String(index)}`,
      '',
      'Toplu',
      '',
      '',
      categoryName,
      '',
      'H87',
      '',
      index === 500 ? '1' : '',
      '',
    ]);
    const failing: Pick<ImportPriceWriter, 'setUnitPriceTx'> = {
      setUnitPriceTx: () => Promise.reject(new Error('bağlantı koptu')),
    };
    const failed = await run(rows, applyJob({ priceWriter: failing }));
    expect(failed).toMatchObject({
      status: 'failed',
      failureCode: 'APPLY_FAILED',
      appliedUntilRow: 501,
    });
    const [count] = await businessRows<{ n: number }>(
      seller.businessId,
      `select count(*)::int as n from products where sku like $1`,
      [`${prefix}-%`],
    );
    expect(count?.n).toBe(500);
  });

  it('F3.5c-SWEEP takılı iş TIMED_OUT; saklama süresi geçen biten iş dosyalarıyla silinir (S2 = A)', async () => {
    const stuck = await preview([
      [sku('T'), '', 'Ad', '', '', categoryName, '', 'H87', '', '', ''],
    ]);
    expect((await approve(stuck.id)).status).toBe(202);
    await businessRows(
      seller.businessId,
      `update import_jobs set updated_at = now() - interval '2 hours' where id = $1`,
      [stuck.id],
    );
    const old = await run([[sku('D'), '', 'Ad', '', '', categoryName, '', 'H87', '', '', '']]);
    expect(old.status).toBe('done');
    const [files] = await businessRows<{ file_id: string; result_report_file_id: string }>(
      seller.businessId,
      'select file_id, result_report_file_id from import_jobs where id = $1',
      [old.id],
    );
    await businessRows(
      seller.businessId,
      `update import_jobs set updated_at = now() - interval '31 days' where id = $1`,
      [old.id],
    );
    await expire.run(silentLog);

    expect(await getJob(stuck.id)).toMatchObject({ status: 'failed', failureCode: 'TIMED_OUT' });
    const gone = await businessRows<{ n: number }>(
      seller.businessId,
      `select (select count(*)::int from import_jobs where id = $1)
            + (select count(*)::int from files where id = any($2::uuid[])) as n`,
      [old.id, [files?.file_id, files?.result_report_file_id]],
    );
    expect(gone[0]?.n).toBe(0);
  });

  it('F3.5c-AC5 5.000 satır: doğrulama + uygulama 120 sn içinde (süre ve bellek loglanır)', async () => {
    const prefix = sku('X');
    const rows = Array.from({ length: 5000 }, (_, index) => [
      `${prefix}-${String(index)}`,
      '',
      `Məhsul ${String(index)}`,
      '',
      '',
      categoryName,
      '',
      'H87',
      12,
      '1.25',
      '',
    ]);
    const started = performance.now();
    const heapBefore = process.memoryUsage().heapUsed;
    const done = await run(rows);
    const seconds = (performance.now() - started) / 1000;
    const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
    process.stdout.write(
      `F3.5c-AC5: 5000 satır ${seconds.toFixed(1)} sn, heap farkı ${heapMb.toFixed(0)} MB\n`,
    );
    expect(done.stats).toMatchObject({ insert: 5000, error: 0 });
    expect(seconds).toBeLessThan(120);
  }, 180_000);
});
