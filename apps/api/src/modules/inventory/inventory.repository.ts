// Stok modu ve var/yok sorguları (F3.10; US-038, ADR-0018). Hepsi çağıranın kiracı işleminde; RLS
// yalnız `seller_id` / `business_id = app.business_id` satırlarını gösterir, sorgular ayrıca satıcıyı
// açıkça süzer (ikinci savunma). Mod `seller_profiles` (businesses) satırında, işaret
// `product_variants.is_available` (catalog) kolonunda; c4 §2 `inventory` "var/yok" sahibidir ve bu
// iki kolona yalnız burada dokunur (modun yazımı satıcı profili PATCH'inde).
import { Injectable } from '@nestjs/common';
import type { StockMode } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';

export interface LockedVariant {
  readonly id: string;
  readonly isAvailable: boolean;
  readonly status: string;
  readonly productStatus: string;
}

@Injectable()
export class InventoryRepository {
  /**
   * Toptancının stok modu; satır yoksa (eski veri) varsayılan `availability`. `share` true ise satır
   * `FOR SHARE` kilitlenir: aynı anda gelen mod değişikliği bu işlem bitene kadar bekler.
   */
  async stockModeTx(tx: Tx, sellerId: string, share = false): Promise<StockMode> {
    const result = await tx.execute<{ stock_mode: StockMode }>(
      share
        ? sql`select stock_mode from seller_profiles where business_id = ${sellerId} for share`
        : sql`select stock_mode from seller_profiles where business_id = ${sellerId}`,
    );
    return result.rows[0]?.stock_mode ?? 'availability';
  }

  /**
   * Satıcının varyantını ürün durumuyla okur ve varyant satırını `FOR NO KEY UPDATE` kilitler
   * (eşzamanlı iki işaret sıralanır; audit'teki "önce" değeri doğru kalır). Yoksa undefined.
   */
  async lockVariantTx(
    tx: Tx,
    sellerId: string,
    variantId: string,
  ): Promise<LockedVariant | undefined> {
    const result = await tx.execute<{
      id: string;
      is_available: boolean;
      status: string;
      product_status: string;
    }>(
      sql`select v.id, v.is_available, v.status, p.status as product_status
            from product_variants v
            join products p on p.id = v.product_id and p.seller_id = v.seller_id
           where v.id = ${variantId}::uuid and v.seller_id = ${sellerId}
             for no key update of v`,
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      id: row.id,
      isAvailable: row.is_available,
      status: row.status,
      productStatus: row.product_status,
    };
  }

  async setAvailableTx(
    tx: Tx,
    sellerId: string,
    variantId: string,
    isAvailable: boolean,
    now: Date,
  ): Promise<void> {
    await tx.execute(
      sql`update product_variants set is_available = ${isAvailable}, updated_at = ${now}
           where id = ${variantId}::uuid and seller_id = ${sellerId}`,
    );
  }
}
