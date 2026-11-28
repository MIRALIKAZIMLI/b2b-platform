// Miktarlı stok sorguları (F3.11a; data-model §4.10, US-039 AC1, AC7). Hepsi çağıranın kiracı
// işleminde; RLS yalnız `seller_id = app.business_id` satırlarını gösterir, sorgular satıcıyı ayrıca
// açıkça süzer (ikinci savunma). Stok satırına yazma yoktur: `app_user` yalnız hareket ekler,
// satırı `stock_movements_apply` tetikleyicisi açar/günceller (R35). Ürün adı, SKU ve temel birim
// okuma amaçlı `catalog` tablolarından birleştirilir (F3.10 `lockVariantTx` ile aynı yön, c4 §1
// `inventory → catalog`).
import { Injectable } from '@nestjs/common';
import type { ManualStockMovementType, StockMovementType } from '@b2b/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { stockMovements } from './inventory.schema';

export interface StockRowView {
  readonly warehouseId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly productName: Record<string, string>;
  readonly sku: string;
  readonly baseUnitCode: string;
  readonly onHand: string;
  readonly reserved: string;
  readonly available: string;
  readonly lowThreshold: string | null;
  readonly updatedAt: string;
}

export interface StockMovementView {
  readonly id: string;
  readonly warehouseId: string;
  readonly variantId: string;
  readonly type: StockMovementType;
  readonly onHandDelta: string;
  readonly reservedDelta: string;
  readonly orderId: string | null;
  readonly lotNo: string | null;
  readonly expiryDate: string | null;
  readonly note: string | null;
  readonly createdBy: string | null;
  readonly createdAt: string;
}

export interface StockCounts {
  readonly onHand: string;
  readonly reserved: string;
}

export interface NewStockMovement {
  readonly id: string;
  readonly sellerId: string;
  readonly warehouseId: string;
  readonly variantId: string;
  readonly type: ManualStockMovementType;
  readonly onHandDelta: string;
  readonly lotNo: string | null;
  readonly expiryDate: string | null;
  readonly note: string | null;
  readonly createdBy: string;
  readonly now: Date;
}

export interface StockListFilter {
  readonly warehouseId?: string | undefined;
  readonly variantId?: string | undefined;
  /** `available ≤ coalesce(low_threshold, varsayılan)` satırları. */
  readonly lowDefault?: string | undefined;
  readonly after?: { readonly sku: string; readonly warehouseId: string } | undefined;
  readonly limit: number;
}

export interface MovementListFilter {
  readonly warehouseId?: string | undefined;
  readonly variantId?: string | undefined;
  readonly before?: { readonly createdAt: Date; readonly id: string } | undefined;
  readonly limit: number;
}

interface StockRowDb extends Record<string, unknown> {
  warehouse_id: string;
  variant_id: string;
  product_id: string;
  product_name: Record<string, string>;
  sku: string;
  base_unit_code: string;
  on_hand: string;
  reserved: string;
  available: string;
  low_threshold: string | null;
  updated_at: Date | string;
}

