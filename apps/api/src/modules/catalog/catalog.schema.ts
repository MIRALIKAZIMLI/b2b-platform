// Katalog tabloları (data-model §4.8). F3.1: birim kataloğu (`units`, `unit_conversions`, G).
// F3.2a: `categories`, `brands` (G); `activity_types` businesses modülünde (F2.3a).
// RLS politikaları, GRANT'lar ve `rls:G` yorumları migration'da elle yazılır (drizzle/0032_units.sql).
// `units` silinmez (US-028 AC3, R38): app_user'a DELETE izni verilmez.
import { UNIT_KINDS } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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

/**
 * Kategori ağacı (F3.2a, US-029; G). `id` veritabanında üretilir (G istisnası, `regions` gibi).
 * `depth` tetikleyiciyle üstten hesaplanır (1–3, R38); `parent_id` sonradan değişmez (kart K4).
 * Silinmez: app_user'a DELETE izni ve silme politikası yok (drizzle/0033_catalog_taxonomy.sql).
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    name: jsonb('name').notNull(),
    depth: smallint('depth').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check('categories_depth_check', sql`${table.depth} between 1 and 3`),
    index('categories_parent_idx').on(table.parentId),
  ],
);

/**
 * Markalar (F3.2a, US-029; G, okuma kısıtlı: aktif + kendi talebi, V5). Ad tek metin (V4). Talep
 * yalnız `brand_request_create` (SECURITY DEFINER, R37) ile; `requested_by_*` ve `decided_by_*`
 * FK'ları migration'da elle (modüller arası şema içe aktarımı yok).
 */
export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    requestedByBusinessId: uuid('requested_by_business_id'),
    requestedByUserId: uuid('requested_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: uuid('decided_by_user_id'),
    ...timestamps,
  },
  (table) => [
    check('brands_status_check', sql`${table.status} in ('requested', 'active', 'rejected')`),
    check(
      'brands_requested_by_check',
      sql`${table.status} <> 'requested' or ${table.requestedByBusinessId} is not null`,
    ),
    uniqueIndex('brands_name_uq')
      .on(sql`lower(btrim(${table.name}))`)
      .where(sql`${table.status} <> 'rejected'`),
    index('brands_requested_by_idx').on(table.requestedByBusinessId, table.createdAt),
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
