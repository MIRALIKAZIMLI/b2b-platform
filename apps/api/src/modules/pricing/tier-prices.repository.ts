// Kademeli indirim sorguları (F3.9, US-037; data-model §4.9 `tier_prices`). Hepsi çağıranın kiracı
// işleminde; RLS yalnız `seller_id = app.business_id` satırlarını gösterir, sorgular ayrıca
// `seller_id`'yi açıkça süzer (ikinci savunma). Ambalaj okuması (catalog) yalnız okuma ve kilit.
import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { tierPrices } from './pricing.schema';

export interface TierPriceRow {
  readonly packagingId: string;
  readonly minQty: string;
  readonly discountPercent: string;
}

@Injectable()
export class TierPricesRepository {
  /**
   * Satıcının ambalaj satırını `FOR NO KEY UPDATE` kilitler: aynı ambalaja iki eşzamanlı `PUT`
   * sıralanır (sil + ekle yarışı yok). Kilit FK denetimlerinin `FOR KEY SHARE`'ini engellemez.
   * Ambalaj başka satıcınınsa veya yoksa false.
   */
  async lockPackagingTx(tx: Tx, sellerId: string, packagingId: string): Promise<boolean> {
    const result = await tx.execute<{ id: string }>(
      sql`select id from product_packaging
           where id = ${packagingId}::uuid and seller_id = ${sellerId}
           for no key update`,
    );
    return result.rows.length > 0;
  }

  /** Ambalajların kademeleri; ambalaj, sonra eşik artan. */
  async listTx(
    tx: Tx,
    sellerId: string,
    packagingIds: readonly string[],
  ): Promise<readonly TierPriceRow[]> {
    if (packagingIds.length === 0) return [];
    return await tx
      .select({
        packagingId: tierPrices.packagingId,
        minQty: tierPrices.minQty,
        discountPercent: tierPrices.discountPercent,
      })
      .from(tierPrices)
      .where(
        and(eq(tierPrices.sellerId, sellerId), inArray(tierPrices.packagingId, [...packagingIds])),
      )
      .orderBy(asc(tierPrices.packagingId), asc(tierPrices.minQty));
  }

  /** Ambalajın bütün kademelerini yenileriyle değiştirir (kilit çağıranda). */
  async replaceTx(
    tx: Tx,
    sellerId: string,
    packagingId: string,
    tiers: readonly { readonly minQty: string; readonly discountPercent: string }[],
    createdAt: Date,
    createdBy: string,
  ): Promise<void> {
    await tx
      .delete(tierPrices)
      .where(and(eq(tierPrices.sellerId, sellerId), eq(tierPrices.packagingId, packagingId)));
    if (tiers.length === 0) return;
    await tx.insert(tierPrices).values(
      tiers.map((tier) => ({
        sellerId,
        packagingId,
        minQty: tier.minQty,
        discountPercent: tier.discountPercent,
        createdAt,
        createdBy,
      })),
    );
  }
}
