// Müşteri fiyatı sorguları (F3.7a, US-035; data-model §4.9 `customer_prices`). Hepsi çağıranın kiracı
// işleminde; RLS yalnız `seller_id = app.business_id` satırlarını gösterir, sorgular ayrıca `seller_id`'yi
// açıkça süzer (ikinci savunma). Modüller arası okumalar (c4: pricing → catalog, connections) yalnız okuma.
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { connections } from '../connections';
import { customerPrices } from './pricing.schema';

export interface CustomerPriceRow {
  readonly packagingId: string;
  readonly unitPrice: string;
  readonly validFrom: Date;
}

export interface BuyerConnection {
  readonly priceListId: string | null;
  readonly salesRepMembershipId: string | null;
}

export interface CustomerPricePackaging {
  readonly packagingId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productName: Record<string, string>;
  readonly packagingLevel: string;
}

@Injectable()
export class CustomerPricesRepository {
  /**
   * Alıcıyla aktif bağlantı. `share`: bağlantı satırı kilitlenir; iptal/engel (satırı günceller)
   * fiyat yazımı bitene kadar bekler, fiyat yazımı da bitmiş bir iptalden sonra 404 alır (R30).
   */
  async activeConnectionTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
    lock?: 'share',
  ): Promise<BuyerConnection | undefined> {
    const query = tx
      .select({
        priceListId: connections.priceListId,
        salesRepMembershipId: connections.salesRepMembershipId,
      })
      .from(connections)
      .where(
        and(
          eq(connections.sellerId, sellerId),
          eq(connections.buyerId, buyerId),
          eq(connections.status, 'active'),
        ),
      );
    const rows = lock === undefined ? await query : await query.for(lock);
    return rows[0];
  }

  /**
   * Ambalaj başına `now` anında geçerli müşteri fiyatı (en büyük `valid_from ≤ now`). Eski geçmiş
   * satırlar dönmez; ileri tarihliler `pricesTx` ile.
   */
  async effectiveTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
    packagingIds: readonly string[],
    now: Date,
  ): Promise<Map<string, CustomerPriceRow>> {
    if (packagingIds.length === 0) return new Map();
    const result = await tx.execute<{
      packaging_id: string;
      unit_price: string;
      valid_from: Date | string;
    }>(sql`select distinct on (c.packaging_id) c.packaging_id, c.unit_price, c.valid_from
             from customer_prices c
            where c.seller_id = ${sellerId}
              and c.buyer_id = ${buyerId}
              and c.packaging_id in (${sql.join(
                packagingIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
              and c.valid_from <= ${now}
            order by c.packaging_id, c.valid_from desc`);
    return new Map(
      result.rows.map((row) => [
        row.packaging_id,
        {
          packagingId: row.packaging_id,
          unitPrice: row.unit_price,
          validFrom: new Date(row.valid_from),
        },
      ]),
    );
  }

  /** Şu an geçerli ve ileri tarihli müşteri fiyatları (ambalaj, sonra tarih artan). */
  async pricesTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
    packagingIds: readonly string[],
    now: Date,
  ): Promise<readonly CustomerPriceRow[]> {
    if (packagingIds.length === 0) return [];
    const current = sql`(select max(j.valid_from) from customer_prices j
                          where j.seller_id = ${customerPrices.sellerId}
                            and j.buyer_id = ${customerPrices.buyerId}
                            and j.packaging_id = ${customerPrices.packagingId}
                            and j.valid_from <= ${now})`;
    return await tx
      .select({
        packagingId: customerPrices.packagingId,
        unitPrice: customerPrices.unitPrice,
        validFrom: customerPrices.validFrom,
      })
      .from(customerPrices)
      .where(
        and(
          eq(customerPrices.sellerId, sellerId),
          eq(customerPrices.buyerId, buyerId),
          inArray(customerPrices.packagingId, [...packagingIds]),
          or(gt(customerPrices.validFrom, now), eq(customerPrices.validFrom, current)),
        ),
      )
      .orderBy(asc(customerPrices.packagingId), asc(customerPrices.validFrom));
  }

  /** Müşteri fiyatı olan ambalajlar, imleçten sonra, artan; SKU ve ürün adıyla. */
  async packagingPageTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly CustomerPricePackaging[]> {
    const result = await tx.execute<{
      packaging_id: string;
      variant_id: string;
      sku: string;
      product_name: Record<string, string>;
      level: string;
    }>(sql`select k.id as packaging_id, v.id as variant_id, v.sku, p.name as product_name, k.level
             from product_packaging k
             join product_variants v on v.id = k.variant_id and v.seller_id = ${sellerId}
             join products p on p.id = v.product_id and p.seller_id = ${sellerId}
            where k.seller_id = ${sellerId}
              and exists (select 1 from customer_prices c
                           where c.seller_id = ${sellerId} and c.buyer_id = ${buyerId}
                             and c.packaging_id = k.id)
              ${cursor === undefined ? sql`` : sql`and k.id > ${cursor}::uuid`}
            order by k.id
            limit ${limit}`);
    return result.rows.map((row) => ({
      packagingId: row.packaging_id,
      variantId: row.variant_id,
      sku: row.sku,
      productName: row.product_name,
      packagingLevel: row.level,
    }));
  }

  /**
   * Fiyat satırlarını yazar. Aynı (alıcı, ambalaj, an) satırı varsa fiyat yalnız an henüz gelmemişse
   * güncellenir (geçerli olmuş fiyat değişmez; F3.6a K5 ve F3.5c `>` kuralı). Yazılan satır sayısı.
   */
  async upsertTx(
    tx: Tx,
    rows: readonly (typeof customerPrices.$inferInsert)[],
    now: Date,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const written = await tx
      .insert(customerPrices)
      .values([...rows])
      .onConflictDoUpdate({
        target: [
          customerPrices.sellerId,
          customerPrices.buyerId,
          customerPrices.packagingId,
          customerPrices.validFrom,
        ],
        set: { unitPrice: sql`excluded.unit_price` },
        setWhere: sql`${customerPrices.validFrom} > ${now}`,
      })
      .returning({ packagingId: customerPrices.packagingId });
    return written.length;
  }

  /** S1 = A: bir ambalajın bu alıcıdaki bütün müşteri fiyatı satırlarını siler; silinenler döner. */
  async removeTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
    packagingId: string,
  ): Promise<readonly CustomerPriceRow[]> {
    return await tx
      .delete(customerPrices)
      .where(
        and(
          eq(customerPrices.sellerId, sellerId),
          eq(customerPrices.buyerId, buyerId),
          eq(customerPrices.packagingId, packagingId),
        ),
      )
      .returning({
        packagingId: customerPrices.packagingId,
        unitPrice: customerPrices.unitPrice,
        validFrom: customerPrices.validFrom,
      });
  }
}
