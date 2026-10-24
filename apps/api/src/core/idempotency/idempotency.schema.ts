// idempotency_keys (S sınıfı, data-model §4.1). app_user'ın tabloda yetkisi yoktur; erişim
// yalnızca migrator sahipli SECURITY DEFINER fonksiyonlarla (idempotency_reserve/complete/release).
import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    userId: uuid('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    // null = istek işleniyor (kilit)
    statusCode: integer('status_code'),
    responseBody: jsonb('response_body'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.userId] })],
);
