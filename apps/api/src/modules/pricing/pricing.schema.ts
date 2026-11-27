// Fiyat tabloları (F3.6a, US-034; F3.7a müşteri fiyatı, US-035; data-model §4.9). Hepsi T sınıfı (`seller_id`): kiracı politikası +
// platform yalnız okur (R39, `check-rls` PLATFORM_WRITE_FORBIDDEN_TABLES). Perakendeci bu tablolara
// hiçbir politikayla erişemez: alıcı fiyatı yalnız `PriceResolver` üzerinden görür (F3.12a).
// Modüller arası FK'lar (işletme, para birimi, ambalaj, bağlantı, satıcı profili), RLS, GRANT ve
// `rls:T` yorumları migration'da elle (drizzle/0036_price_lists.sql, 0039_customer_prices.sql).
import { PRICE_LIST_STATUSES } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const statusList = sql.raw(PRICE_LIST_STATUSES.map((value) => `'${value}'`).join(', '));

/** Fiyat listesi. Satıcı başına tek varsayılan (kısmi benzersiz dizin, K1); varsayılan arşivlenemez (K3). */
export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid('id').primaryKey(),
    sellerId: uuid('seller_id').notNull(),
    name: text('name').notNull(),
    currencyCode: char('currency_code', { length: 3 }).notNull(),
    vatIncluded: boolean('vat_included').notNull(),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // `price_list_items`, `connections` ve `seller_profiles` bileşik FK hedefi.
    unique('price_lists_id_seller_uq').on(table.id, table.sellerId),
    uniqueIndex('price_lists_one_default_uq')
      .on(table.sellerId)
      .where(sql`${table.isDefault}`),
    check('price_lists_status_check', sql`${table.status} in (${statusList})`),
    check('price_lists_vat_rate_check', sql`${table.vatRate} >= 0 and ${table.vatRate} <= 100`),
    check('price_lists_name_check', sql`char_length(btrim(${table.name})) between 1 and 120`),
    check(
      'price_lists_default_active_check',
      sql`not ${table.isDefault} or ${table.status} = 'active'`,
    ),
  ],
);

/**
 * Ambalaj seviyesi başına liste fiyatı (ADR-0019 §3). Geçerli fiyat: `valid_from ≤ şimdi` olan en
 * büyük `valid_from`. Geçerli olmuş satır değişmez (K5); ambalaj seviyesi silinince fiyatları da
 * silinir (FK `ON DELETE CASCADE`, migration'da).
 */
export const priceListItems = pgTable(
  'price_list_items',
  {
    priceListId: uuid('price_list_id').notNull(),
    sellerId: uuid('seller_id').notNull(),
    packagingId: uuid('packaging_id').notNull(),
    unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (table) => [
    primaryKey({
      name: 'price_list_items_pk',
      columns: [table.priceListId, table.packagingId, table.validFrom],
    }),
    foreignKey({
      name: 'price_list_items_list_fk',
      columns: [table.priceListId, table.sellerId],
      foreignColumns: [priceLists.id, priceLists.sellerId],
    }),
    check('price_list_items_unit_price_check', sql`${table.unitPrice} >= 0`),
  ],
);

/**
 * Perakendeciye özel fiyat (F3.7a, US-035 AC1; ADR-0019 sırasında listeden önce). Satıcının tablosu
 * ama `buyer_id` taşır (R30): perakendeci hiçbir politikayla okuyamaz. Yalnız aktif bağlantıya yazılır
 * (servis, bağlantı satırı `FOR SHARE`). Geçerli olmuş satırın fiyatı değişmez; kaldırma bir
 * ambalajın bütün satırlarını siler (S1 = A). `branch_id` F3.8'de eklenir. FK'lar (işletmeler,
 * ambalaj ON DELETE CASCADE), RLS, arşiv tetikleyicisi migration'da elle.
 */
export const customerPrices = pgTable(
  'customer_prices',
  {
    sellerId: uuid('seller_id').notNull(),
    buyerId: uuid('buyer_id').notNull(),
    packagingId: uuid('packaging_id').notNull(),
    unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (table) => [
    primaryKey({
      name: 'customer_prices_pk',
      columns: [table.sellerId, table.buyerId, table.packagingId, table.validFrom],
    }),
    check('customer_prices_unit_price_check', sql`${table.unitPrice} >= 0`),
    check('customer_prices_parties_check', sql`${table.sellerId} <> ${table.buyerId}`),
  ],
);

/**
 * Kademeli indirim (F3.9, US-037 AC1; ADR-0019: seçilen fiyatın üzerine önce kademe). Ambalaj seviyesi
 * başına, bütün perakendecilere; `buyer_id` yok. Miktar (satış birimi) `min_qty`'ye eşit veya büyükse
 * en büyük ulaşılan kademe uygulanır (P7). `PUT /tier-prices` bir ambalajın bütün satırlarını değiştirir
 * (sil + ekle; ambalaj satırı kilitli). Tarih yok: hemen geçerli. Ambalaj FK'sı (ON DELETE CASCADE),
 * RLS ve GRANT migration'da elle (drizzle/0041_tier_prices.sql).
 */
export const tierPrices = pgTable(
  'tier_prices',
  {
    sellerId: uuid('seller_id').notNull(),
    packagingId: uuid('packaging_id').notNull(),
    minQty: numeric('min_qty', { precision: 14, scale: 3 }).notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (table) => [
    primaryKey({
      name: 'tier_prices_pk',
      columns: [table.sellerId, table.packagingId, table.minQty],
    }),
    check('tier_prices_min_qty_check', sql`${table.minQty} > 1`),
    check(
      'tier_prices_discount_percent_check',
      sql`${table.discountPercent} > 0 and ${table.discountPercent} < 100`,
    ),
  ],
);
