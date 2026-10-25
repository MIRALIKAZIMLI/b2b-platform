// audit_logs (S sınıfı, yalnızca ekleme; data-model §4.1, NFR-52). app_user'a yalnızca INSERT ve
// dizi USAGE verilir; SELECT/UPDATE/DELETE yok (drizzle/0006_audit_logs.sql). Okuma ekranı F6.2.
// Henüz var olmayan tablolara FK eklenmez (F1 faz spesifikasyonu §6.10): actor_user_id → users.
import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    // uuid değil: sıra önemli (data-model §4.1).
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    actorUserId: uuid('actor_user_id'),
    actorType: text('actor_type').notNull(),
    impersonationSessionId: uuid('impersonation_session_id'),
    businessId: uuid('business_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: inet('ip'),
    requestId: text('request_id'),
  },
  (table) => [
    index('audit_logs_business_occurred_idx').on(table.businessId, table.occurredAt.desc()),
    index('audit_logs_target_idx').on(table.targetType, table.targetId),
    check('audit_logs_actor_type_check', sql`${table.actorType} in ('user', 'system', 'platform')`),
  ],
);
