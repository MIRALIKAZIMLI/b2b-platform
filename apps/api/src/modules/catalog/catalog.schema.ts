// Katalog tabloları (data-model §4.8). F3.1: birim kataloğu (`units`, `unit_conversions`, G).
// RLS politikaları, GRANT'lar ve `rls:G` yorumları migration'da elle yazılır (drizzle/0032_units.sql).
// `units` silinmez (US-028 AC3, R38): app_user'a DELETE izni verilmez.
import { UNIT_KINDS } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

const KINDS = sql.raw(UNIT_KINDS.map((value) => `'${value}'`).join(', '));

export const units = pgTable(
  'units',
  {
    // UN/ECE Rec 20 (kart F3.1 K1).
    code: text('code').primaryKey(),
    kind: text('kind').notNull(),
    name: jsonb('name').notNull(),
    abbreviation: jsonb('abbreviation').notNull(),
    allowsDecimal: boolean('allows_decimal').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check('units_code_check', sql`${table.code} ~ '^[A-Z0-9]{2,3}$'`),
    check('units_kind_check', sql`${table.kind} in (${KINDS})`),
  ],
);

/** `1 from_code = factor to_code`; aynı tür ve ters yön kuralı servis katmanında (K3). */
export const unitConversions = pgTable(
  'unit_conversions',
  {
    fromCode: text('from_code')
      .notNull()
      .references(() => units.code),
    toCode: text('to_code')
      .notNull()
      .references(() => units.code),
    factor: numeric('factor', { precision: 18, scale: 6 }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.fromCode, table.toCode] }),
    check('unit_conversions_distinct_check', sql`${table.fromCode} <> ${table.toCode}`),
    check('unit_conversions_factor_check', sql`${table.factor} > 0`),
  ],
);
