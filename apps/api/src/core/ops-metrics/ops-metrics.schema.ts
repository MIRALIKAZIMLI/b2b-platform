// ops_metrics (S sınıfı, data-model §4.1, observability §2). app_user'a yalnızca INSERT ve dizi
// USAGE; okuma platform "Sistem" ekranı ve `/api/internal/metrics` ile gelir (F6.7).
// F2.16: zamanlanmış işler her başarılı çalışmada bir satır yazar (`job.<iş adı>`).
import { sql } from 'drizzle-orm';
import { bigserial, index, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const opsMetrics = pgTable(
  'ops_metrics',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
    key: text('key').notNull(),
    value: numeric('value', { precision: 18, scale: 4 }).notNull(),
    labels: jsonb('labels'),
  },
  (table) => [index('ops_metrics_key_measured_idx').on(table.key, sql`${table.measuredAt} DESC`)],
);
