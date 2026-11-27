// İçe aktarmayı uygulama (F3.5c; US-031 AC3–AC5, SF-08; kart K1–K9). Worker'da `imports`
// kuyruğunda, `import.apply_requested` olayıyla. İş verisinde yalnız kimlikler; kiracı bağlamı işten
// kurulur: her okuma ve yazma `withTenantTx({businessId: satıcı, userId: işi açan})`.
// Dosya yeniden okunur ve satırlar taze veriyle yeniden doğrulanır (önizlemeden sonra katalog
// değişmiş olabilir). Hatasız satırlar 500'lük partilerle yazılır: her parti ayrı işlem, her satır
// ayrı savepoint (bir satırın 23505'i yalnız o satırı düşürür, K6). Parti sonunda aynı işlemde
// `applied_until_row` ilerler. Yarıda kalan iş devam ettirilmez: SF-08 gereği uygulanan partiler
// kalır, iş `failed` olur, kullanıcı dosyayı yeniden yükler (SKU ile güncelleme idempotent).
import { Inject, Injectable } from '@nestjs/common';
import type { ImportFailureCode, ImportNote, ImportRowIssue, ImportRowProblem } from '@b2b/shared';
import { AuditService } from '../../../core/audit';
import { Clock } from '../../../core/clock';
import { type Tx, withTenantTx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import { isImportSkuTaken, ProductImportLookup, ProductImportWriter } from '../../catalog';
import { FilesService, XLSX_CONTENT_TYPE } from '../../files';
import { I18nService } from '../../i18n';
import { DefaultPriceListLookup, ImportPriceWriter } from '../../pricing';
import { SettingsService } from '../../settings';
import { ImportJobStateMachine } from '../import-job.state-machine';
import { EMPTY_STATS, type ImportJobRow, ImportsRepository } from '../imports.repository';
import { translator } from '../imports.service';
import type { RowOutcome } from '../row-validator';
import { buildResultReport, type RowResult } from '../workbooks';
import { readImportFile, REPORT_KEYS, validateWithLookups } from './validate-import.job';

/** Outbox olay adı = BullMQ iş adı. */
export const APPLY_IMPORT_EVENT = 'import.apply_requested';

/** SF-08: parti = 500 satır (teknik sabit; her parti ayrı işlem). */
export const APPLY_BATCH_SIZE = 500;

/** `applied_until_row = 0`: iş alındı, henüz parti bitmedi (yinelenen teslim ikinci kez almaz). */
const CLAIMED = 0;

export type ApplyOutcome = 'done' | 'failed' | 'skipped';

export interface ApplyImportLog {
  warn(obj: Record<string, unknown>, msg: string): void;
}

const RESULT_KEYS: readonly string[] = [
  ...REPORT_KEYS,
  'imports.sheet.result',
  'imports.report.result',
  'imports.result.insert',
  'imports.result.update',
  'imports.result.error',
];

/** Satır yazımda reddedildi (savepoint geri alınır, satır `error`). */
class RowRejected extends Error {
  constructor(readonly issue: ImportRowIssue) {
    super(issue.code);
  }
}

/** İş partinin ortasında `applying` olmaktan çıktı (ör. zaman aşımı süpürücüsü). */
class JobMovedOn extends Error {}

interface JobContext {
  readonly businessId: string;
  readonly userId: string;
}

@Injectable()
export class ApplyImportJob {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(FilesService)
    private readonly files: Pick<FilesService, 'readyFile' | 'readContent' | 'storeGenerated'>,
    @Inject(ProductImportLookup) private readonly catalog: ProductImportLookup,
    @Inject(ProductImportWriter) private readonly writer: Pick<ProductImportWriter, 'writeTx'>,
    @Inject(DefaultPriceListLookup)
    private readonly prices: Pick<DefaultPriceListLookup, 'defaultListIdTx'>,
    @Inject(ImportPriceWriter)
    private readonly priceWriter: Pick<ImportPriceWriter, 'setUnitPriceTx'>,
    @Inject(I18nService) private readonly i18n: Pick<I18nService, 'text'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(AuditService) private readonly audit: Pick<AuditService, 'record'>,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async run(
    input: { readonly businessId: string; readonly jobId: string },
    log: ApplyImportLog,
  ): Promise<ApplyOutcome> {
    const job = await this.claim(input.businessId, input.jobId);
    if (job === undefined) return 'skipped';
    const ctx: JobContext = { businessId: input.businessId, userId: job.createdBy };
    try {
      return await this.apply(ctx, job);
    } catch (error) {
      if (error instanceof JobMovedOn) return 'skipped';
      // Ayrıntı dosyadan gelebilir: yalnız iş kimliği ve hata adı loglanır.
      log.warn(
        {
          event: 'imports.apply_failed',
          jobId: job.id,
          error: error instanceof Error ? error.name : 'unknown',
        },
        'içe aktarma uygulaması durdu',
      );
      return await this.fail(ctx, job.id, 'APPLY_FAILED');
    }
  }

  /** `applying` ve henüz alınmamış işi alır (`applied_until_row` null → 0). */
  private async claim(businessId: string, jobId: string): Promise<ImportJobRow | undefined> {
    return await withTenantTx({ businessId, userId: null }, async (tx) => {
      const row = await this.repository.findTx(tx, businessId, jobId, 'update');
      if (row?.status !== 'applying' || row.appliedUntilRow !== null) return undefined;
      const claimed = await this.repository.progressTx(tx, row.id, CLAIMED, this.clock.now());
      return claimed ? row : undefined;
    });
  }

  private async apply(ctx: JobContext, job: ImportJobRow): Promise<ApplyOutcome> {
    let body: Buffer;
    try {
      const file = await this.files.readyFile(ctx, job.fileId, 'import');
      body = await this.files.readContent(file);
    } catch (error) {
      if (error instanceof DomainError) return await this.fail(ctx, job.id, 'APPLY_FAILED');
      throw error;
    }
    const read = await readImportFile(this.settings, ctx.businessId, body);
    if (!read.ok) return await this.fail(ctx, job.id, 'APPLY_FAILED');
    const validation = await withTenantTx(ctx, (tx) =>
      validateWithLookups(
        tx,
        this.catalog,
        this.prices,
        ctx.businessId,
        read.rows,
        job.canWritePrices,
      ),
    );

    const results: RowResult[] = [];
    const outcomes = validation.outcomes;
    for (let start = 0; start < outcomes.length; start += APPLY_BATCH_SIZE) {
      const batch = outcomes.slice(start, start + APPLY_BATCH_SIZE);
      results.push(...(await this.applyBatch(ctx, job, batch)));
    }
    return await this.finish(ctx, job, results, validation.notes);
  }

  private async applyBatch(
    ctx: JobContext,
    job: ImportJobRow,
    batch: readonly RowOutcome[],
  ): Promise<RowResult[]> {
    return await withTenantTx(ctx, async (tx) => {
      const now = this.clock.now();
      const listId = job.canWritePrices
        ? await this.prices.defaultListIdTx(tx, ctx.businessId)
        : null;
      const results: RowResult[] = [];
      for (const outcome of batch) {
        results.push(await this.applyRow(tx, ctx, outcome, listId, now));
      }
      const last = batch.at(-1)?.row ?? CLAIMED;
      if (!(await this.repository.progressTx(tx, job.id, last, now))) throw new JobMovedOn();
      return results;
    });
  }

  private async applyRow(
    tx: Tx,
    ctx: JobContext,
    outcome: RowOutcome,
    listId: string | null,
    now: Date,
  ): Promise<RowResult> {
    const { row, sku } = outcome;
    const write = outcome.write;
    if (outcome.action === 'error' || write === undefined) {
      return { row, sku, result: 'error', issues: outcome.issues };
    }
    try {
      // Savepoint: reddedilen satırın yazdıkları geri alınır, parti sürer (K6).
      return await tx.transaction(async (sp) => {
        const written = await this.writer.writeTx(sp, ctx.businessId, write, now);
        if (!written.ok) throw new RowRejected({ column: written.column, code: written.code });
        if (write.price !== undefined) {
          if (listId === null) {
            throw new RowRejected({ column: 'price', code: 'no_default_price_list' });
          }
          if (written.unitPackagingId === null) {
            throw new RowRejected({ column: 'price', code: 'no_unit_packaging' });
          }
          await this.priceWriter.setUnitPriceTx(sp, {
            sellerId: ctx.businessId,
            listId,
            packagingId: written.unitPackagingId,
            unitPrice: write.price,
            userId: ctx.userId,
            now,
          });
        }
        return { row, sku, result: written.action, issues: outcome.issues };
      });
    } catch (error) {
      const issue: ImportRowIssue | undefined =
        error instanceof RowRejected
          ? error.issue
          : isImportSkuTaken(error)
            ? { column: 'sku', code: 'taken' }
            : undefined;
      if (issue === undefined) throw error;
      return { row, sku, result: 'error', issues: [...outcome.issues, issue] };
    }
  }

  private async finish(
    ctx: JobContext,
    job: ImportJobRow,
    results: readonly RowResult[],
    notes: readonly ImportNote[],
  ): Promise<ApplyOutcome> {
    let insert = 0;
    let update = 0;
    let error = 0;
    let warning = 0;
    for (const result of results) {
      if (result.result === 'insert') insert++;
      else if (result.result === 'update') update++;
      else error++;
      if (result.result !== 'error' && result.issues.length > 0) warning++;
    }
    const problemsMax = await this.settings.get('imports.preview_problems_max');
    const problems: ImportRowProblem[] = results
      .filter((result) => result.issues.length > 0)
      .slice(0, problemsMax)
      .map((result) => ({ row: result.row, sku: result.sku, issues: [...result.issues] }));
    const t = await translator(this.i18n, RESULT_KEYS, job.locale);
    const reportId = await this.files.storeGenerated(ctx, {
      purpose: 'import',
      contentType: XLSX_CONTENT_TYPE,
      body: await buildResultReport({ t, results, notes }),
    });

    ImportJobStateMachine.assertTransition('applying', 'done');
    const moved = await withTenantTx(ctx, async (tx) => {
      const ok = await this.repository.transitionTx(
        tx,
        job.id,
        'applying',
        {
          status: 'done',
          stats: { insert, update, error, warning, notes: [...notes], problems },
          resultReportFileId: reportId,
        },
        this.clock.now(),
      );
      if (ok) {
        // K16: iş başına tek kayıt (ürün başına audit yok; yeni ürün `draft`).
        await this.audit.record(tx, {
          actor: { type: 'user', userId: ctx.userId },
          businessId: ctx.businessId,
          action: 'import.applied',
          targetType: 'import_job',
          targetId: job.id,
          before: null,
          after: { insert, update, error },
        });
      }
      return ok;
    });
    return moved ? 'done' : 'skipped';
  }

  private async fail(
    ctx: JobContext,
    jobId: string,
    failureCode: ImportFailureCode,
  ): Promise<ApplyOutcome> {
    ImportJobStateMachine.assertTransition('applying', 'failed');
    const moved = await withTenantTx(ctx, (tx) =>
      this.repository.transitionTx(
        tx,
        jobId,
        'applying',
        { status: 'failed', failureCode, stats: EMPTY_STATS },
        this.clock.now(),
      ),
    );
    return moved ? 'failed' : 'skipped';
  }
}
