// F3.7a Excel müşteri fiyatı türü (US-035 AC2; kart K9, K11; S2 = A bir dosya bir müşteri; R30).
// Uçlar HTTP üzerinden (app_user, RLS); doğrulama ve uygulama worker sınıflarıyla doğrudan.
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
import {
  CustomerPriceImport,
  DefaultPriceListLookup,
  ImportPriceWriter,
  PricingImportModule,
} from '../../pricing';
import { SettingsService } from '../../settings';
import { StockImport } from '../../inventory';
import { ImportsRepository } from '../imports.repository';
import { ApplyImportJob } from '../jobs/apply-import.job';
import { ValidateImportJob } from '../jobs/validate-import.job';
import {
  activeConnection,
  addMember,
  arrayBufferOf,
  type Buyer,
  businessRows,
  newBuyer,
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
  buyerId: string | null;
  status: string;
  stats: { insert: number; update: number; error: number; warning: number };
  problems: { row: number; sku: string | null; issues: { column: string; code: string }[] }[];
  failureCode: string | null;
  errorReportUrl: string | null;
  resultReportUrl: string | null;
  canApply: boolean;
}

const HEADER = ['sku', 'name', 'current_price', 'price'];
const silentLog = { warn: () => undefined };
const clock = new SystemClock();

@Global()
@Module({
  providers: [{ provide: IdGenerator, useValue: new UuidV7IdGenerator(clock) }],
  exports: [IdGenerator],
})
class TestIdModule {}

