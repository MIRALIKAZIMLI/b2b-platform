// F3.5a entegrasyon (US-031 AC1, AC2, AC4; SF-08; R32; kart K1–K20, Mimar S1–S5): uçlar HTTP
// üzerinden (app_user, RLS); doğrulama ve süre dolumu worker sınıflarıyla doğrudan çalıştırılır
// (yerel disk deposu, ADR-0023).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { SystemClock } from '../../../core/clock';
import { FileStorage } from '../../../core/ports/file-storage';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { ProductImportLookup } from '../../catalog';
import { FilesService } from '../../files';
import { I18nService } from '../../i18n';
import { DefaultPriceListLookup, PricingImportModule } from '../../pricing';
import { SettingsService } from '../../settings';
import { ImportsRepository } from '../imports.repository';
import { ExpireImportsJob } from '../jobs/expire-imports.job';
import { ValidateImportJob } from '../jobs/validate-import.job';
import {
  addMember,
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
  status: string;
  stats: { insert: number; update: number; error: number; warning: number };
  notes: string[];
  problems: { row: number; sku: string | null; issues: { column: string; code: string }[] }[];
  failureCode: string | null;
  errorReportUrl: string | null;
  expiresAt: string | null;
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

describe('F3.5a Excel içe aktarma (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let categoryName: string;
  let regionId: string;
  let seller: Seller;
  let other: Seller;
  let storage: FileStorage;
  let validate: ValidateImportJob;
  let expire: ExpireImportsJob;

  async function headers(who: { businessId: string; admin: { userId: string } } = seller) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function startImport(body: Buffer, who: Seller = seller) {
    const fileId = await readyImportFile(storage, who, body);
    return await h
      .http()
      .post('/api/v1/imports')
      .set(await headers(who))
      .set('Accept-Language', 'tr')
      .send({ type: 'products', fileId });
  }

  /** Dosyayı yükler, işi açar, worker doğrulamasını çalıştırır; iş görünümü. */
  async function preview(
    rows: unknown[][],
    who: Seller = seller,
    header = HEADER,
  ): Promise<JobJson> {
    const created = await startImport(await xlsx(header, rows), who);
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    const job = created.body as JobJson;
    await validate.run({ businessId: who.businessId, jobId: job.id });
    return await getJob(job.id, who);
  }

  async function getJob(id: string, who: Seller = seller): Promise<JobJson> {
    const response = await h
      .http()
      .get(`/api/v1/imports/${id}`)
      .set(await headers(who));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body as JobJson;
  }

  /** Yerel depo adresi (`/api/v1/dev/storage?token=`) uygulama üzerinden okunur. */
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

  async function createProduct(body: Record<string, unknown>, who: Seller = seller) {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who))
      .send(body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string; sku: string; variants: { sku: string }[] };
  }

  async function createDefaultList(who: Seller): Promise<void> {
    const response = await h
      .http()
      .post('/api/v1/price-lists')
      .set(await headers(who))
      .send({ name: 'Əsas', currency: 'AZN', vatIncluded: true, vatRate: '18' });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
  }

  beforeAll(async () => {
    await runSeeds();
    regionId = await newRegion('F3.5a içe aktarma');
    cats = await seedCategories();
    const [category] = await platformRows<{ name: string }>(
      `select name->>'az' as name from categories where id = $1`,
      [cats.child],
    );
    categoryName = category?.name ?? '';
    seller = await newSeller(regionId);
    other = await newSeller(regionId);
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    storage = app.get(FileStorage);
    const clock = new SystemClock();
    const settings = app.get(SettingsService);
    validate = new ValidateImportJob(
      new ImportsRepository(),
      app.get(FilesService),
      app.get(ProductImportLookup),
      (await Test.createTestingModule({ imports: [PricingImportModule] }).compile()).get(
        DefaultPriceListLookup,
      ),
      app.get(I18nService),
      settings,
      clock,
    );
    expire = new ExpireImportsJob(new ImportsRepository(), storage, settings, clock, directRunner);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F3.5a-AC1 şablon bağlantısı: 11 sütun başlığı ve kullanıcının dilinde sayfalar', async () => {
    const response = await h
      .http()
      .get('/api/v1/imports/template?type=products')
      .set(await headers())
      .set('Accept-Language', 'ru');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const link = response.body as { url: string; expiresAt: string };
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await download(link.url));
    expect((book.worksheets[0]?.getRow(1).values as unknown[]).slice(1)).toEqual(HEADER);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      'Товары',
      'Инструкция',
      'Категории',
      'Единицы',
    ]);
    const unsupported = await h
      .http()
      .get('/api/v1/imports/template?type=stock')
      .set(await headers());
    expect(unsupported.status).toBe(422);
  });

  it('F3.5a-AC2 yükleme 202 + outbox; worker önizlemesi sayılar, satır nedenleri ve hata raporu', async () => {
    await createDefaultList(seller);
    const created = await startImport(
      await xlsx(HEADER, [
        [sku('N'), '4006381333931', 'Yeni', '', '', categoryName, '', 'H87', 12, '2,50', ''],
        [sku('N'), '', 'Kategorisiz', '', '', 'Yoxdur', '', 'H87', '', '', ''],
        [sku('N'), '', '', '', '', categoryName, '', 'H87', '', '-1', ''],
      ]),
    );
    expect(created.status).toBe(202);
    const job = created.body as JobJson;
    expect(job).toMatchObject({ type: 'products', status: 'uploaded', errorReportUrl: null });

    const owner = await connectAsMigrator();
    try {
      const events = await owner.query<{ payload: Record<string, string>; business_ids: string[] }>(
        `select payload, business_ids from outbox_events where type = 'import.uploaded' and aggregate_id = $1`,
        [job.id],
      );
      expect(events.rows).toEqual([
        { payload: { jobId: job.id }, business_ids: [seller.businessId] },
      ]);
    } finally {
      await owner.end();
    }

    expect(await validate.run({ businessId: seller.businessId, jobId: job.id })).toBe(
      'preview_ready',
    );
    // Tekrar teslim: iş artık validating değil, atlanır.
    expect(await validate.run({ businessId: seller.businessId, jobId: job.id })).toBe('skipped');
    const ready = await getJob(job.id);
    expect(ready.status).toBe('preview_ready');
    expect(ready.stats).toEqual({ insert: 1, update: 0, error: 2, warning: 0 });
    expect(ready.problems.map((p) => [p.row, p.issues])).toEqual([
      [3, [{ column: 'category', code: 'not_found' }]],
      [
        4,
        [
          { column: 'name_az', code: 'required' },
          { column: 'price', code: 'negative' },
        ],
      ],
    ]);
    expect(new Date(ready.expiresAt ?? '').getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    const report = new ExcelJS.Workbook();
    await report.xlsx.load(await download(ready.errorReportUrl ?? ''));
    const rows = report.worksheets[0]
      ?.getSheetValues()
      .slice(2)
      .map((row) => (row as unknown[]).slice(1, 4));
    expect(rows).toEqual([
      [3, ready.problems[0]?.sku, 'category'],
      [4, ready.problems[1]?.sku, 'name_az'],
      [4, ready.problems[1]?.sku, 'price'],
    ]);
    // Önizleme hiçbir ürün yazmaz (uygulama F3.5c).
    const [count] = await platformRows<{ n: number }>(
      'select count(*)::int as n from products where seller_id = $1',
      [seller.businessId],
    );
    expect(count?.n).toBe(0);
  });

  it('F3.5a-AC4 aynı SKU (harf fark etmez) güncelleme sayılır; tek varyantlı ürün SKU’su da eşleşir', async () => {
    const product = await createProduct(
      productBody(cats.child, {
        sku: sku('PRD'),
        variants: [
          {
            sku: sku('VAR'),
            packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
          },
        ],
      }),
    );
    const variantSku = product.variants[0]?.sku ?? '';
    const job = await preview([
      [variantSku.toLowerCase(), '', 'Yeni ad', '', '', '', '', '', '', '', ''],
      [product.sku.toUpperCase(), '', '', '', '', '', '', '', '', '', ''],
      [sku('NEW'), '', 'Yeni', '', '', categoryName, '', 'əd.', '', '', ''],
    ]);
    expect(job.stats, JSON.stringify(job.problems)).toEqual({
      insert: 1,
      update: 2,
      error: 0,
      warning: 0,
    });
    expect(job.errorReportUrl).toBeNull();
  });

  it('F3.5a-PRICE varsayılan liste yoksa satır hatası; fiyat izni olmayan üyede uyarı (Mimar S2)', async () => {
    const noList = await preview(
      [[sku('P'), '', 'Ad', '', '', categoryName, '', 'H87', '', '5', '']],
      other,
    );
    expect(noList.problems[0]?.issues).toEqual([
      { column: 'price', code: 'no_default_price_list' },
    ]);

    // İçe aktarabilen ama fiyat yazamayan üye: satış müdürü rolünün bu işletmedeki kopyası.
    const catalogOnly = await addMember(seller.businessId, 'seller_sales_manager');
    await platformRows(
      `with r as (select role_id from memberships where id = $1)
       , d as (delete from role_permissions where role_id = (select role_id from r)
                and permission_code = 'pricing.manage')
       insert into role_permissions (role_id, permission_code, scope)
       select role_id, 'imports.run', 'all' from r on conflict do nothing`,
      [catalogOnly.membershipId],
    );
    const member = { businessId: seller.businessId, admin: catalogOnly };
    const warned = await preview(
      [[sku('P'), '', 'Ad', '', '', categoryName, '', 'H87', '', '5', '']],
      member,
    );
    expect(warned.stats).toEqual({ insert: 1, update: 0, error: 0, warning: 1 });
    expect(warned.problems[0]?.issues).toEqual([
      { column: 'price', code: 'price_ignored_no_permission' },
    ]);
  });

  it('F3.5a-V3 stok dolu ise önizlemede not; rapor üretilir', async () => {
    const job = await preview([[sku('S'), '', 'Ad', '', '', categoryName, '', 'H87', '', '', 10]]);
    expect(job.notes).toEqual(['stock_column_ignored']);
    expect(job.stats.error).toBe(0);
    expect(job.errorReportUrl).not.toBeNull();
  });

  it('F3.5a-R32 bozuk dosya, eksik başlık, satır sınırı → failed + kod', async () => {
    const broken = await startImport(Buffer.from('PK\u0003\u0004 bozuk içerik'));
    expect(broken.status).toBe(202);
    const brokenId = (broken.body as JobJson).id;
    expect(await validate.run({ businessId: seller.businessId, jobId: brokenId })).toBe('failed');
    expect(await getJob(brokenId)).toMatchObject({ status: 'failed', failureCode: 'FILE_INVALID' });

    const header = await preview([['A-1']], seller, ['sku', 'name_az']);
    expect(header).toMatchObject({ status: 'failed', failureCode: 'FILE_INVALID' });

    const maxRows = await app.get(SettingsService).get('imports.max_rows', seller.businessId);
    const rows = Array.from({ length: maxRows + 1 }, (_, i) => [`R-${String(i)}`, '', 'Ad']);
    const tooMany = await preview(rows);
    expect(tooMany).toMatchObject({ status: 'failed', failureCode: 'IMPORT_TOO_MANY_ROWS' });
  });

  it('F3.5a-PERF 5.000 satırlık sentetik dosyanın önizlemesi 60 sn içinde (S4 = B; uygulama süresi F3.5c AC5)', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => [
      `SYN-${String(i).padStart(5, '0')}`,
      '',
      `Sentetik məhsul ${String(i)}`,
      `Товар ${String(i)}`,
      '',
      categoryName,
      '',
      'H87',
      24,
      '1.25',
      '',
    ]);
    const started = Date.now();
    const job = await preview(rows);
    const elapsed = Date.now() - started;
    expect(job.status).toBe('preview_ready');
    expect(job.stats).toEqual({ insert: 5000, update: 0, error: 0, warning: 0 });
    expect(elapsed).toBeLessThan(60_000);
  }, 120_000);

  it('F3.5a-FILE başka amaçlı veya hazır olmayan dosya 422; başka işletmenin dosyası 404; dosya iki işe bağlanamaz; desteklenmeyen tür 422', async () => {
    const body = await xlsx(HEADER, []);
    const post = async (fileId: string, type = 'products') =>
      await h
        .http()
        .post('/api/v1/imports')
        .set(await headers())
        .send({ type, fileId });
    const image = await readyImportFile(storage, seller, body, { purpose: 'product_image' });
    expect((await post(image)).status).toBe(422);
    const pending = await readyImportFile(storage, seller, body, { status: 'pending' });
    expect((await post(pending)).status).toBe(422);
    const foreign = await readyImportFile(storage, other, body);
    expect((await post(foreign)).status).toBe(404);
    const fileId = await readyImportFile(storage, seller, body);
    expect((await post(fileId)).status).toBe(202);
    const again = await post(fileId);
    expect(again.status).toBe(422);
    expect((again.body as { details: Record<string, string[]> }).details).toEqual({
      fileId: ['in_use'],
    });
    expect((await post(await readyImportFile(storage, seller, body), 'stock')).status).toBe(422);
  });

  it('F3.5a-TTL süresi dolan önizleme: iş, dosya ve rapor satırı + depo nesneleri silinir; yenisi kalır', async () => {
    const old = await preview([[sku('T'), '', '', '', '', '', '', '', '', '', '']]);
    const fresh = await preview([[sku('T'), '', '', '', '', '', '', '', '', '', '']]);
    expect(old.errorReportUrl).not.toBeNull();
    const [files] = await platformRows<{
      file_id: string;
      report_id: string;
      key: string;
      report_key: string;
    }>(
      `select j.file_id, j.error_report_file_id as report_id, f.object_key as key, r.object_key as report_key
         from import_jobs j join files f on f.id = j.file_id join files r on r.id = j.error_report_file_id
        where j.id = $1`,
      [old.id],
    );
    if (files === undefined) throw new Error('iş dosyaları yok');
    const ttl = await app.get(SettingsService).get('imports.preview_ttl_hours');
    // Platform bağlamı güncelleyemez (yalnız okur); zamanı tablo sahibi olarak, kiracı bağlamında geri al.
    const owner = await connectAsMigrator();
    try {
      await owner.query('begin');
      await owner.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
      await owner.query(
        `update import_jobs set updated_at = now() - make_interval(hours => $2::int + 1) where id = $1`,
        [old.id, ttl],
      );
      await owner.query('commit');
    } finally {
      await owner.end();
    }

    const outcome = await expire.run(silentLog);
    expect(outcome).toEqual({ status: 'done', processed: 1 });
    const left = await platformRows<{ id: string }>(
      'select id from import_jobs where id = any($1::uuid[])',
      [[old.id, fresh.id]],
    );
    expect(left.map((row) => row.id)).toEqual([fresh.id]);
    const gone = await platformRows<{ id: string }>(
      'select id from files where id = any($1::uuid[])',
      [[files.file_id, files.report_id]],
    );
    expect(gone).toEqual([]);
    expect(await storage.head(files.key)).toBeNull();
    expect(await storage.head(files.report_key)).toBeNull();
    expect(
      (
        await h
          .http()
          .get(`/api/v1/imports/${old.id}`)
          .set(await headers())
      ).status,
    ).toBe(404);
  });

  it('F3.5a-SKU ürün ve varyant SKU’su harf duyarsız tekil; hata ilgili alana iner (#77 N4, #78)', async () => {
    const product = await createProduct(productBody(cats.child, { sku: sku('CASE') }));
    const variantSku = product.variants[0]?.sku ?? '';
    const dupProduct = await h
      .http()
      .post('/api/v1/products')
      .set(await headers())
      .send(productBody(cats.child, { sku: product.sku.toLowerCase() }));
    expect(dupProduct.status).toBe(422);
    expect((dupProduct.body as { details: Record<string, string[]> }).details.sku).toEqual([
      'taken',
    ]);
    const dupVariant = await h
      .http()
      .post('/api/v1/products')
      .set(await headers())
      .send(
        productBody(cats.child, {
          variants: [
            {
              sku: sku('OK'),
              packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
            },
            {
              sku: variantSku.toLowerCase(),
              packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
            },
          ],
        }),
      );
    expect(dupVariant.status).toBe(422);
    expect((dupVariant.body as { details: Record<string, string[]> }).details).toEqual({
      'variants.1.sku': ['taken'],
    });
    // Başka satıcı aynı SKU'yu kullanabilir.
    await createProduct(productBody(cats.child, { sku: product.sku.toLowerCase() }), other);
  });

  it('F3.5a-SKU migration 0037 var olan veride yalnız harfi farklı SKU’yu yakalar', async () => {
    const sql = readFileSync(join(__dirname, '../../../../drizzle/0037_import_jobs.sql'), 'utf8');
    const guard = /DO \$\$[\s\S]*?END;\n\$\$;/.exec(sql)?.[0];
    if (guard === undefined) throw new Error('0037 denetim bloğu bulunamadı');
    const product = await createProduct(productBody(cats.child, { sku: sku('MIG') }));
    const owner = await connectAsMigrator();
    try {
      await owner.query('begin');
      await expect(owner.query(guard)).resolves.toBeDefined();
      await owner.query('drop index products_seller_sku_lower_uq');
      await owner.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
      await owner.query(
        `insert into products (id, seller_id, sku, name, category_id, base_unit_code)
         select gen_random_uuid(), seller_id, lower(sku), name, category_id, base_unit_code
           from products where id = $1`,
        [product.id],
      );
      await owner.query('savepoint s');
      const failure = await owner.query(guard).then(
        () => undefined,
        (error: unknown) => error as { code?: string; message?: string },
      );
      expect(failure?.code).toBe('23505');
      expect(failure?.message).toContain('products');
    } finally {
      await owner.query('rollback');
      await owner.end();
    }
  });
});
