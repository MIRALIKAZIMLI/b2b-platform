// F3.11c Excel stok sayımı türü (US-039 AC7; kart K1–K12; S1 = A sayılan toplam, S2 = B şablondan
// sonra değişen stok uygulanmaz, S3 = A bir dosya bir depo; R35, R36).
// Uçlar HTTP üzerinden (app_user, RLS); doğrulama ve uygulama worker sınıflarıyla doğrudan.
import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { AuditService } from '../../../core/audit';
import { SystemClock } from '../../../core/clock';
import { IdGenerator, UuidV7IdGenerator } from '../../../core/id-generator';
import { FileStorage } from '../../../core/ports/file-storage';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { CatalogImportWriterModule, ProductImportLookup, ProductImportWriter } from '../../catalog';
import { FilesService } from '../../files';
import { I18nService } from '../../i18n';
import { StockImport } from '../../inventory';
import {
  CustomerPriceImport,
  DefaultPriceListLookup,
  ImportPriceWriter,
  PricingImportModule,
} from '../../pricing';
import { SettingsService } from '../../settings';
import { ImportsRepository } from '../imports.repository';
import { ApplyImportJob } from '../jobs/apply-import.job';
import { ValidateImportJob } from '../jobs/validate-import.job';
import {
  addMember,
  arrayBufferOf,
  businessRows,
  type Member,
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
  type: string;
  warehouseId: string | null;
  status: string;
  stats: { insert: number; update: number; error: number; warning: number };
  problems: { row: number; sku: string | null; issues: { column: string; code: string }[] }[];
  failureCode: string | null;
  errorReportUrl: string | null;
  resultReportUrl: string | null;
  canApply: boolean;
}

interface Who {
  businessId: string;
  admin: { userId: string };
}

