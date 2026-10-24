// `settings` tablosu (S sınıfı, data-model §4.3). app_user'ın tabloda izni yoktur; okuma ve
// yazma yalnızca settings_get / settings_put fonksiyonlarıyla (drizzle/0000_settings.sql).
// Bu şema yalnızca migration üretimi içindir; modül tabloyu doğrudan sorgulamaz.
import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull(),
    scopeId: uuid('scope_id'),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    // FK users F1.5a'da eklenir (F1 faz spesifikasyonu §6.10).
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('settings_scope_key_uq').using(
      'btree',
      table.scope,
      sql`coalesce(${table.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.key,
    ),
    check('settings_scope_check', sql`${table.scope} in ('platform', 'plan', 'business')`),
    check(
      'settings_scope_id_check',
      sql`(${table.scope} = 'platform') = (${table.scopeId} is null)`,
    ),
  ],
);
