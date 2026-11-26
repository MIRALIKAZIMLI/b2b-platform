// Fiyat listesi sorguları (F3.6a, US-034). Hepsi çağıranın kiracı işleminde; RLS yalnız
// `seller_id = app.business_id` satırlarını gösterir (başka satıcının listesi "yok" = 404). Sorgular
// ayrıca `seller_id`'yi açıkça süzer (ikinci savunma). Modüller arası okumalar (c4: pricing →
// catalog, connections, businesses) yalnız okuma veya kendi FK'sı olan kolonlara yazma.
import { Injectable } from '@nestjs/common';
import type { PriceListStatus } from '@b2b/shared';
import { and, asc, desc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { connections } from '../connections';
import { priceListItems, priceLists } from './pricing.schema';

export interface PriceListRow {
  readonly id: string;
  readonly sellerId: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly vatIncluded: boolean;
  readonly vatRate: string;
  readonly isDefault: boolean;
  readonly status: PriceListStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PriceRow {
  readonly priceListId: string;
  readonly packagingId: string;
  readonly unitPrice: string;
  readonly validFrom: Date;
}

export interface SellerPricingContext {
  readonly currencyCode: string;
  readonly timezone: string;
}

export interface ExplainConnection {
  readonly priceListId: string | null;
  readonly salesRepMembershipId: string | null;
}

function toRow(row: typeof priceLists.$inferSelect): PriceListRow {
  return { ...row, status: row.status as PriceListStatus };
}

@Injectable()
export class PriceListsRepository {
  /** Satıcının liste yazımlarını sıraya koyar (ilk liste = varsayılan, varsayılan devri; K1). */
  async lockSellerTx(tx: Tx, sellerId: string): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`price_lists:${sellerId}`}, 0))`,
    );
  }

  /**
   * Satıcının para birimi ve saat dilimi. Para birimi boşsa ülkenin varsayılanı (F2.1a açılışta
   * ülkeden yazar; eski kayıtlar için aynı kaynak). İkisi de yoksa undefined (servis 404).
   */
  async sellerContextTx(tx: Tx, sellerId: string): Promise<SellerPricingContext | undefined> {
    const result = await tx.execute<{ currency_code: string | null; timezone: string }>(
      sql`select coalesce(b.currency_code, c.default_currency) as currency_code, b.timezone
            from businesses b left join countries c on c.code = b.country_code
           where b.id = ${sellerId}`,
    );
    const row = result.rows[0];
    if (row?.currency_code == null) return undefined;
    return { currencyCode: row.currency_code, timezone: row.timezone };
  }

  async listTx(
    tx: Tx,
    sellerId: string,
  ): Promise<readonly (PriceListRow & { readonly itemCount: number })[]> {
    const itemCount = sql<number>`(select count(distinct ${priceListItems.packagingId})::int
      from ${priceListItems} where ${priceListItems.priceListId} = ${priceLists.id})`;
    const rows = await tx
      .select({ list: priceLists, itemCount })
      .from(priceLists)
      .where(eq(priceLists.sellerId, sellerId))
      .orderBy(desc(priceLists.isDefault), asc(priceLists.status), asc(priceLists.name));
    return rows.map((row) => ({ ...toRow(row.list), itemCount: row.itemCount }));
  }

  async itemCountTx(tx: Tx, listId: string): Promise<number> {
    const rows = await tx
      .select({ count: sql<number>`count(distinct ${priceListItems.packagingId})::int` })
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, listId));
    return rows[0]?.count ?? 0;
  }

  async findTx(
    tx: Tx,
    sellerId: string,
    id: string,
    lock?: 'update' | 'share',
  ): Promise<PriceListRow | undefined> {
    const query = tx
      .select()
      .from(priceLists)
      .where(and(eq(priceLists.id, id), eq(priceLists.sellerId, sellerId)));
    const rows = lock === undefined ? await query : await query.for(lock);
    return rows[0] === undefined ? undefined : toRow(rows[0]);
  }

  async defaultTx(tx: Tx, sellerId: string): Promise<PriceListRow | undefined> {
    const rows = await tx
      .select()
      .from(priceLists)
      .where(and(eq(priceLists.sellerId, sellerId), eq(priceLists.isDefault, true)));
    return rows[0] === undefined ? undefined : toRow(rows[0]);
  }

  async hasAnyTx(tx: Tx, sellerId: string): Promise<boolean> {
    const rows = await tx
      .select({ id: priceLists.id })
      .from(priceLists)
      .where(eq(priceLists.sellerId, sellerId))
      .limit(1);
    return rows.length > 0;
  }

  async insertTx(tx: Tx, row: typeof priceLists.$inferInsert): Promise<PriceListRow> {
    const [inserted] = await tx.insert(priceLists).values(row).returning();
    if (inserted === undefined) throw new Error('fiyat listesi eklenemedi');
    return toRow(inserted);
  }

  async updateTx(
    tx: Tx,
    sellerId: string,
    id: string,
    patch: Partial<Pick<PriceListRow, 'name' | 'vatIncluded' | 'vatRate' | 'isDefault' | 'status'>>,
    now: Date,
  ): Promise<PriceListRow> {
    const [updated] = await tx
      .update(priceLists)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(priceLists.id, id), eq(priceLists.sellerId, sellerId)))
      .returning();
    if (updated === undefined) throw new Error('fiyat listesi güncellenemedi');
    return toRow(updated);
  }

  /** Varsayılanı düşürür (yenisi aynı işlemde yazılır; kısmi benzersiz dizin tek varsayılanı korur). */
  async clearDefaultTx(tx: Tx, sellerId: string, now: Date): Promise<void> {
    await tx
      .update(priceLists)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(priceLists.sellerId, sellerId), eq(priceLists.isDefault, true)));
  }

  /** `seller_profiles.default_price_list_id` (K1: `is_default` ile aynı işlemde; profil yoksa no-op). */
  async setProfileDefaultTx(tx: Tx, sellerId: string, listId: string, now: Date): Promise<void> {
    await tx.execute(sql`update seller_profiles
                            set default_price_list_id = ${listId}, updated_at = ${now}
                          where business_id = ${sellerId}`);
  }

  /** K2 = A: listeye atanmış aktif bağlantı sayısı. */
  async activeAssignmentsTx(tx: Tx, sellerId: string, listId: string): Promise<number> {
    const rows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(connections)
      .where(
        and(
          eq(connections.sellerId, sellerId),
          eq(connections.priceListId, listId),
          eq(connections.status, 'active'),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /** Verilen kimliklerden satıcının ambalaj seviyesi olanlar (RLS + açık `seller_id`). */
  async ownedPackagingIdsTx(
    tx: Tx,
    sellerId: string,
    ids: readonly string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const result = await tx.execute<{ id: string }>(
      sql`select id from product_packaging
           where seller_id = ${sellerId}
             and id in (${sql.join(
               ids.map((id) => sql`${id}::uuid`),
               sql`, `,
             )})`,
    );
    return new Set(result.rows.map((row) => row.id));
  }

  /**
   * Fiyat satırlarını yazar. Aynı (liste, ambalaj, an) satırı varsa fiyatı yalnız an henüz
   * geçmemişse güncellenir (K5: geçerli olmuş fiyat değişmez). Yazılan satır sayısı döner.
   */
  async upsertItemsTx(
    tx: Tx,
    rows: readonly (typeof priceListItems.$inferInsert)[],
    now: Date,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const written = await tx
      .insert(priceListItems)
      .values([...rows])
      .onConflictDoUpdate({
        target: [priceListItems.priceListId, priceListItems.packagingId, priceListItems.validFrom],
        set: { unitPrice: sql`excluded.unit_price` },
        setWhere: sql`${priceListItems.validFrom} >= ${now}`,
      })
      .returning({ packagingId: priceListItems.packagingId });
    return written.length;
  }

  /** Listede fiyatı olan ambalaj kimlikleri, imleçten sonra, artan. */
  async packagingPageTx(
    tx: Tx,
    listId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly string[]> {
    const rows = await tx
      .selectDistinct({ packagingId: priceListItems.packagingId })
      .from(priceListItems)
      .where(
        and(
          eq(priceListItems.priceListId, listId),
          cursor === undefined ? undefined : gt(priceListItems.packagingId, cursor),
        ),
      )
      .orderBy(asc(priceListItems.packagingId))
      .limit(limit);
    return rows.map((row) => row.packagingId);
  }

  /**
   * Listelerdeki fiyat satırları: her (liste, ambalaj) için şu an geçerli olan ve ileri tarihli
   * olanlar. Eski geçmiş satırlar dönmez.
   */
  async pricesTx(
    tx: Tx,
    listIds: readonly string[],
    packagingIds: readonly string[],
    now: Date,
  ): Promise<readonly PriceRow[]> {
    if (listIds.length === 0 || packagingIds.length === 0) return [];
    const current = sql`(select max(j.valid_from) from price_list_items j
                          where j.price_list_id = ${priceListItems.priceListId}
                            and j.packaging_id = ${priceListItems.packagingId}
                            and j.valid_from <= ${now})`;
    const rows = await tx
      .select({
        priceListId: priceListItems.priceListId,
        packagingId: priceListItems.packagingId,
        unitPrice: priceListItems.unitPrice,
        validFrom: priceListItems.validFrom,
      })
      .from(priceListItems)
      .where(
        and(
          inArray(priceListItems.priceListId, [...listIds]),
          inArray(priceListItems.packagingId, [...packagingIds]),
          or(gt(priceListItems.validFrom, now), eq(priceListItems.validFrom, current)),
        ),
      )
      .orderBy(asc(priceListItems.packagingId), asc(priceListItems.validFrom));
    return rows;
  }

  /** Açıklama için alıcıyla aktif bağlantı (yoksa undefined → 404). */
  async activeConnectionTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
  ): Promise<ExplainConnection | undefined> {
    const rows = await tx
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
    return rows[0];
  }

  /** Bir ambalajın verilen listelerde, `now` anına kadar geçerli olmuş fiyatları (en yeni önce). */
  async effectiveCandidatesTx(
    tx: Tx,
    listIds: readonly string[],
    packagingId: string,
    now: Date,
  ): Promise<readonly PriceRow[]> {
    if (listIds.length === 0) return [];
    return await tx
      .select({
        priceListId: priceListItems.priceListId,
        packagingId: priceListItems.packagingId,
        unitPrice: priceListItems.unitPrice,
        validFrom: priceListItems.validFrom,
      })
      .from(priceListItems)
      .where(
        and(
          inArray(priceListItems.priceListId, [...listIds]),
          eq(priceListItems.packagingId, packagingId),
          lte(priceListItems.validFrom, now),
        ),
      )
      .orderBy(desc(priceListItems.validFrom));
  }
}
