// Ürün tabloları (F3.3a, US-030; data-model §4.8). Dördü de T sınıfı (`seller_id`): kiracı
// politikası + platform yalnız okur (R39, US-016 AC5 listesi). Çocuk tablolar üst satıra
// `(id, seller_id)` bileşik FK ile bağlanır: başka satıcının ürününe satır eklenemez (RLS'e ek
// savunma). RLS, GRANT, tetikleyici ve `rls:T` yorumları migration'da elle (drizzle/0034_products.sql).
// `products` ve `product_variants` silinmez (arşiv, K3): app_user'a DELETE izni verilmez.
import { PACKAGING_LEVELS, PRODUCT_STATUSES, VARIANT_STATUSES } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { brands, categories, units } from './catalog.schema';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

function inList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/** Ürün kartı. `name` en az bir dilde dolu (K7; API denetler). */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    sellerId: uuid('seller_id').notNull(),
    sku: text('sku').notNull(),
    name: jsonb('name').notNull(),
    description: jsonb('description'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    brandId: uuid('brand_id').references(() => brands.id),
    baseUnitCode: text('base_unit_code')
      .notNull()
      .references(() => units.code),
    hasExpiry: boolean('has_expiry').notNull().default(false),
    shelfLifeMonths: smallint('shelf_life_months'),
    status: text('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique('products_seller_sku_uq').on(table.sellerId, table.sku),
    // Çocuk tabloların bileşik FK hedefi.
    unique('products_id_seller_uq').on(table.id, table.sellerId),
    check('products_status_check', sql`${table.status} in (${inList(PRODUCT_STATUSES)})`),
    // US-030 AC5: son kullanma tarihli üründe raf ömrü (ay) zorunlu; değilse boş.
    check(
      'products_shelf_life_check',
      sql`(${table.hasExpiry} and ${table.shelfLifeMonths} is not null and ${table.shelfLifeMonths} between 1 and 120) or (not ${table.hasExpiry} and ${table.shelfLifeMonths} is null)`,
    ),
    check('products_name_check', sql`jsonb_typeof(${table.name}) = 'object'`),
    index('products_seller_status_idx').on(table.sellerId, table.status, table.createdAt),
    index('products_brand_idx').on(table.brandId),
    index('products_category_idx').on(table.categoryId),
  ],
);

/** Varyant (ör. 400 ml). Kaldırılan varyant arşivlenir (K3); SKU satıcı içinde tek. */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id').notNull(),
    sellerId: uuid('seller_id').notNull(),
    sku: text('sku').notNull(),
    attributes: jsonb('attributes').notNull().default({}),
    gtin: text('gtin'),
    isAvailable: boolean('is_available').notNull().default(true),
    status: text('status').notNull().default('active'),
    sortOrder: smallint('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'product_variants_product_fk',
      columns: [table.productId, table.sellerId],
      foreignColumns: [products.id, products.sellerId],
    }),
    unique('product_variants_seller_sku_uq').on(table.sellerId, table.sku),
    unique('product_variants_id_seller_uq').on(table.id, table.sellerId),
    check('product_variants_status_check', sql`${table.status} in (${inList(VARIANT_STATUSES)})`),
    check('product_variants_attributes_check', sql`jsonb_typeof(${table.attributes}) = 'object'`),
    index('product_variants_product_idx').on(table.productId),
    index('product_variants_seller_gtin_idx').on(table.sellerId, table.gtin),
  ],
);

/** Ambalaj seviyesi (adet → iç paket → koli → palet). `base_qty` = içerdiği temel birim sayısı. */
export const productPackaging = pgTable(
  'product_packaging',
  {
    id: uuid('id').primaryKey(),
    variantId: uuid('variant_id').notNull(),
    sellerId: uuid('seller_id').notNull(),
    level: text('level').notNull(),
    unitCode: text('unit_code')
      .notNull()
      .references(() => units.code),
    baseQty: numeric('base_qty', { precision: 14, scale: 3 }).notNull(),
    gtin: text('gtin'),
    weightG: integer('weight_g'),
    dimensionsMm: jsonb('dimensions_mm'),
    isSalesUnit: boolean('is_sales_unit').notNull().default(false),
    minOrderQty: numeric('min_order_qty', { precision: 14, scale: 3 }).notNull().default('1'),
    orderMultiple: numeric('order_multiple', { precision: 14, scale: 3 }).notNull().default('1'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'product_packaging_variant_fk',
      columns: [table.variantId, table.sellerId],
      foreignColumns: [productVariants.id, productVariants.sellerId],
    }),
    unique('product_packaging_variant_level_uq').on(table.variantId, table.level),
    // F3.6a: `price_list_items` bileşik FK hedefi (başka satıcının ambalajına fiyat yazılamaz).
    unique('product_packaging_id_seller_uq').on(table.id, table.sellerId),
    check('product_packaging_level_check', sql`${table.level} in (${inList(PACKAGING_LEVELS)})`),
    check('product_packaging_base_qty_check', sql`${table.baseQty} > 0`),
    check(
      'product_packaging_order_qty_check',
      sql`${table.minOrderQty} > 0 and ${table.orderMultiple} > 0`,
    ),
    check('product_packaging_weight_check', sql`${table.weightG} is null or ${table.weightG} > 0`),
    index('product_packaging_seller_gtin_idx').on(table.sellerId, table.gtin),
  ],
);

/**
 * Görünürlük kuralı (K5): satır yoksa ürün bütün bağlı perakendecilere görünür; satır varsa
 * perakendecinin bölgesi (`businesses.region_id`, V8) satırlardan birine uymalı (değerlendirme
 * F3.12a). Fiyat listesi kuralı (`price_list_id`) F3.6a kendi migration'ıyla ekler.
 */
export const productVisibility = pgTable(
  'product_visibility',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id').notNull(),
    sellerId: uuid('seller_id').notNull(),
    regionId: uuid('region_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'product_visibility_product_fk',
      columns: [table.productId, table.sellerId],
      foreignColumns: [products.id, products.sellerId],
    }),
    unique('product_visibility_product_region_uq').on(table.productId, table.regionId),
  ],
);

/**
 * Ürün görselleri (F3.4a, US-030 AC3; kart K1–K12). T sınıfı (`seller_id`); platform yalnız okur.
 * `file_id` → `files(owner_business_id, id)` bileşik FK'sı modüller arası olduğundan migration'da
 * elle (drizzle/0035_product_images.sql). Satır silinebilir (K7); depo nesneleri kalır (F2.16b).
 */
export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id').notNull(),
    sellerId: uuid('seller_id').notNull(),
    fileId: uuid('file_id').notNull(),
    sortOrder: smallint('sort_order').notNull(),
    status: text('status').notNull().default('processing'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'product_images_product_fk',
      columns: [table.productId, table.sellerId],
      foreignColumns: [products.id, products.sellerId],
    }),
    unique('product_images_file_uq').on(table.fileId),
    index('product_images_product_idx').on(table.productId, table.sortOrder),
    check('product_images_status_check', sql`${table.status} in ('processing', 'ready', 'failed')`),
    check('product_images_sort_order_check', sql`${table.sortOrder} >= 0`),
  ],
);