interface MovementRowDb extends Record<string, unknown> {
  id: string;
  warehouse_id: string;
  variant_id: string;
  type: StockMovementType;
  on_hand_delta: string;
  reserved_delta: string;
  order_id: string | null;
  lot_no: string | null;
  expiry_date: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Date | string;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toStockRow(row: StockRowDb): StockRowView {
  return {
    warehouseId: row.warehouse_id,
    variantId: row.variant_id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    baseUnitCode: row.base_unit_code,
    onHand: row.on_hand,
    reserved: row.reserved,
    available: row.available,
    lowThreshold: row.low_threshold,
    updatedAt: iso(row.updated_at),
  };
}

function toMovement(row: MovementRowDb): StockMovementView {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    variantId: row.variant_id,
    type: row.type,
    onHandDelta: row.on_hand_delta,
    reservedDelta: row.reserved_delta,
    orderId: row.order_id,
    lotNo: row.lot_no,
    expiryDate: row.expiry_date,
    note: row.note,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

/** Sayılar metin olarak (`numeric` → string; `decimal.js` hesapları serviste). */
const STOCK_SELECT = sql`
  select s.warehouse_id, s.variant_id, p.id as product_id, p.name as product_name, v.sku,
         p.base_unit_code, s.on_hand::text as on_hand, s.reserved::text as reserved,
         (s.on_hand - s.reserved)::text as available, s.low_threshold::text as low_threshold,
         s.updated_at
    from stock s
    join product_variants v on v.id = s.variant_id and v.seller_id = s.seller_id
    join products p on p.id = v.product_id and p.seller_id = v.seller_id`;

@Injectable()
export class StockRepository {
  /** Satırın bugünkü sayıları (çağıran varyant satırını kilitlemiş olmalı); yoksa undefined. */
  async countsTx(
    tx: Tx,
    sellerId: string,
    warehouseId: string,
    variantId: string,
  ): Promise<StockCounts | undefined> {
    const result = await tx.execute<{ on_hand: string; reserved: string }>(
      sql`select on_hand::text as on_hand, reserved::text as reserved from stock
           where seller_id = ${sellerId} and warehouse_id = ${warehouseId}::uuid
             and variant_id = ${variantId}::uuid`,
    );
    const row = result.rows[0];
    return row === undefined ? undefined : { onHand: row.on_hand, reserved: row.reserved };
  }

  /** Hareketi ekler; tetikleyici aynı ifadede stok satırını günceller (R35). */
  async insertMovementTx(tx: Tx, input: NewStockMovement): Promise<StockMovementView> {
    const rows = await tx
      .insert(stockMovements)
      .values({
        id: input.id,
        sellerId: input.sellerId,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        type: input.type,
        onHandDelta: input.onHandDelta,
        reservedDelta: '0',
        lotNo: input.lotNo,
        expiryDate: input.expiryDate,
        note: input.note,
        createdBy: input.createdBy,
        createdAt: input.now,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) throw new Error('stok hareketi yazılamadı');
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      variantId: row.variantId,
      type: row.type as StockMovementType,
      onHandDelta: row.onHandDelta,
      reservedDelta: row.reservedDelta,
      orderId: row.orderId,
      lotNo: row.lotNo,
      expiryDate: row.expiryDate,
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async stockRowTx(
    tx: Tx,
    sellerId: string,
    warehouseId: string,
    variantId: string,
  ): Promise<StockRowView | undefined> {
    const result = await tx.execute<StockRowDb>(
      sql`${STOCK_SELECT}
           where s.seller_id = ${sellerId} and s.warehouse_id = ${warehouseId}::uuid
             and s.variant_id = ${variantId}::uuid`,
    );
    const row = result.rows[0];
    return row === undefined ? undefined : toStockRow(row);
  }

  /** `GET /stock`: varyant SKU, depo sırasıyla; `limit` satır (çağıran +1 ister). */
  async listTx(tx: Tx, sellerId: string, filter: StockListFilter): Promise<StockRowView[]> {
    const conditions: SQL[] = [sql`s.seller_id = ${sellerId}`];
    if (filter.warehouseId !== undefined) {
      conditions.push(sql`s.warehouse_id = ${filter.warehouseId}::uuid`);
    }
    if (filter.variantId !== undefined) {
      conditions.push(sql`s.variant_id = ${filter.variantId}::uuid`);
    }
    if (filter.lowDefault !== undefined) {
      conditions.push(
        sql`(s.on_hand - s.reserved) <= coalesce(s.low_threshold, ${filter.lowDefault}::numeric)`,
      );
    }
    if (filter.after !== undefined) {
      conditions.push(
        sql`(v.sku collate "C", s.warehouse_id) > (${filter.after.sku} collate "C", ${filter.after.warehouseId}::uuid)`,
      );
    }
    const result = await tx.execute<StockRowDb>(
      sql`${STOCK_SELECT}
           where ${sql.join(conditions, sql` and `)}
           order by v.sku collate "C", s.warehouse_id
           limit ${filter.limit}`,
    );
    return result.rows.map(toStockRow);
  }

  /** `GET /stock/movements`: yeniden eskiye; `limit` satır (çağıran +1 ister). */
  async listMovementsTx(
    tx: Tx,
    sellerId: string,
    filter: MovementListFilter,
  ): Promise<StockMovementView[]> {
    const conditions: SQL[] = [sql`m.seller_id = ${sellerId}`];
    if (filter.warehouseId !== undefined) {
      conditions.push(sql`m.warehouse_id = ${filter.warehouseId}::uuid`);
    }
    if (filter.variantId !== undefined) {
      conditions.push(sql`m.variant_id = ${filter.variantId}::uuid`);
    }
    if (filter.before !== undefined) {
      conditions.push(
        sql`(m.created_at, m.id) < (${filter.before.createdAt}, ${filter.before.id}::uuid)`,
      );
    }
    const result = await tx.execute<MovementRowDb>(
      sql`select m.id, m.warehouse_id, m.variant_id, m.type, m.on_hand_delta::text as on_hand_delta,
                 m.reserved_delta::text as reserved_delta, m.order_id, m.lot_no,
                 m.expiry_date::text as expiry_date, m.note, m.created_by, m.created_at
            from stock_movements m
           where ${sql.join(conditions, sql` and `)}
           order by m.created_at desc, m.id desc
           limit ${filter.limit}`,
    );
    return result.rows.map(toMovement);
  }

  /**
   * S2 = A: satılabilir (varyant ve ürün arşivli değil) ama hiçbir aktif depoda stok satırı olmayan
   * varyant sayısı. Miktarlı moda geçişte uyarı ve onay için.
   */
  async uncountedVariantsTx(tx: Tx, sellerId: string): Promise<number> {
    const result = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n
            from product_variants v
            join products p on p.id = v.product_id and p.seller_id = v.seller_id
           where v.seller_id = ${sellerId}
             and v.status <> 'archived' and p.status <> 'archived'
             and not exists (
               select 1 from stock s
                 join warehouses w on w.id = s.warehouse_id and w.business_id = s.seller_id
                where s.seller_id = v.seller_id and s.variant_id = v.id and w.status = 'active')`,
    );
    return result.rows[0]?.n ?? 0;
  }
}