describe('F3.7a Excel müşteri fiyatı içe aktarma (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let region: string;
  let seller: Seller;
  let buyer: Buyer;
  let other: Buyer;
  let connectionId: string;
  let listId: string;
  let storage: FileStorage;
  let validate: ValidateImportJob;
  let applyJob: ApplyImportJob;

  async function headers(who: { businessId: string; admin: { userId: string } } = seller) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  /** Ürün açar; varyant SKU'su ve `unit` ambalajı. */
  async function product(who: Seller = seller): Promise<{ sku: string; unitId: string }> {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who))
      .send(productBody(cats.child));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const variant = (
      response.body as {
        variants: { sku: string; packaging: { id: string; level: string }[] }[];
      }
    ).variants[0];
    const unitId = variant?.packaging.find((item) => item.level === 'unit')?.id;
    if (variant === undefined || unitId === undefined) throw new Error('ambalaj yok');
    return { sku: variant.sku, unitId };
  }

  async function putCustomerPrice(packagingId: string, unitPrice: string, who: Buyer = buyer) {
    const response = await h
      .http()
      .put('/api/v1/customer-prices')
      .set(await headers())
      .send({ buyerId: who.businessId, items: [{ packagingId, unitPrice }] });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
  }

  async function create(body: Record<string, unknown>, who: Seller = seller) {
    return await h
      .http()
      .post('/api/v1/imports')
      .set(await headers(who))
      .set('Accept-Language', 'tr')
      .send(body);
  }

  async function getJob(
    id: string,
    who: { businessId: string; admin: { userId: string } } = seller,
  ) {
    const response = await h
      .http()
      .get(`/api/v1/imports/${id}`)
      .set(await headers(who));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body as JobJson;
  }

  async function preview(rows: unknown[][], to: Buyer = buyer): Promise<JobJson> {
    const fileId = await readyImportFile(storage, seller, await xlsx(HEADER, rows));
    const created = await create({ type: 'customer_prices', fileId, buyerId: to.businessId });
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    const id = (created.body as JobJson).id;
    await validate.run({ businessId: seller.businessId, jobId: id });
    return await getJob(id);
  }

  async function download(url: string): Promise<ExcelJS.Workbook> {
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
    return book;
  }

  function sheetRows(book: ExcelJS.Workbook): unknown[][] {
    return (book.worksheets[0]?.getSheetValues() ?? [])
      .slice(1)
      .map((row) => (row as unknown[]).slice(1));
  }

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('F3.7a içe aktarma');
    cats = await seedCategories();
    seller = await newSeller(region);
    buyer = await newBuyer(region);
    other = await newBuyer(region);
    connectionId = await activeConnection(seller, buyer, new Date());
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
    const customerPrices = ports.get(CustomerPriceImport);
    validate = new ValidateImportJob(
      new ImportsRepository(),
      app.get(FilesService),
      app.get(ProductImportLookup),
      ports.get(DefaultPriceListLookup),
      app.get(I18nService),
      app.get(SettingsService),
      clock,
      customerPrices,
      app.get(StockImport),
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
      customerPrices,
      app.get(StockImport),
    );
    const list = await h
      .http()
      .post('/api/v1/price-lists')
      .set(await headers())
      .send({ name: 'Əsas', currency: 'AZN', vatIncluded: true, vatRate: '18' });
    expect(list.status, JSON.stringify(list.body)).toBe(201);
    listId = (list.body as { id: string }).id;
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F3.7a-AC2 iş açma kuralları: buyerId zorunlu; bağlantısız 422; ürün türünde buyerId 422; fiyat izni yoksa 403', async () => {
    const body = await xlsx(HEADER, [[sku('X'), '', '', '1']]);
    const missing = await create({
      type: 'customer_prices',
      fileId: await readyImportFile(storage, seller, body),
    });
    expect(missing.status).toBe(422);
    expect((missing.body as { details: unknown }).details).toEqual({ buyerId: ['required'] });
    const stranger = await create({
      type: 'customer_prices',
      fileId: await readyImportFile(storage, seller, body),
      buyerId: other.businessId,
    });
    expect(stranger.status).toBe(422);
    expect((stranger.body as { details: unknown }).details).toEqual({
      buyerId: ['not_connected'],
    });
    const products = await create({
      type: 'products',
      fileId: await readyImportFile(storage, seller, body),
      buyerId: buyer.businessId,
    });
    expect(products.status).toBe(422);
    expect((products.body as { details: unknown }).details).toEqual({ buyerId: ['not_allowed'] });
    // Fiyat izni olmayan (imports.run'lı) üye: özel rol, yalnız katalog + içe aktarma.
    const [role] = await businessRows<{ id: string }>(
      seller.businessId,
      `insert into roles (id, business_id, name, capability, is_custom)
       values (gen_random_uuid(), $1, '{"az":"İçe aktaran"}'::jsonb, 'seller', true) returning id`,
      [seller.businessId],
    );
    await businessRows(
      seller.businessId,
      `insert into role_permissions (role_id, permission_code, scope)
       values ($1, 'imports.run', 'all'), ($1, 'catalog.manage', 'all')`,
      [role?.id],
    );
    const importer = await addMember(seller.businessId, 'seller_business_admin');
    await businessRows(seller.businessId, `update memberships set role_id = $2 where id = $1`, [
      importer.membershipId,
      role?.id,
    ]);
    const forbidden = await create(
      {
        type: 'customer_prices',
        fileId: await readyImportFile(storage, seller, body),
        buyerId: buyer.businessId,
      },
      { businessId: seller.businessId, admin: importer },
    );
    expect(forbidden.status).toBe(403);
    const template = await h
      .http()
      .get(`/api/v1/imports/template?type=customer_prices&buyerId=${buyer.businessId}`)
      .set(await headers({ businessId: seller.businessId, admin: importer }));
    expect(template.status).toBe(403);
  });

  it('F3.7a-AC2 şablon seçilen müşteri için SKU, ad ve bugünkü fiyatla dolu iner; fiyat sütunu boş', async () => {
    const a = await product();
    const b = await product();
    const setList = await h
      .http()
      .put(`/api/v1/price-lists/${listId}/items`)
      .set(await headers())
      .send({ items: [{ packagingId: a.unitId, unitPrice: '1.5' }] });
    expect(setList.status).toBe(200);
    await putCustomerPrice(b.unitId, '2.25');

    const response = await h
      .http()
      .get(`/api/v1/imports/template?type=customer_prices&buyerId=${buyer.businessId}`)
      .set(await headers())
      .set('Accept-Language', 'az');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const rows = sheetRows(await download((response.body as { url: string }).url));
    expect(rows[0]).toEqual(HEADER);
    const bySku = new Map(rows.slice(1).map((row) => [row[0], row]));
    expect(bySku.get(a.sku)).toEqual([a.sku, 'Şampun 400 ml', '1.5000', '']);
    expect(bySku.get(b.sku)).toEqual([b.sku, 'Şampun 400 ml', '2.2500', '']);

    const noBuyer = await h
      .http()
      .get(`/api/v1/imports/template?type=customer_prices&buyerId=${other.businessId}`)
      .set(await headers());
    expect(noBuyer.status).toBe(422);
  });

  it('F3.7a-AC2 önizleme ve fark raporu (eklenecek / değişecek / aynı / hatalı); onay yalnız hatasız satırları yazar; sonuç raporu; audit', async () => {
    const fresh = await product();
    const changed = await product();
    const same = await product();
    const foreignSeller = await newSeller(region);
    const foreign = await product(foreignSeller);
    await putCustomerPrice(changed.unitId, '5');
    await putCustomerPrice(same.unitId, '4');

    const ready = await preview([
      [fresh.sku, '', '', '3,25'],
      [changed.sku.toLowerCase(), '', '', '5.5'],
      [same.sku, '', '', '4.00'],
      [foreign.sku, '', '', '1'],
      [sku('Z'), '', '', 'abc'],
      // Fiyatı boş satır dokunulmaz (sayılmaz).
      [sku('S'), '', '', ''],
    ]);
    expect(ready).toMatchObject({
      type: 'customer_prices',
      buyerId: buyer.businessId,
      status: 'preview_ready',
      stats: { insert: 1, update: 1, error: 2, warning: 1 },
      canApply: true,
    });
    expect(ready.problems.map((problem) => [problem.row, problem.issues])).toEqual([
      [4, [{ column: 'price', code: 'price_unchanged' }]],
      [5, [{ column: 'sku', code: 'not_found' }]],
      [
        6,
        [
          { column: 'sku', code: 'not_found' },
          { column: 'price', code: 'invalid' },
        ],
      ],
    ]);
    // Fark raporu: şu anki fiyat → yeni fiyat (Accept-Language tr).
    const report = sheetRows(await download(ready.errorReportUrl ?? ''));
    expect(report[0]).toEqual(['Satır', 'SKU', 'Şu anki fiyat', 'Yeni fiyat', 'İşlem', 'Sorun']);
    expect(report[1]?.slice(0, 5)).toEqual([2, fresh.sku, '', '3.25', 'Yeni fiyat']);
    expect(report[2]?.slice(0, 5)).toEqual([
      3,
      changed.sku.toLowerCase(),
      '5.0000',
      '5.5',
      'Fiyat değişiyor',
    ]);
    // Başka üye (işi açmayan) onaylayamaz (#85 notu: canApply).
    const colleague = await addMember(seller.businessId, 'seller_business_admin');
    expect(
      (await getJob(ready.id, { businessId: seller.businessId, admin: colleague })).canApply,
    ).toBe(false);

    const approved = await h
      .http()
      .post(`/api/v1/imports/${ready.id}/apply`)
      .set(await headers());
    expect(approved.status).toBe(202);
    expect((approved.body as JobJson).canApply).toBe(false);
    expect(await applyJob.run({ businessId: seller.businessId, jobId: ready.id }, silentLog)).toBe(
      'done',
    );
    const done = await getJob(ready.id);
    expect(done).toMatchObject({
      status: 'done',
      stats: { insert: 1, update: 1, error: 2, warning: 1 },
    });
    const prices = await businessRows<{ packaging_id: string; unit_price: string }>(
      seller.businessId,
      `select packaging_id, unit_price from customer_prices
        where buyer_id = $1 and packaging_id = any($2::uuid[]) order by unit_price`,
      [buyer.businessId, [fresh.unitId, changed.unitId, same.unitId]],
    );
    expect(prices.map((row) => [row.packaging_id, row.unit_price])).toEqual([
      [fresh.unitId, '3.2500'],
      [same.unitId, '4.0000'],
      [changed.unitId, '5.0000'],
      [changed.unitId, '5.5000'],
    ]);
    const explain = await h
      .http()
      .get(`/api/v1/prices/explain?buyerId=${buyer.businessId}&packagingId=${fresh.unitId}`)
      .set(await headers());
    expect(explain.body).toMatchObject({
      source: 'customer_price',
      unitPrice: { amount: '3.2500' },
    });
    const result = sheetRows(await download(done.resultReportUrl ?? ''));
    expect(result.slice(1).map((row) => row[2])).toEqual([
      'Eklendi',
      'Güncellendi',
      'Değişmedi',
      'Uygulanmadı',
      'Uygulanmadı',
    ]);
    const [audit] = await platformRows<{ after: unknown }>(
      `select after from audit_logs where action = 'import.applied' and target_id = $1`,
      [ready.id],
    );
    expect(audit?.after).toEqual({
      insert: 1,
      update: 1,
      error: 2,
      buyerId: buyer.businessId,
      warning: 1,
    });
    // Müfettiş 30 not 2: elle yazımla aynı fiyat audit'i, parti başına (eski → yeni).
    const priceAudits = await platformRows<{ target_id: string; before: unknown; after: unknown }>(
      `select target_id, before, after from audit_logs
        where action = 'customer_price.set' and after->>'importJobId' = $1`,
      [ready.id],
    );
    expect(priceAudits).toHaveLength(1);
    expect(priceAudits[0]?.target_id).toBe(buyer.businessId);
    expect(priceAudits[0]?.before).toEqual({
      prices: [
        { packagingId: fresh.unitId, unitPrice: null },
        { packagingId: changed.unitId, unitPrice: '5.0000' },
      ],
    });
    expect(priceAudits[0]?.after).toMatchObject({
      count: 2,
      importJobId: ready.id,
      prices: [
        { packagingId: fresh.unitId, unitPrice: '3.2500' },
        { packagingId: changed.unitId, unitPrice: '5.5000' },
      ],
    });
  });

  it('F3.7a-K9 bağlantı onaydan sonra biterse iş CONNECTION_INACTIVE ile düşer; fiyat yazılmaz (R30)', async () => {
    const lateBuyer = await newBuyer(region);
    const lateConnection = await activeConnection(seller, lateBuyer, new Date());
    const item = await product();
    const ready = await preview([[item.sku, '', '', '9']], lateBuyer);
    expect(ready.status).toBe('preview_ready');
    expect(
      (
        await h
          .http()
          .post(`/api/v1/imports/${ready.id}/apply`)
          .set(await headers())
      ).status,
    ).toBe(202);
    await businessRows(
      seller.businessId,
      `update connections set status = 'cancelled', ended_at = now(), ended_by_side = 'seller',
              end_reason = 'other', ended_by_user_id = $2
        where id = $1`,
      [lateConnection, seller.admin.userId],
    );
    expect(await applyJob.run({ businessId: seller.businessId, jobId: ready.id }, silentLog)).toBe(
      'failed',
    );
    expect(await getJob(ready.id)).toMatchObject({
      status: 'failed',
      failureCode: 'CONNECTION_INACTIVE',
    });
    const rows = await businessRows<{ n: number }>(
      seller.businessId,
      `select count(*)::int as n from customer_prices where buyer_id = $1`,
      [lateBuyer.businessId],
    );
    expect(rows[0]?.n).toBe(0);
    expect(connectionId).toEqual(expect.any(String));
  });
});
