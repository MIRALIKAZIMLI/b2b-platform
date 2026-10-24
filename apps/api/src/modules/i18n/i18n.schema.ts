// i18n tabloları (G sınıfı, data-model §4.3). Herkes okur; yalnızca platform bağlamı yazar.
// RLS politikaları ve GRANT'lar migration'da elle yazılır (drizzle/0003_i18n.sql, ADR-0005).
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  type AnyPgColumn,
  integer,
  jsonb,
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

export const languages = pgTable(
  'languages',
  {
    code: char('code', { length: 2 }).primaryKey(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    direction: text('direction').notNull().default('ltr'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('languages_single_default_uq')
      .on(table.isDefault)
      .where(sql`${table.isDefault}`),
    check('languages_direction_check', sql`${table.direction} in ('ltr', 'rtl')`),
  ],
);

export const uiTranslations = pgTable(
  'ui_translations',
  {
    key: text('key').notNull(),
    lang: char('lang', { length: 2 })
      .notNull()
      .references(() => languages.code),
    value: text('value').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.key, table.lang] })],
);

export const currencies = pgTable(
  'currencies',
  {
    code: char('code', { length: 3 }).primaryKey(),
    symbol: text('symbol').notNull(),
    decimals: smallint('decimals').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [check('currencies_decimals_check', sql`${table.decimals} between 0 and 4`)],
);

export const countries = pgTable('countries', {
  code: char('code', { length: 2 }).primaryKey(),
  name: jsonb('name').notNull(),
  defaultCurrency: char('default_currency', { length: 3 })
    .notNull()
    .references(() => currencies.code),
  defaultTimezone: text('default_timezone').notNull(),
  phonePrefix: text('phone_prefix').notNull(),
  ...timestamps,
});

export const regions = pgTable(
  'regions',
  {
    // Geçici istisna: kimlik veritabanında üretilir (settings.id gibi; açık soru S5).
    id: uuid('id').primaryKey().defaultRandom(),
    countryCode: char('country_code', { length: 2 })
      .notNull()
      .references(() => countries.code),
    parentId: uuid('parent_id').references((): AnyPgColumn => regions.id),
    type: text('type').notNull(),
    name: jsonb('name').notNull(),
    ...timestamps,
  },
  (table) => [check('regions_type_check', sql`${table.type} in ('city', 'district')`)],
);
