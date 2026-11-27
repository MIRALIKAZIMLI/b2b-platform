// `import_jobs` erişimi (F3.5a). Her çağrı çağıranın kiracı işleminde (RLS: yalnız kendi satıcısı);
// süre dolumu yalnız bağlamsız sistem işleminde `import_jobs_expire` ile (DEFINER, 0037).
import { Injectable } from '@nestjs/common';
import type {
  ImportFailureCode,
  ImportJobStats,
  ImportJobStatus,
  ImportNote,
  ImportRowProblem,
  ImportType,
} from '@b2b/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { importJobs } from './imports.schema';

/** `import_jobs.stats` jsonb içeriği (K13). */
export interface StoredImportStats extends ImportJobStats {
  readonly notes: ImportNote[];
  readonly problems: ImportRowProblem[];
}

export interface ImportJobRow {
  readonly id: string;
  readonly sellerId: string;
  readonly type: ImportType;
  readonly fileId: string;
  readonly status: ImportJobStatus;
  readonly stats: StoredImportStats;
  readonly errorReportFileId: string | null;
  readonly resultReportFileId: string | null;
  readonly failureCode: ImportFailureCode | null;
  readonly appliedUntilRow: number | null;
  readonly canWritePrices: boolean;
  readonly locale: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewImportJob {
  readonly id: string;
  readonly sellerId: string;
  readonly type: ImportType;
  readonly fileId: string;
  readonly canWritePrices: boolean;
  readonly locale: string;
  readonly createdBy: string;
  readonly now: Date;
}

export interface ExpiredImport {
  readonly jobId: string;
  readonly sellerId: string;
  readonly objectKey: string | null;
}

export const EMPTY_STATS: StoredImportStats = {
  insert: 0,
  update: 0,
  error: 0,
  warning: 0,
  notes: [],
  problems: [],
};

function toRow(row: typeof importJobs.$inferSelect): ImportJobRow {
  return {
    ...row,
    type: row.type as ImportType,
    status: row.status as ImportJobStatus,
    failureCode: row.failureCode as ImportFailureCode | null,
    stats: { ...EMPTY_STATS, ...(row.stats as Partial<StoredImportStats>) },
  };
}

/** Postgres benzersizlik ihlali (dosya başka işe bağlı: `import_jobs_file_uq`). */
export function isFileInUse(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 5; depth++) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === 'import_jobs_file_uq'
    ) {
      return true;
    }
    current = typeof current === 'object' && 'cause' in current ? current.cause : undefined;
  }
  return false;
}

@Injectable()
export class ImportsRepository {
  async insertTx(tx: Tx, job: NewImportJob): Promise<ImportJobRow> {
    const [row] = await tx
      .insert(importJobs)
      .values({
        id: job.id,
        sellerId: job.sellerId,
        type: job.type,
        fileId: job.fileId,
        status: 'uploaded',
        stats: EMPTY_STATS,
        canWritePrices: job.canWritePrices,
        locale: job.locale,
        createdBy: job.createdBy,
        createdAt: job.now,
        updatedAt: job.now,
      })
      .returning();
    if (row === undefined) throw new Error('içe aktarma işi yazılamadı');
    return toRow(row);
  }

  async findTx(
    tx: Tx,
    sellerId: string,
    id: string,
    lock?: 'update',
  ): Promise<ImportJobRow | undefined> {
    const query = tx
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.sellerId, sellerId)));
    const rows = lock === undefined ? await query : await query.for(lock);
    return rows[0] === undefined ? undefined : toRow(rows[0]);
  }

  /** Koşullu geçiş: satır hâlâ `from` durumundaysa yazar; değilse `false` (eşzamanlı işçi). */
  async transitionTx(
    tx: Tx,
    id: string,
    from: ImportJobStatus,
    patch: {
      readonly status: ImportJobStatus;
      readonly stats?: StoredImportStats;
      readonly errorReportFileId?: string | null;
      readonly resultReportFileId?: string | null;
      readonly failureCode?: ImportFailureCode | null;
      readonly appliedUntilRow?: number | null;
    },
    now: Date,
  ): Promise<boolean> {
    const updated = await tx
      .update(importJobs)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(importJobs.id, id), eq(importJobs.status, from)))
      .returning({ id: importJobs.id });
    return updated.length === 1;
  }

  /**
   * F3.5c: uygulama partisi bitti; aynı işlemde son uygulanan satır ve `updated_at` (takılı iş
   * süpürücüsü ilerleyen işi düşürmez). İş artık `applying` değilse `false`.
   */
  async progressTx(tx: Tx, id: string, appliedUntilRow: number, now: Date): Promise<boolean> {
    const updated = await tx
      .update(importJobs)
      .set({ appliedUntilRow, updatedAt: now })
      .where(and(eq(importJobs.id, id), eq(importJobs.status, 'applying')))
      .returning({ id: importJobs.id });
    return updated.length === 1;
  }

  /**
   * SF-08 + F3.5c S2 = A (bağlamsız sistem işlemi): süresi dolan önizlemeler ve saklama süresi
   * geçen biten işler silinir; depo anahtarları döner.
   */
  async expireTx(
    tx: Tx,
    previewCutoff: Date,
    resultCutoff: Date,
    limit: number,
  ): Promise<ExpiredImport[]> {
    const result = await tx.execute<{
      job_id: string;
      seller_id: string;
      object_key: string | null;
    }>(
      sql`select job_id, seller_id, object_key from import_jobs_expire(${previewCutoff.toISOString()}::timestamptz, ${resultCutoff.toISOString()}::timestamptz, ${limit}::int)`,
    );
    return result.rows.map((row) => ({
      jobId: row.job_id,
      sellerId: row.seller_id,
      objectKey: row.object_key,
    }));
  }

  /** F3.5c K10 (bağlamsız sistem işlemi): ilerlemeyen işler `failed` + `TIMED_OUT`; kimlikleri. */
  async timeOutTx(tx: Tx, cutoff: Date, limit: number): Promise<string[]> {
    const result = await tx.execute<{ job_id: string }>(
      sql`select job_id from import_jobs_time_out(${cutoff.toISOString()}::timestamptz, ${limit}::int)`,
    );
    return result.rows.map((row) => row.job_id);
  }
}
