// Miktarlı stok (F3.11a; data-model §4.10, US-039 AC1, AC7, ADR-0018). Stok satırı yalnız hareketle
// değişir: `stock_movements` ekleme tetikleyicisi (`stock_movements_apply`, SECURITY DEFINER) satırı
// ekler/günceller; `app_user` `stock` tablosuna yazamaz, hareketleri güncelleyemez ve silemez.
// Bileşik FK'lar (depo, varyant, işletme, kullanıcı), RLS, GRANT ve tetikleyici migration'da elle
// (drizzle/0042_stock.sql).
import { STOCK_MOVEMENT_TYPES } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** CHECK listesi: sabit seçenek kümesi (istemciden gelmez). */
function inList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

export const stock = pgTable(
  'stock',
  {
    sellerId: uuid('seller_id').notNull(),
    warehouseId: uuid('warehouse_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    /** Fiziksel stok, temel birimde (F3.11a K1). */
    onHand: numeric('on_hand', { precision: 14, scale: 3 }).notNull().default('0'),
    /** Rezerve (F4.4); satılabilir = on_hand − reserved. */
    reserved: numeric('reserved', { precision: 14, scale: 3 }).notNull().default('0'),
    lowThreshold: numeric('low_threshold', { precision: 14, scale: 3 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'stock_pk',
      columns: [table.sellerId, table.warehouseId, table.variantId],
    }),
    check('stock_on_hand_check', sql`${table.onHand} >= 0`),
    check(
      'stock_reserved_check',
      sql`${table.reserved} >= 0 and ${table.reserved} <= ${table.onHand}`,
    ),
    check(
      'stock_low_threshold_check',
      sql`${table.lowThreshold} is null or ${table.lowThreshold} >= 0`,
    ),
    // Varyant FK'sının (`product_variants` silinmez, yalnız arşivlenir) arama dizini.
    index('stock_variant_idx').on(table.sellerId, table.variantId),
  ],
);

/** Yalnız ekleme (R35): UPDATE/DELETE izni yok. `created_at` `Clock`'tan. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey(),
    sellerId: uuid('seller_id').notNull(),
    warehouseId: uuid('warehouse_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    type: text('type').notNull(),
    onHandDelta: numeric('on_hand_delta', { precision: 14, scale: 3 }).notNull(),
    reservedDelta: numeric('reserved_delta', { precision: 14, scale: 3 }).notNull().default('0'),
    orderId: uuid('order_id'),
    lotNo: text('lot_no'),
    expiryDate: date('expiry_date'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('stock_movements_type_check', sql`${table.type} in (${inList(STOCK_MOVEMENT_TYPES)})`),
    // Elle yazılan türlerin delta kuralı (F3.11a); rezervasyon türleri F4.4'te ayrıca kısıtlanır.
    // Sayımda fark 0 yalnız satırın ilk sayımında yazılır (servis; "sayıldı" kaydı, S2).
    check(
      'stock_movements_receipt_check',
      sql`${table.type} <> 'receipt' or (${table.onHandDelta} > 0 and ${table.reservedDelta} = 0)`,
    ),
    check(
      'stock_movements_adjustment_check',
      sql`${table.type} <> 'adjustment' or ${table.reservedDelta} = 0`,
    ),
    check(
      'stock_movements_lot_no_check',
      sql`${table.lotNo} is null or char_length(${table.lotNo}) between 1 and 64`,
    ),
    check(
      'stock_movements_note_check',
      sql`${table.note} is null or char_length(${table.note}) between 1 and 500`,
    ),
    index('stock_movements_stock_idx').on(
      table.sellerId,
      table.warehouseId,
      table.variantId,
      table.createdAt,
    ),
    index('stock_movements_seller_created_idx').on(table.sellerId, table.createdAt, table.id),
  ],
);
