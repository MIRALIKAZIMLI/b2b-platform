// İçe aktarma doğrulaması (F3.5a; US-031 AC2, SF-08, R32; kart K11–K15). Worker'da `imports`
// kuyruğunda, `import.uploaded` olayıyla. İş verisinde yalnız kimlikler; kiracı bağlamı işten
// kurulur: her okuma ve yazma `withTenantTx({businessId: satıcı, userId: işi açan})`.
// Tekrar teslimde idempotent: yalnız `uploaded`/`validating` iş işlenir; geçiş koşullu UPDATE.
import { Inject, Injectable } from '@nestjs/common';
import {
  IMPORT_ROW_ERROR_CODES,
  IMPORT_ROW_WARNING_CODES,
  IMPORT_NOTES,
  type ImportFailureCode,
  type ImportJobStats,
  type ImportNote,
  type ImportRowProblem,
} from '@b2b/shared';
import { Clock } from '../../../core/clock';
import { type Tx, withTenantTx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import { ProductImportLookup } from '../../catalog';
import { FilesService, XLSX_CONTENT_TYPE } from '../../files';
import { I18nService } from '../../i18n';
import { StockImport } from '../../inventory';
import { CustomerPriceImport, DefaultPriceListLookup } from '../../pricing';
import { SettingsService } from '../../settings';
import { ImportJobStateMachine } from '../import-job.state-machine';
import {
  EMPTY_STATS,
  type ImportJobRow,
  ImportsRepository,
  type StoredImportStats,
} from '../imports.repository';
import { translator } from '../imports.service';
import { type RowOutcome, type ValidationResult, validateRows } from '../row-validator';
import { matchedVariantIds } from '../stock-rows';
import { buildCustomerPriceReport, buildProblemReport, buildStockReport } from '../workbooks';
import {
  type ColumnSpec,
  CUSTOMER_PRICE_COLUMN_SPEC,
  PRODUCT_COLUMN_SPEC,
  type RawImportRow,
  type ReadResult,
  readProductRows,
  STOCK_COLUMN_SPEC,
} from '../xlsx-reader';
import {
  CUSTOMER_PRICE_REPORT_KEYS,
  rawPrices,
  validateCustomerPricesTx,
} from './customer-price-import';
import { rawCounts, STOCK_REPORT_KEYS, validateStockTx } from './stock-import';

/** İş türünün okuyucu sütunları (F3.7a müşteri fiyatı, F3.11c stok). */
export function columnSpecOf(type: ImportJobRow['type']): ColumnSpec {
  if (type === 'customer_prices') return CUSTOMER_PRICE_COLUMN_SPEC;
  if (type === 'stock') return STOCK_COLUMN_SPEC;
  return PRODUCT_COLUMN_SPEC;
}

/** Outbox olay adı = BullMQ iş adı. */
export const VALIDATE_IMPORT_EVENT = 'import.uploaded';

const BYTES_PER_MB = 1024 * 1024;

export type ValidateOutcome = 'preview_ready' | 'failed' | 'skipped';

/** Raporun çeviri anahtarları (i18n/seed/import-messages.ts). */
export const REPORT_KEYS: readonly string[] = [
  'imports.sheet.report',
  'imports.report.row',
  'imports.report.sku',
  'imports.report.column',
  'imports.report.kind',
  'imports.report.problem',
  'imports.report.error',
  'imports.report.warning',
  ...IMPORT_ROW_ERROR_CODES.map((code) => `imports.row.${code}`),
  ...IMPORT_ROW_WARNING_CODES.map((code) => `imports.row.${code}`),
  ...IMPORT_NOTES.map((note) => `imports.note.${note}`),
];

interface Preview {
  readonly stats: ImportJobStats;
  readonly notes: ImportNote[];
  readonly problems: ImportRowProblem[];
  readonly report: Buffer | null;
}

/** Önizleme yanıtına giden ilk `max` sorunlu satır (`imports.preview_problems_max`). */
export function problemsOf(
  outcomes: readonly Pick<RowOutcome, 'row' | 'sku' | 'issues'>[],
  max: number,
): ImportRowProblem[] {
  return outcomes
    .filter((outcome) => outcome.issues.length > 0)
    .slice(0, max)
    .map((outcome) => ({ row: outcome.row, sku: outcome.sku, issues: outcome.issues }));
}

/** Dosyayı ayardaki sınırlarla okur (doğrulama ve uygulama aynı sınırları kullanır). */
export async function readImportFile(
  settings: Pick<SettingsService, 'get'>,
  businessId: string,
  body: Buffer,
  spec: ColumnSpec = PRODUCT_COLUMN_SPEC,
): Promise<ReadResult> {
  return await readProductRows(
    body,
    {
      maxRows: await settings.get('imports.max_rows', businessId),
      maxUncompressedBytes: (await settings.get('imports.max_uncompressed_mb')) * BYTES_PER_MB,
      cellMax: await settings.get('imports.cell_max_chars'),
    },
    spec,
  );
}

/** Satırları taze katalog, fiyat ve stok verisiyle doğrular (çağıranın kiracı işleminde, salt okuma). */
export async function validateWithLookups(
  tx: Tx,
  lookups: {
    readonly catalog: ProductImportLookup;
    readonly prices: Pick<DefaultPriceListLookup, 'defaultListIdTx'>;
    readonly stock: Pick<StockImport, 'productStockContextTx'>;
  },
  businessId: string,
  rows: readonly RawImportRow[],
  rights: { readonly canWritePrices: boolean; readonly canWriteStock: boolean },
): Promise<ValidationResult> {
  const { catalog, prices } = lookups;
  const matches = await catalog.skuMatchesTx(
    tx,
    businessId,
    rows.flatMap((row) => (row.cells.sku === undefined ? [] : [row.cells.sku])),
  );
  // F3.11c (V3): stok sütunu varsa mod, varsayılan depo ve oradaki sayılar.
  const stock = rows.some((row) => row.cells.stock !== undefined)
    ? await lookups.stock.productStockContextTx(tx, businessId, matchedVariantIds(matches))
    : undefined;
  return validateRows(rows, {
    categories: await catalog.categoriesTx(tx),
    brands: await catalog.brandsTx(tx, businessId),
    units: await catalog.unitsTx(tx),
    matches,
    defaultPriceListId: await prices.defaultListIdTx(tx, businessId),
    canWritePrices: rights.canWritePrices,
    ...(stock === undefined ? {} : { stock: { ...stock, canWrite: rights.canWriteStock } }),
  });
}

@Injectable()
export class ValidateImportJob {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(FilesService)
    private readonly files: Pick<FilesService, 'readyFile' | 'readContent' | 'storeGenerated'>,
    @Inject(ProductImportLookup) private readonly catalog: ProductImportLookup,
    @Inject(DefaultPriceListLookup)
    private readonly prices: Pick<DefaultPriceListLookup, 'defaultListIdTx'>,
    @Inject(I18nService) private readonly i18n: Pick<I18nService, 'text'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(CustomerPriceImport)
    private readonly customerPrices: Pick<CustomerPriceImport, 'connectionTx' | 'currentTx'>,
    @Inject(StockImport)
    private readonly stock: Pick<
      StockImport,
      'activeWarehouseTx' | 'countsTx' | 'productStockContextTx'
    >,
  ) {}

  async run(input: {
    readonly businessId: string;
    readonly jobId: string;
  }): Promise<ValidateOutcome> {
    const { businessId, jobId } = input;
    // 1. İşi al: `uploaded → validating` (yarıda kalan `validating` yeniden denenir).
    const job = await withTenantTx({ businessId, userId: null }, async (tx) => {
      const row = await this.repository.findTx(tx, businessId, jobId, 'update');
      if (row === undefined) return undefined;
      if (row.status === 'uploaded') {
        ImportJobStateMachine.assertTransition('uploaded', 'validating');
        await this.repository.transitionTx(
          tx,
          row.id,
          'uploaded',
          { status: 'validating' },
          this.clock.now(),
        );
        return { ...row, status: 'validating' as const };
      }
      return row.status === 'validating' ? row : undefined;
    });
    if (job === undefined) return 'skipped';
    const ctx = { businessId, userId: job.createdBy };

    // 2. Dosyayı oku (R32: boyut, zip, satır ve hücre sınırları).
    let body: Buffer;
    try {
      const file = await this.files.readyFile(ctx, job.fileId, 'import');
      body = await this.files.readContent(file);
    } catch (error) {
      if (error instanceof DomainError) return await this.fail(ctx, job.id, 'FILE_INVALID');
      throw error;
    }
    const read = await readImportFile(this.settings, businessId, body, columnSpecOf(job.type));
    if (!read.ok) return await this.fail(ctx, job.id, read.failure);

    // 3. Doğrula (salt okuma; aynı işlemde tutarlı görüntü) ve 4. önizleme raporu.
    if (job.type === 'stock') {
      const stockPreview = await this.stockPreview(ctx, job, read.rows);
      if (stockPreview === null) return await this.fail(ctx, job.id, 'WAREHOUSE_INACTIVE');
      return await this.finish(ctx, job, stockPreview);
    }
    const preview =
      job.type === 'customer_prices'
        ? await this.customerPricePreview(ctx, job, read.rows)
        : await this.productPreview(ctx, job, read.rows);
    if (preview === null) return await this.fail(ctx, job.id, 'CONNECTION_INACTIVE');
    return await this.finish(ctx, job, preview);
  }

  private async finish(
    ctx: { businessId: string; userId: string },
    job: ImportJobRow,
    preview: Preview,
  ): Promise<ValidateOutcome> {
    const reportId =
      preview.report === null
        ? null
        : await this.files.storeGenerated(ctx, {
            purpose: 'import',
            contentType: XLSX_CONTENT_TYPE,
            body: preview.report,
          });
    const stats: StoredImportStats = {
      ...preview.stats,
      notes: preview.notes,
      problems: preview.problems,
    };
    ImportJobStateMachine.assertTransition('validating', 'preview_ready');
    const moved = await withTenantTx(ctx, (tx) =>
      this.repository.transitionTx(
        tx,
        job.id,
        'validating',
        { status: 'preview_ready', stats, errorReportFileId: reportId },
        this.clock.now(),
      ),
    );
    return moved ? 'preview_ready' : 'skipped';
  }

  /** Ürün türü (F3.5a): hata raporu yalnız sorunlu satır veya not varsa. */
  private async productPreview(
    ctx: { businessId: string; userId: string },
    job: ImportJobRow,
    rows: readonly RawImportRow[],
  ): Promise<Preview> {
    const result = await withTenantTx(ctx, (tx) =>
      validateWithLookups(
        tx,
        { catalog: this.catalog, prices: this.prices, stock: this.stock },
        ctx.businessId,
        rows,
        { canWritePrices: job.canWritePrices, canWriteStock: job.canWriteStock },
      ),
    );
    const problems = problemsOf(
      result.outcomes,
      await this.settings.get('imports.preview_problems_max'),
    );
    let report: Buffer | null = null;
    if (problems.length > 0 || result.notes.length > 0) {
      const t = await translator(this.i18n, REPORT_KEYS, job.locale);
      report = await buildProblemReport({ t, outcomes: result.outcomes, notes: result.notes });
    }
    return { stats: result.stats, notes: result.notes, problems, report };
  }

  /**
   * Müşteri fiyatı türü (F3.7a, US-035 AC2): fark raporu her zaman (fiyatı dolu her satır; şu anki
   * fiyat → yeni fiyat). Bağlantı bittiyse `null`.
   */
  private async customerPricePreview(
    ctx: { businessId: string; userId: string },
    job: ImportJobRow,
    rows: readonly RawImportRow[],
  ): Promise<Preview | null> {
    if (job.buyerId === null) return null;
    const buyerId = job.buyerId;
    const result = await withTenantTx(ctx, (tx) =>
      validateCustomerPricesTx(
        tx,
        { catalog: this.catalog, prices: this.customerPrices },
        { sellerId: ctx.businessId, buyerId, rows, now: this.clock.now() },
      ),
    );
    if (result === null) return null;
    const problems = problemsOf(
      result.outcomes,
      await this.settings.get('imports.preview_problems_max'),
    );
    const t = await translator(this.i18n, CUSTOMER_PRICE_REPORT_KEYS, job.locale);
    const report = await buildCustomerPriceReport({
      t,
      outcomes: result.outcomes,
      rawPrices: rawPrices(rows),
    });
    return { stats: result.stats, notes: [], problems, report };
  }

  /**
   * Stok türü (F3.11c, K7): rapor her zaman (sayılanı dolu her satır; sistemde → sayılan → fark).
   * Depo pasif veya yoksa `null`.
   */
  private async stockPreview(
    ctx: { businessId: string; userId: string },
    job: ImportJobRow,
    rows: readonly RawImportRow[],
  ): Promise<Preview | null> {
    const warehouseId = job.warehouseId;
    if (warehouseId === null) return null;
    const result = await withTenantTx(ctx, (tx) =>
      validateStockTx(
        tx,
        { catalog: this.catalog, stock: this.stock },
        { sellerId: ctx.businessId, warehouseId, rows },
      ),
    );
    if (result === null) return null;
    const problems = problemsOf(
      result.outcomes,
      await this.settings.get('imports.preview_problems_max'),
    );
    const t = await translator(this.i18n, STOCK_REPORT_KEYS, job.locale);
    const report = await buildStockReport({
      t,
      outcomes: result.outcomes,
      rawCounts: rawCounts(rows),
    });
    return { stats: result.stats, notes: [], problems, report };
  }

  private async fail(
    ctx: { businessId: string; userId: string },
    jobId: string,
    failureCode: ImportFailureCode,
  ): Promise<ValidateOutcome> {
    ImportJobStateMachine.assertTransition('validating', 'failed');
    const moved = await withTenantTx(ctx, (tx) =>
      this.repository.transitionTx(
        tx,
        jobId,
        'validating',
        { status: 'failed', failureCode, stats: EMPTY_STATS },
        this.clock.now(),
      ),
    );
    return moved ? 'failed' : 'skipped';
  }
}
