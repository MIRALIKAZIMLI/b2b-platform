// outbox_events (S sınıfı, data-model §4.1, ADR-0010). app_user'a yalnızca INSERT ve dizi USAGE;
// okuma ve işaretleme migrator sahipli SECURITY DEFINER fonksiyonlarla (outbox_claim_batch vb.).
import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const outboxEvents = pgTable(
  'outbox_events',
  {
    // uuid değil: sıra önemli (data-model §4.1).
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    type: text('type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    businessIds: uuid('business_ids').array().notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [
    index('outbox_events_unprocessed_idx')
      .on(table.processedAt)
      .where(sql`${table.processedAt} IS NULL`),
  ],
);