const HEADER = ['sku', 'name', 'base_unit', 'current_stock', 'stock'];
const PRODUCT_HEADER = [
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
const clock = new SystemClock();

@Global()
@Module({
  providers: [{ provide: IdGenerator, useValue: new UuidV7IdGenerator(clock) }],
  exports: [IdGenerator],
})
class TestIdModule {}

describe('F3.11c Excel stok sayımı içe aktarma (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let region: string;
  let seller: Seller;
  let warehouseId: string;
  let categoryName: string;
  let storage: FileStorage;
  let validate: ValidateImportJob;
  let applyJob: ApplyImportJob;

  async function headers(who: Who = seller) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function newWarehouse(who: Seller, name: string): Promise<string> {
    const response = await h
      .http()
      .post('/api/v1/warehouses')
      .set(await headers(who))
      .send({ name });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return (response.body as { id: string }).id;
  }

  /** Ürün açar; varyant SKU'su ve kimliği. */
  async function product(who: Seller = seller): Promise<{ sku: string; variantId: string }> {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who))
      .send(productBody(cats.child));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const variant = (response.body as { variants: { id: string; sku: string }[] }).variants[0];
    if (variant === undefined) throw new Error('varyant yok');
    return { sku: variant.sku, variantId: variant.id };
  }

  async function receipt(variantId: string, qty: string, warehouse = warehouseId) {
    const response = await h
      .http()
      .post('/api/v1/stock/movements')
      .set(await headers())
      .set('Idempotency-Key', randomUUID())
      .send({ warehouseId: warehouse, variantId, type: 'receipt', qty });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
  }

  async function stockOf(variantId: string, warehouse = warehouseId) {
    const [row] = await businessRows<{ on_hand: string; reserved: string }>(
      seller.businessId,
      `select on_hand::text, reserved::text from stock where warehouse_id = $1 and variant_id = $2`,
      [warehouse, variantId],
    );
    return row;
  }

  async function movements(variantId: string) {
    return await businessRows<{ type: string; on_hand_delta: string; created_by: string | null }>(
      seller.businessId,
      `select type, on_hand_delta::text, created_by from stock_movements
        where variant_id = $1 order by created_at, id`,
      [variantId],
    );
  }

  async function create(body: Record<string, unknown>, who: Who = seller) {
    return await h
      .http()
      .post('/api/v1/imports')
      .set(await headers(who))
      .set('Accept-Language', 'tr')
      .send(body);
  }

  async function template(warehouse: string, who: Who = seller) {
    return await h
      .http()
      .get(`/api/v1/imports/template?type=stock&warehouseId=${warehouse}`)
      .set(await headers(who))
      .set('Accept-Language', 'az');
  }

  async function getJob(id: string, who: Who = seller) {
    const response = await h
      .http()
      .get(`/api/v1/imports/${id}`)
      .set(await headers(who));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body as JobJson;
  }

  async function preview(rows: unknown[][], warehouse = warehouseId, who: Who = seller) {
    const fileId = await readyImportFile(storage, seller, await xlsx(HEADER, rows));
    const created = await create({ type: 'stock', fileId, warehouseId: warehouse }, who);
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    const id = (created.body as JobJson).id;
    await validate.run({ businessId: seller.businessId, jobId: id });
    return await getJob(id, who);
  }

  async function approve(id: string, who: Who = seller) {
    return await h
      .http()
      .post(`/api/v1/imports/${id}/apply`)
      .set(await headers(who));
  }

  async function download(url: string): Promise<unknown[][]> {
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
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(arrayBufferOf(response.body as Buffer));
    return (book.worksheets[0]?.getSheetValues() ?? [])
      .slice(1)
      .map((row) => (row as unknown[]).slice(1));
  }

  /** Özel rol: verilen izinlerle (kapsam) üye; isteğe bağlı depo ataması. */
  async function customMember(
    permissions: readonly [string, string][],
    warehouse?: string,
  ): Promise<Member> {
    const [role] = await businessRows<{ id: string }>(
      seller.businessId,
      `insert into roles (id, business_id, name, capability, is_custom)
       values (gen_random_uuid(), $1, '{"az":"Sayım"}'::jsonb, 'seller', true) returning id`,
      [seller.businessId],
    );
    for (const [code, scope] of permissions) {
      await businessRows(
        seller.businessId,
        `insert into role_permissions (role_id, permission_code, scope) values ($1, $2, $3)`,
        [role?.id, code, scope],
      );
    }
    const member = await addMember(seller.businessId, 'seller_business_admin');
    await businessRows(
      seller.businessId,
      `update memberships set role_id = $2, warehouse_id = $3 where id = $1`,
      [member.membershipId, role?.id, warehouse ?? null],
    );
    return member;
  }

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.11c stok içe aktarma');
    cats = await seedCategories();
    seller = await newSeller(region);
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
    const stock = app.get(StockImport);
    validate = new ValidateImportJob(
      new ImportsRepository(),
      app.get(FilesService),
      app.get(ProductImportLookup),
      ports.get(DefaultPriceListLookup),
      app.get(I18nService),
      app.get(SettingsService),
      clock,
      ports.get(CustomerPriceImport),
      stock,
    );
    applyJob = new ApplyImportJob(
      new ImportsRepository(),
      app.get(FilesService),
      app.get(ProductImportLookup),
      ports.get(ProductImportWriter),
      ports.get(DefaultPriceListLookup),
      ports.get(ImportPriceWriter),
      app.get(I18nService),
      app.get(SettingsService),
      new AuditService(clock),
      clock,
      ports.get(CustomerPriceImport),
      stock,
    );
    warehouseId = await newWarehouse(seller, 'Əsas anbar');
    const [category] = await platformRows<{ name: string }>(
      `select name->>'az' as name from categories where id = $1`,
      [cats.child],
    );
    categoryName = category?.name ?? '';
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F3.11c-SCOPE iş açma kuralları: warehouseId zorunlu; başka türde verilemez; başka satıcının / pasif depo 422; stok izni yoksa 403; kapsamlı üye yalnız kendi deposu (R36)', async () => {
    const body = await xlsx(HEADER, [[sku('X'), '', '', '', '1']]);
    const file = async () => await readyImportFile(storage, seller, body);
    const missing = await create({ type: 'stock', fileId: await file() });
    expect(missing.status).toBe(422);
    expect((missing.body as { details: unknown }).details).toEqual({ warehouseId: ['required'] });
    const products = await create({ type: 'products', fileId: await file(), warehouseId });
    expect(products.status).toBe(422);
    expect((products.body as { details: unknown }).details).toEqual({
      warehouseId: ['not_allowed'],
    });
    const foreignSeller = await newSeller(region);
    const foreignWarehouse = await newWarehouse(foreignSeller, 'Yad anbar');
    const foreign = await create({
      type: 'stock',
      fileId: await file(),
      warehouseId: foreignWarehouse,
    });
    expect(foreign.status).toBe(422);
    expect((foreign.body as { details: unknown }).details).toEqual({ warehouseId: ['not_found'] });
    expect((await template(foreignWarehouse)).status).toBe(422);
    const passive = await newWarehouse(seller, 'Pasif anbar');
    await platformRows(`update warehouses set status = 'inactive' where id = $1`, [passive]);
    expect(
      (await create({ type: 'stock', fileId: await file(), warehouseId: passive })).status,
    ).toBe(422);

    // Excel izni var, stok izni yok: 403 (şablon da).
    const importer = await customMember([
      ['imports.run', 'all'],
      ['catalog.manage', 'all'],
    ]);
    const importerWho = { businessId: seller.businessId, admin: importer };
    expect(
      (await create({ type: 'stock', fileId: await file(), warehouseId }, importerWho)).status,
    ).toBe(403);
    expect((await template(warehouseId, importerWho)).status).toBe(403);
    // S1 = A: Depo Sorumlusu şablonunda Excel izni yok.
    const keeper = await addMember(seller.businessId, 'seller_warehouse');
    await platformRows('update memberships set warehouse_id = $1 where id = $2', [
      warehouseId,
      keeper.membershipId,
    ]);
    expect(
      (await template(warehouseId, { businessId: seller.businessId, admin: keeper })).status,
    ).toBe(403);
    // Excel + depo kapsamlı stok izni: kendi deposu 202, başka depo 403.
    const second = await newWarehouse(seller, 'İkinci anbar');
    const scoped = await customMember(
      [
        ['imports.run', 'all'],
        ['inventory.manage', 'warehouse'],
      ],
      warehouseId,
    );
    const scopedWho = { businessId: seller.businessId, admin: scoped };
    expect((await template(warehouseId, scopedWho)).status).toBe(200);
    expect(
      (await create({ type: 'stock', fileId: await file(), warehouseId }, scopedWho)).status,
    ).toBe(202);
    expect((await template(second, scopedWho)).status).toBe(403);
    expect(
      (await create({ type: 'stock', fileId: await file(), warehouseId: second }, scopedWho))
        .status,
    ).toBe(403);
  });

  it('F3.11c-AC1 şablon seçilen depo için SKU, ad, temel birim ve bugünkü miktarla dolu iner; sayılan sütunu boş', async () => {
    const counted = await product();
    const uncounted = await product();
    await receipt(counted.variantId, '12.5');
    const other = await newWarehouse(seller, 'Başqa anbar');
    await receipt(uncounted.variantId, '99', other);

    const response = await template(warehouseId);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const rows = await download((response.body as { url: string }).url);
    expect(rows[0]).toEqual(HEADER);
    const bySku = new Map(rows.slice(1).map((row) => [row[0], row]));
    expect(bySku.get(counted.sku)).toEqual([counted.sku, 'Şampun 400 ml (400)', 'H87', '12.5', '']);
    // Ad = ürün adı + varyant özellikleri. Başka depodaki stok bu depoya karışmaz; sayılmamış 0.
    expect(bySku.get(uncounted.sku)).toEqual([
      uncounted.sku,
      'Şampun 400 ml (400)',
      'H87',
      '0',
      '',
    ]);
  });

  it('F3.11c-AC2 F3.11c-AC3 önizleme (ilk sayım / değişen / aynı / hatalı) ve onay: yalnız adjustment hareketi, fark sistemce; sonuç raporu; audit', async () => {
    const changed = await product();
    const fresh = await product();
    const same = await product();
    const zero = await product();
    const reserved = await product();
    await receipt(changed.variantId, '40');
    await receipt(same.variantId, '5');
    await receipt(reserved.variantId, '20');
    await businessRows(
      seller.businessId,
      `insert into stock_movements
         (id, seller_id, warehouse_id, variant_id, type, on_hand_delta, reserved_delta, created_at)
       values ($1, $2, $3, $4, 'reserve', 0, 8, now())`,
      [randomUUID(), seller.businessId, warehouseId, reserved.variantId],
    );

    const ready = await preview([
      [changed.sku.toLowerCase(), '', '', '40', '37'],
      [fresh.sku, '', '', '', '3,5'],
      [same.sku, '', '', '5', '5.000'],
      [zero.sku, '', '', '0', '0'],
      [sku('Z'), '', '', '', '1'],
      [reserved.sku, '', '', '20', '7'],
      [sku('Q'), '', '', '', '-2'],
      // Sayılanı boş satır dokunulmaz (sayılmaz).
      [same.sku, '', '', '', ''],
    ]);
    expect(ready).toMatchObject({
      type: 'stock',
      warehouseId,
      status: 'preview_ready',
      stats: { insert: 2, update: 1, error: 3, warning: 1 },
      canApply: true,
    });
    expect(ready.problems.map((problem) => [problem.row, problem.issues])).toEqual([
      [4, [{ column: 'stock', code: 'stock_unchanged' }]],
      [6, [{ column: 'sku', code: 'not_found' }]],
      [7, [{ column: 'stock', code: 'below_reserved' }]],
      [
        8,
        [
          { column: 'sku', code: 'not_found' },
          { column: 'stock', code: 'negative' },
        ],
      ],
    ]);
    const report = await download(ready.errorReportUrl ?? '');
    expect(report[0]).toEqual(['Satır', 'SKU', 'Sistemde', 'Sayılan', 'Fark', 'İşlem', 'Sorun']);
    expect(report[1]?.slice(0, 6)).toEqual([
      2,
      changed.sku.toLowerCase(),
      '40',
      '37',
      '-3',
      'Değişiyor',
    ]);
    expect(report[2]?.slice(0, 6)).toEqual([3, fresh.sku, '', '3.5', '+3.5', 'İlk sayım']);

    // Başka üye (işi açmayan) onaylayamaz.
    const colleague = await addMember(seller.businessId, 'seller_business_admin');
    const colleagueWho = { businessId: seller.businessId, admin: colleague };
    expect((await getJob(ready.id, colleagueWho)).canApply).toBe(false);
    expect((await approve(ready.id, colleagueWho)).status).toBe(403);

    expect((await approve(ready.id)).status).toBe(202);
    expect(await applyJob.run({ businessId: seller.businessId, jobId: ready.id }, silentLog)).toBe(
      'done',
    );
    const done = await getJob(ready.id);
    expect(done).toMatchObject({
      status: 'done',
      stats: { insert: 2, update: 1, error: 3, warning: 1 },
    });
    expect((await stockOf(changed.variantId))?.on_hand).toBe('37.000');
    expect((await stockOf(fresh.variantId))?.on_hand).toBe('3.500');
    expect((await stockOf(zero.variantId))?.on_hand).toBe('0.000');
    expect((await stockOf(reserved.variantId))?.on_hand).toBe('20.000');
    // R35: yalnız adjustment hareketi; aynı sayı hareket yazmaz; ilk sayım 0 satır açar.
    const userId = seller.admin.userId;
    expect(await movements(changed.variantId)).toEqual([
      { type: 'receipt', on_hand_delta: '40.000', created_by: userId },
      { type: 'adjustment', on_hand_delta: '-3.000', created_by: userId },
    ]);
    expect(await movements(same.variantId)).toHaveLength(1);
    expect(await movements(zero.variantId)).toEqual([
      { type: 'adjustment', on_hand_delta: '0.000', created_by: userId },
    ]);
    const result = await download(done.resultReportUrl ?? '');
    expect(result.slice(1).map((row) => row[2])).toEqual([
      'Değişiyor',
      'İlk sayım',
      'Değişmiyor',
      'İlk sayım',
      'Uygulanmadı',
      'Uygulanmadı',
      'Uygulanmadı',
    ]);
    const [audit] = await platformRows<{ after: unknown }>(
      `select after from audit_logs where action = 'import.applied' and target_id = $1`,
      [ready.id],
    );
    expect(audit?.after).toEqual({ insert: 2, update: 1, error: 3, warning: 1, warehouseId });
  });

  it('F3.11c-S2 şablondan sonra değişen stok uygulanmaz (S2 = B): önizlemede ve onayla uygulama arasında', async () => {
    const early = await product();
    const late = await product();
    await receipt(early.variantId, '10');
    await receipt(late.variantId, '10');
    // Şablon 10 gösterdi; önizlemeden önce mal girişi oldu.
    await receipt(early.variantId, '3');
    const ready = await preview([
      [early.sku, '', '', '10', '8'],
      [late.sku, '', '', '10', '9'],
    ]);
    expect(ready.stats).toMatchObject({ update: 1, error: 1 });
    expect(ready.problems[0]).toMatchObject({
      row: 2,
      issues: [{ column: 'current_stock', code: 'stock_changed' }],
    });
    // Önizlemeden sonra (onaydan önce) mal girişi: uygulama satır kilidi altında yeniden denetler.
    await receipt(late.variantId, '2');
    expect((await approve(ready.id)).status).toBe(202);
    expect(await applyJob.run({ businessId: seller.businessId, jobId: ready.id }, silentLog)).toBe(
      'done',
    );
    expect(await getJob(ready.id)).toMatchObject({ stats: { update: 0, error: 2 } });
    expect((await stockOf(early.variantId))?.on_hand).toBe('13.000');
    expect((await stockOf(late.variantId))?.on_hand).toBe('12.000');
  });

  it('F3.11c-WH depo önizlemede veya uygulamada pasifse iş WAREHOUSE_INACTIVE; stok değişmez', async () => {
    const item = await product();
    await receipt(item.variantId, '4');
    const temp = await newWarehouse(seller, 'Müvəqqəti anbar');
    await receipt(item.variantId, '4', temp);
    const ready = await preview([[item.sku, '', '', '4', '6']], temp);
    expect(ready.status).toBe('preview_ready');
    expect((await approve(ready.id)).status).toBe(202);
    await platformRows(`update warehouses set status = 'inactive' where id = $1`, [temp]);
    expect(await applyJob.run({ businessId: seller.businessId, jobId: ready.id }, silentLog)).toBe(
      'failed',
    );
    expect(await getJob(ready.id)).toMatchObject({
      status: 'failed',
      failureCode: 'WAREHOUSE_INACTIVE',
    });
    expect((await stockOf(item.variantId, temp))?.on_hand).toBe('4.000');

    const other = await newWarehouse(seller, 'Sonra pasif');
    const fileId = await readyImportFile(
      storage,
      seller,
      await xlsx(HEADER, [[item.sku, '', '', '', '1']]),
    );
    const created = await create({ type: 'stock', fileId, warehouseId: other });
    expect(created.status).toBe(202);
    await platformRows(`update warehouses set status = 'inactive' where id = $1`, [other]);
    const id = (created.body as JobJson).id;
    expect(await validate.run({ businessId: seller.businessId, jobId: id })).toBe('failed');
    expect((await getJob(id)).failureCode).toBe('WAREHOUSE_INACTIVE');
  });

  it('F3.11c-SCOPE stok izni onay anında da aranır: izin kalkınca onay 403, iş preview_ready kalır', async () => {
    const item = await product();
    const member = await customMember([
      ['imports.run', 'all'],
      ['inventory.manage', 'all'],
    ]);
    const who = { businessId: seller.businessId, admin: member };
    const ready = await preview([[item.sku, '', '', '', '2']], warehouseId, who);
    expect(ready.canApply).toBe(true);
    await platformRows(
      `with r as (select role_id from memberships where id = $1),
            d as (delete from role_permissions where role_id = (select role_id from r)
                   and permission_code = 'inventory.manage')
       update roles set permissions_version = permissions_version + 1
        where id = (select role_id from r)`,
      [member.membershipId],
    );
    expect((await getJob(ready.id, who)).canApply).toBe(false);
    expect((await approve(ready.id, who)).status).toBe(403);
    expect((await getJob(ready.id, who)).status).toBe('preview_ready');
  });

  it('F3.11c-CONC içe aktarma ile elle sayım aynı anda: kayıp yok, kilitlenme yok; hareket toplamı satıra eşit', async () => {
    const items = await Promise.all(Array.from({ length: 4 }, async () => await product()));
    for (const item of items) await receipt(item.variantId, '10');
    const first = await preview(items.map((item) => [item.sku, '', '', '', '20']));
    const second = await preview([...items].reverse().map((item) => [item.sku, '', '', '', '30']));
    expect((await approve(first.id)).status).toBe(202);
    expect((await approve(second.id)).status).toBe(202);
    const [a, b] = await Promise.all([
      applyJob.run({ businessId: seller.businessId, jobId: first.id }, silentLog),
      applyJob.run({ businessId: seller.businessId, jobId: second.id }, silentLog),
      ...items.map(async (item) => {
        await receipt(item.variantId, '1');
      }),
    ]);
    expect([a, b]).toEqual(['done', 'done']);
    for (const item of items) {
      const row = await stockOf(item.variantId);
      const [sum] = await businessRows<{ total: string }>(
        seller.businessId,
        `select sum(on_hand_delta)::text as total from stock_movements
          where variant_id = $1 and warehouse_id = $2`,
        [item.variantId, warehouseId],
      );
      expect(sum?.total).toBe(row?.on_hand);
      expect(['20.000', '21.000', '30.000', '31.000']).toContain(row?.on_hand);
    }
  });

  it('F3.11c-V3 ürün şablonunun stok sütunu: quantity → varsayılan depoya sayım; availability → var/yok; none → not; stok izni yoksa uyarı', async () => {
    const existing = await product();
    await receipt(existing.variantId, '5');
    const newSku = sku('V3');
    const productRow = (code: string, stock: string) => [
      code,
      '',
      'Yeni şampun',
      '',
      '',
      categoryName,
      '',
      'H87',
      '',
      '',
      stock,
    ];
    const productPreview = async (rows: unknown[][], who: Who = seller) => {
      const fileId = await readyImportFile(storage, seller, await xlsx(PRODUCT_HEADER, rows));
      const created = await create({ type: 'products', fileId }, who);
      expect(created.status, JSON.stringify(created.body)).toBe(202);
      const id = (created.body as JobJson).id;
      await validate.run({ businessId: seller.businessId, jobId: id });
      return await getJob(id, who);
    };
    const run = async (id: string) => {
      expect((await approve(id)).status).toBe(202);
      expect(await applyJob.run({ businessId: seller.businessId, jobId: id }, silentLog)).toBe(
        'done',
      );
    };
    const setMode = async (mode: string) => {
      await platformRows(`update seller_profiles set stock_mode = $2 where business_id = $1`, [
        seller.businessId,
        mode,
      ]);
    };

    await setMode('quantity');
    const quantity = await productPreview([
      productRow(newSku, '12'),
      [existing.sku, '', '', '', '', '', '', '', '', '', '9'],
    ]);
    expect(quantity).toMatchObject({
      status: 'preview_ready',
      stats: { insert: 1, update: 1, error: 0 },
    });
    expect(quantity.problems).toEqual([]);
    await run(quantity.id);
    expect((await stockOf(existing.variantId))?.on_hand).toBe('9.000');
    const [created] = await businessRows<{ id: string }>(
      seller.businessId,
      `select id from product_variants where sku = $1`,
      [newSku],
    );
    expect((await stockOf(created?.id ?? ''))?.on_hand).toBe('12.000');
    expect((await movements(existing.variantId)).map((row) => row.type)).toEqual([
      'receipt',
      'adjustment',
    ]);

    await setMode('availability');
    const availability = await productPreview([
      [existing.sku, '', '', '', '', '', '', '', '', '', '0'],
    ]);
    await run(availability.id);
    const [flag] = await businessRows<{ is_available: boolean }>(
      seller.businessId,
      `select is_available from product_variants where id = $1`,
      [existing.variantId],
    );
    expect(flag?.is_available).toBe(false);
    expect((await stockOf(existing.variantId))?.on_hand).toBe('9.000');

    await setMode('none');
    const none = await productPreview([[existing.sku, '', '', '', '', '', '', '', '', '', '3']]);
    expect((none as JobJson & { notes: string[] }).notes).toEqual(['stock_column_ignored']);

    await setMode('quantity');
    const importer = await customMember([
      ['imports.run', 'all'],
      ['catalog.manage', 'all'],
    ]);
    const denied = await productPreview([[existing.sku, '', '', '', '', '', '', '', '', '', '1']], {
      businessId: seller.businessId,
      admin: importer,
    });
    expect(denied.stats).toMatchObject({ update: 1, warning: 1, error: 0 });
    expect(denied.problems[0]?.issues).toEqual([
      { column: 'stock', code: 'stock_ignored_no_permission' },
    ]);
    await setMode('availability');
  });
});
