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
  type ImportRowProblem,
} from '@b2b/shared';
import { Clock } from '../../../core/clock';
import { type Tx, withTenantTx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import { ProductImportLookup } from '../../catalog';
import { FilesService, XLSX_CONTENT_TYPE } from '../../files';
import { I18nService } from '../../i18n';
import { DefaultPriceListLookup } from '../../pricing';
import { SettingsService } from '../../settings';
import { ImportJobStateMachine } from '../import-job.state-machine';
import { EMPTY_STATS, ImportsRepository, type StoredImportStats } from '../imports.repository';
import { translator } from '../imports.service';
import { type RowOutcome, type ValidationResult, validateRows } from '../row-validator';
import { buildProblemReport } from '../workbooks';
import { type RawImportRow, type ReadResult, readProductRows } from '../xlsx-reader';

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

/** Önizleme yanıtına giden ilk `max` sorunlu satır (`imports.preview_problems_max`). */
export function problemsOf(outcomes: readonly RowOutcome[], max: number): ImportRowProblem[] {
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
): Promise<ReadResult> {
  return await readProductRows(body, {
    maxRows: await settings.get('imports.max_rows', businessId),
    maxUncompressedBytes: (await settings.get('imports.max_uncompressed_mb')) * BYTES_PER_MB,
    cellMax: await settings.get('imports.cell_max_chars'),
  });
}

/** Satırları taze katalog ve fiyat verisiyle doğrular (çağıranın kiracı işleminde, salt okuma). */
export async function validateWithLookups(
  tx: Tx,
  catalog: ProductImportLookup,
  prices: Pick<DefaultPriceListLookup, 'defaultListIdTx'>,
  businessId: string,
  rows: readonly RawImportRow[],
  canWritePrices: boolean,
): Promise<ValidationResult> {
  return validateRows(rows, {
    categories: await catalog.categoriesTx(tx),
    brands: await catalog.brandsTx(tx, businessId),
    units: await catalog.unitsTx(tx),
    matches: await catalog.skuMatchesTx(
      tx,
      businessId,
      rows.flatMap((row) => (row.cells.sku === undefined ? [] : [row.cells.sku])),
    ),
    defaultPriceListId: await prices.defaultListIdTx(tx, businessId),
    canWritePrices,
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
    const read = await readImportFile(this.settings, businessId, body);
    if (!read.ok) return await this.fail(ctx, job.id, read.failure);

    // 3. Doğrula (salt okuma; aynı işlemde tutarlı görüntü).
    const result = await withTenantTx(ctx, (tx) =>
      validateWithLookups(tx, this.catalog, this.prices, businessId, read.rows, job.canWritePrices),
    );

    // 4. Hata raporu (sorunlu satır veya not varsa) ve önizleme.
    const problems = problemsOf(
      result.outcomes,
      await this.settings.get('imports.preview_problems_max'),
    );
    let reportId: string | null = null;
    if (problems.length > 0 || result.notes.length > 0) {
      const t = await translator(this.i18n, REPORT_KEYS, job.locale);
      reportId = await this.files.storeGenerated(ctx, {
        purpose: 'import',
        contentType: XLSX_CONTENT_TYPE,
        body: await buildProblemReport({ t, outcomes: result.outcomes, notes: result.notes }),
      });
    }
    const stats: StoredImportStats = { ...result.stats, notes: result.notes, problems };
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
