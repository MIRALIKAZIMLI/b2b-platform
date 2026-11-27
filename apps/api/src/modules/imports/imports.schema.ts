// Excel içe aktarma işleri (data-model §4.8 `import_jobs`; F3.5a). RLS, GRANT, bileşik FK'lar
// (`files`, `businesses`, `users`) ve süre dolumu fonksiyonu migration'da elle yazılır
// (drizzle/0037_import_jobs.sql).
import { IMPORT_FAILURE_CODES, IMPORT_JOB_STATUSES, IMPORT_TYPES } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** CHECK listesi: sabit seçenek kümeleri (istemciden gelmez). */
function inList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey(),
    sellerId: uuid('seller_id').notNull(),
    type: text('type').notNull(),
    /** F3.7a (S2 = A): `customer_prices` işinin perakendecisi; FK `businesses` migration'da. */
    buyerId: uuid('buyer_id'),
    fileId: uuid('file_id').notNull(),
    status: text('status').notNull().default('uploaded'),
    /** `{insert, update, error, warning, notes[], problems[]}` (K13). */
    stats: jsonb('stats').notNull().default({}),
    errorReportFileId: uuid('error_report_file_id'),
    /** F3.5c (US-031 AC3): `done` işin sonuç raporu; bileşik FK `files` (migration'da elle). */
    resultReportFileId: uuid('result_report_file_id'),
    failureCode: text('failure_code'),
    /** F3.5c: uygulama yarıda kalırsa son uygulanan satır. */
    appliedUntilRow: integer('applied_until_row'),
    /** İşi açanın `pricing.manage` izni (Mimar S2); fiyat sütunu yoksa yok sayılır. */
    canWritePrices: boolean('can_write_prices').notNull(),
    /** Rapor metinlerinin dili (istekteki Accept-Language'den, K13). */
    locale: text('locale').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Bir dosya tek işe bağlanır (`fileId: in_use`).
    unique('import_jobs_file_uq').on(table.fileId),
    check('import_jobs_type_check', sql`${table.type} in (${inList(IMPORT_TYPES)})`),
    check(
      'import_jobs_buyer_check',
      sql`(${table.type} = 'customer_prices') = (${table.buyerId} is not null)`,
    ),
    check('import_jobs_status_check', sql`${table.status} in (${inList(IMPORT_JOB_STATUSES)})`),
    check(
      'import_jobs_failure_code_check',
      sql`(${table.status} = 'failed') = (${table.failureCode} is not null) and (${table.failureCode} is null or ${table.failureCode} in (${inList(IMPORT_FAILURE_CODES)}))`,
    ),
    check('import_jobs_stats_check', sql`jsonb_typeof(${table.stats}) = 'object'`),
    index('import_jobs_seller_idx').on(table.sellerId, table.createdAt),
    index('import_jobs_status_idx').on(table.status, table.updatedAt),
  ],
);
