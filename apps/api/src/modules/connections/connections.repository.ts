// Bağlantı tablolarına erişim (F2.12a). Hepsi çağıranın kiracı işleminde (`withTenantTx`) çalışır;
// P politikası satıcının yalnız kendi satırlarını gösterir, sorgular ayrıca `seller_id`'yi açıkça
// süzer (Mimar notu: ilişki yalnız bağlamdaki satıcının satırlarından hesaplanır).
import { Injectable } from '@nestjs/common';
import type { ConnectionRequestStatus } from '@b2b/shared';
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../core/db';
import type { FileBucket } from '../../core/ports/file-storage';
import { membershipRegions, memberships, roleTemplates, roles } from '../access';
import type { PairState, SalesRepCandidate } from './connection-policy';
import { blocks, connectionRequests, connections } from './connections.schema';

/** DEFINER fonksiyonlarının kimlik sınırı (`connection_buyer_targets`, 22023). */
export const BUYER_TARGETS_MAX = 20;

function uuidArrayLiteral(ids: readonly string[]): string {
  const valid = z.array(z.uuid()).parse(ids);
  return `{${valid.join(',')}}`;
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

/** Süre dolumu işinin döndürdüğü satır (istek × bildirim alıcısı). */
export interface ExpiredRequestRow {
  readonly requestId: string;
  readonly sellerId: string;
  readonly buyerId: string;
  readonly recipientUserId: string | null;
}

/** İstek alabilen perakendeci (onaylı `buyer`, aktif, çağıran değil). */
export interface BuyerTarget {
  readonly id: string;
  readonly legalName: string;
  readonly regionId: string;
  readonly cityId: string;
  /** Bu perakendeci çağıran satıcıyı engellemiş mi? */
  readonly blocked: boolean;
}

interface TargetRow extends Record<string, unknown> {
  id: string;
  legal_name: string;
  region_id: string;
  city_id: string;
  blocked: boolean;
}

export type ConnectionRequestRow = typeof connectionRequests.$inferSelect;
export type ConnectionRow = typeof connections.$inferSelect;
export type NewConnectionRow = typeof connections.$inferInsert;
export type BlockRow = typeof blocks.$inferSelect;

/** `connection_seller_summaries` kimlik sınırı (22023). */
export const SELLER_SUMMARIES_MAX = 50;

/** Perakendecinin gördüğü satıcı özeti (DEFINER; yalnız çağıranla ilişkili satıcılar). */
export interface SellerSummaryRow {
  readonly id: string;
  readonly legalName: string;
  readonly description: Record<string, string> | null;
  readonly logo: { readonly bucket: FileBucket; readonly objectKey: string } | null;
  /** F3.3a (S3 = A): `active` ürünlerin aktif kök kategorileri. */
  readonly categories: readonly { readonly id: string; readonly name: Record<string, string> }[];
}

interface SummaryDbRow extends Record<string, unknown> {
  id: string;
  legal_name: string;
  description: Record<string, string> | null;
  logo_bucket: string | null;
  logo_object_key: string | null;
  categories: { id: string; name: Record<string, string> }[] | null;
}
export type NewConnectionRequestRow = typeof connectionRequests.$inferInsert;

/** Engel dışındaki çift durumu (engel `BuyerTarget.blocked`'tan gelir). */
export type PairHistory = Omit<PairState, 'blocked'>;

const EMPTY_HISTORY: PairHistory = {
  activeConnection: false,
  pendingRequest: false,
  lastRejectedAt: null,
  lastBuyerCancelAt: null,
  lastCancelAt: null,
};

interface RequestAggRow extends Record<string, unknown> {
  buyer_id: string;
  pending: boolean;
  last_rejected_at: Date | string | null;
}

interface ConnectionAggRow extends Record<string, unknown> {
  buyer_id: string;
  active: boolean;
  last_buyer_cancel_at: Date | string | null;
  last_cancel_at: Date | string | null;
}

@Injectable()
export class ConnectionsRepository {
  /**
   * Satıcının istek kotası için işlem sonuna kadar süren kilit (Mimar K5): aynı satıcının
   * eşzamanlı istekleri sırayla sayılır, kota aşılmaz (R23). Farklı satıcılar birbirini beklemez.
   */
  async lockSellerQuotaTx(tx: Tx, sellerId: string): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`connection_requests.quota:${sellerId}`}, 0))`,
    );
  }

  /**
   * Satıcı–alıcı çifti için işlem sonuna kadar süren kilit (Müfettiş 17 M1): istek gönderme ile
   * engel aynı çiftte sıralanır; kilitten sonraki ifadeler commit edilmiş engeli/isteği görür.
   * Sıra her akışta sabit: önce çift, sonra satıcı kotası.
   */
  async lockPairTx(tx: Tx, sellerId: string, buyerId: string): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`connection_pair:${sellerId}:${buyerId}`}, 0))`,
    );
  }

  /** `connection_buyer_targets` (≤20 kimlik); dönmeyen kimlik istek alamaz. */
  async buyerTargetsTx(tx: Tx, ids: readonly string[]): Promise<BuyerTarget[]> {
    if (ids.length === 0) return [];
    const result = await tx.execute<TargetRow>(
      sql`select * from connection_buyer_targets(${uuidArrayLiteral(ids)}::uuid[])`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      regionId: row.region_id,
      cityId: row.city_id,
      blocked: row.blocked,
    }));
  }

  /** Satıcının bu perakendecilerle geçmişi (yalnız kendi satırları). */
  async pairHistoriesTx(
    tx: Tx,
    sellerId: string,
    buyerIds: readonly string[],
  ): Promise<Map<string, PairHistory>> {
    const result = new Map<string, PairHistory>();
    if (buyerIds.length === 0) return result;
    const ids = uuidArrayLiteral(buyerIds);
    const requests = await tx.execute<RequestAggRow>(sql`
      select buyer_id,
             bool_or(status = 'pending') as pending,
             max(responded_at) filter (where status = 'rejected') as last_rejected_at
        from connection_requests
       where seller_id = ${sellerId}::uuid and buyer_id = any(${ids}::uuid[])
       group by buyer_id`);
    const links = await tx.execute<ConnectionAggRow>(sql`
      select buyer_id,
             bool_or(status = 'active') as active,
             max(ended_at) filter (where status = 'cancelled' and ended_by_side = 'buyer')
               as last_buyer_cancel_at,
             max(ended_at) filter (where status = 'cancelled') as last_cancel_at
        from connections
       where seller_id = ${sellerId}::uuid and buyer_id = any(${ids}::uuid[])
       group by buyer_id`);
    for (const id of buyerIds) result.set(id, { ...EMPTY_HISTORY });
    for (const row of requests.rows) {
      const current = result.get(row.buyer_id) ?? { ...EMPTY_HISTORY };
      result.set(row.buyer_id, {
        ...current,
        pendingRequest: row.pending,
        lastRejectedAt: toDate(row.last_rejected_at),
      });
    }
    for (const row of links.rows) {
      const current = result.get(row.buyer_id) ?? { ...EMPTY_HISTORY };
      result.set(row.buyer_id, {
        ...current,
        activeConnection: row.active,
        lastBuyerCancelAt: toDate(row.last_buyer_cancel_at),
        lastCancelAt: toDate(row.last_cancel_at),
      });
    }
    return result;
  }

  /** Satıcının yerel gününde gönderdiği istekler; durumdan bağımsız (geri çekilen dahil, US-022 AC2). */
  async countSentOnTx(tx: Tx, sellerId: string, localDate: string): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.sellerId, sellerId),
          eq(connectionRequests.sellerLocalDate, localDate),
        ),
      );
    return row?.count ?? 0;
  }

  async insertRequestTx(tx: Tx, row: NewConnectionRequestRow): Promise<ConnectionRequestRow> {
    const [inserted] = await tx.insert(connectionRequests).values(row).returning();
    if (inserted === undefined) throw new Error('connection_requests: satır eklenemedi');
    return inserted;
  }

  /** Yeni istek bildiriminin alıcıları: perakendecinin aktif işletme adminleri. */
  async recipientsTx(tx: Tx, requestId: string): Promise<string[]> {
    const result = await tx.execute<{ user_id: string }>(
      sql`select user_id from connection_request_recipients(${requestId}::uuid)`,
    );
    return result.rows.map((row) => row.user_id);
  }

  /** Gönderilen istekler, yeniden eskiye (UUIDv7 kimlik sırası); `sentByUserId` temsilci kapsamı. */
  async listOutgoingTx(
    tx: Tx,
    sellerId: string,
    filter: {
      readonly status?: ConnectionRequestStatus;
      readonly sentByUserId?: string;
      readonly cursor?: string;
      readonly limit: number;
    },
  ): Promise<ConnectionRequestRow[]> {
    const conditions = [eq(connectionRequests.sellerId, sellerId)];
    if (filter.status !== undefined) conditions.push(eq(connectionRequests.status, filter.status));
    if (filter.sentByUserId !== undefined) {
      conditions.push(eq(connectionRequests.sentByUserId, filter.sentByUserId));
    }
    if (filter.cursor !== undefined) conditions.push(lt(connectionRequests.id, filter.cursor));
    return await tx
      .select()
      .from(connectionRequests)
      .where(and(...conditions))
      .orderBy(desc(connectionRequests.id))
      .limit(filter.limit);
  }

  /** Üyenin atandığı bölgeler (temsilci kapsamı); kendi işletmesinin satırı (RLS). */
  async memberRegionIdsTx(tx: Tx, membershipId: string): Promise<string[]> {
    const rows = await tx
      .select({ regionId: membershipRegions.regionId })
      .from(membershipRegions)
      .where(eq(membershipRegions.membershipId, membershipId))
      .orderBy(asc(membershipRegions.regionId));
    return rows.map((row) => row.regionId);
  }

  // ---- F2.13a: yanıt, geri çekme, engel ----

  /** İsteği işlem sonuna kadar kilitler; RLS yalnız iki tarafa gösterir (başkasına `undefined`). */
  async lockRequestTx(tx: Tx, id: string): Promise<ConnectionRequestRow | undefined> {
    const [row] = await tx
      .select()
      .from(connectionRequests)
      .where(eq(connectionRequests.id, id))
      .for('update');
    return row;
  }

  /** Çiftin bekleyen isteği (engel), kilitli. */
  async lockPendingForPairTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
  ): Promise<ConnectionRequestRow | undefined> {
    const [row] = await tx
      .select()
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.sellerId, sellerId),
          eq(connectionRequests.buyerId, buyerId),
          eq(connectionRequests.status, 'pending'),
        ),
      )
      .for('update');
    return row;
  }

  async setRequestStatusTx(
    tx: Tx,
    id: string,
    change: {
      readonly status: ConnectionRequestStatus;
      readonly respondedAt: Date | null;
      readonly respondedByUserId: string | null;
      readonly updatedAt: Date;
    },
  ): Promise<ConnectionRequestRow> {
    const [row] = await tx
      .update(connectionRequests)
      .set(change)
      .where(eq(connectionRequests.id, id))
      .returning();
    if (row === undefined) throw new Error('connection_requests: satır güncellenemedi');
    return row;
  }

  async insertConnectionTx(tx: Tx, row: NewConnectionRow): Promise<ConnectionRow> {
    const [inserted] = await tx.insert(connections).values(row).returning();
    if (inserted === undefined) throw new Error('connections: satır eklenemedi');
    return inserted;
  }

  /** Çiftin aktif bağlantısı, kilitli. */
  async lockActiveConnectionTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
  ): Promise<ConnectionRow | undefined> {
    const [row] = await tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.sellerId, sellerId),
          eq(connections.buyerId, buyerId),
          eq(connections.status, 'active'),
        ),
      )
      .for('update');
    return row;
  }

  async cancelConnectionTx(
    tx: Tx,
    id: string,
    change: {
      readonly endedAt: Date;
      readonly endedBySide: 'seller' | 'buyer';
      readonly endReason: string;
      readonly endedByUserId: string;
    },
  ): Promise<ConnectionRow> {
    const [row] = await tx
      .update(connections)
      .set({ ...change, status: 'cancelled', updatedAt: change.endedAt })
      .where(and(eq(connections.id, id), eq(connections.status, 'active')))
      .returning();
    if (row === undefined) throw new Error('iptal edilecek aktif bağlantı yok (kilit dışı çağrı)');
    return row;
  }

  /**
   * F2.18 (D2 = A): arşivlenen alıcının aktif bağlantılarını kapatır (migrator sahipli DEFINER
   * `business_close_archived_connections`; yalnız platform işleminde, işletme önce `archived`).
   */
  async closeArchivedBuyerConnectionsTx(
    tx: Tx,
    buyerId: string,
    now: Date,
  ): Promise<{ connectionId: string; sellerId: string }[]> {
    const result = await tx.execute<{ connection_id: string; seller_id: string }>(
      sql`select connection_id, seller_id
            from business_close_archived_connections(${buyerId}::uuid, ${now.toISOString()}::timestamptz)
           order by connection_id`,
    );
    return result.rows.map((row) => ({ connectionId: row.connection_id, sellerId: row.seller_id }));
  }

  /**
   * İptal edilmiş bağlantıda karşı tarafın aktif işletme adminleri (`connection_counterpart_admins`,
   * DEFINER, F2.15a): yalnız kullanıcı kimliği.
   */
  async counterpartAdminsTx(tx: Tx, connectionId: string): Promise<string[]> {
    const result = await tx.execute<{ user_id: string }>(
      sql`select user_id from connection_counterpart_admins(${connectionId}::uuid)`,
    );
    return result.rows.map((row) => row.user_id);
  }

  /** Gelen bekleyen ve süresi geçmemiş istekler, yeniden eskiye (UUIDv7 sırası). */
  async listIncomingTx(
    tx: Tx,
    buyerId: string,
    filter: { readonly now: Date; readonly cursor?: string; readonly limit: number },
  ): Promise<ConnectionRequestRow[]> {
    const conditions = [
      eq(connectionRequests.buyerId, buyerId),
      eq(connectionRequests.status, 'pending'),
      gt(connectionRequests.expiresAt, filter.now),
    ];
    if (filter.cursor !== undefined) conditions.push(lt(connectionRequests.id, filter.cursor));
    return await tx
      .select()
      .from(connectionRequests)
      .where(and(...conditions))
      .orderBy(desc(connectionRequests.id))
      .limit(filter.limit);
  }

  /** `connection_seller_summaries`, 50'lik parçalarla; dönmeyen satıcı çağıranla ilişkisiz. */
  async sellerSummariesTx(tx: Tx, ids: readonly string[]): Promise<Map<string, SellerSummaryRow>> {
    const result = new Map<string, SellerSummaryRow>();
    const unique = [...new Set(ids)];
    for (let start = 0; start < unique.length; start += SELLER_SUMMARIES_MAX) {
      const chunk = uuidArrayLiteral(unique.slice(start, start + SELLER_SUMMARIES_MAX));
      const rows = await tx.execute<SummaryDbRow>(
        sql`select * from connection_seller_summaries(${chunk}::uuid[])`,
      );
      for (const row of rows.rows) {
        result.set(row.id, {
          id: row.id,
          legalName: row.legal_name,
          description: row.description,
          logo:
            (row.logo_bucket === 'public' || row.logo_bucket === 'private') &&
            row.logo_object_key !== null
              ? { bucket: row.logo_bucket, objectKey: row.logo_object_key }
              : null,
          categories: (row.categories ?? []).map((category) => ({
            id: category.id,
            name: category.name,
          })),
        });
      }
    }
    return result;
  }

  /**
   * F2.16: süresi dolan en çok `limit` pending isteği `expired` yapar (`connection_requests_expire`,
   * yalnız bağlamsız `withSystemTx` içinde). İstek başına bildirim alıcıları döner; alıcısı
   * olmayan istek `recipientUserId = null` ile bir kez.
   */
  async expireDueRequestsTx(tx: Tx, now: Date, limit: number): Promise<ExpiredRequestRow[]> {
    const result = await tx.execute<{
      request_id: string;
      seller_id: string;
      buyer_id: string;
      recipient_user_id: string | null;
    }>(
      sql`select request_id, seller_id, buyer_id, recipient_user_id
            from connection_requests_expire(${now.toISOString()}::timestamptz, ${limit}::int)`,
    );
    return result.rows.map((row) => ({
      requestId: row.request_id,
      sellerId: row.seller_id,
      buyerId: row.buyer_id,
      recipientUserId: row.recipient_user_id,
    }));
  }

  /** Kabul / red bildiriminin alıcıları: gönderen (aktif üyeyse) + satıcı adminleri. */
  async sellerRecipientsTx(tx: Tx, requestId: string): Promise<string[]> {
    const result = await tx.execute<{ user_id: string }>(
      sql`select user_id from connection_seller_recipients(${requestId}::uuid)`,
    );
    return result.rows.map((row) => row.user_id);
  }

  /** Engel ekler; zaten varsa mevcut satır (`created = false`). */
  async insertBlockTx(
    tx: Tx,
    row: { buyerId: string; sellerId: string; createdByUserId: string; createdAt: Date },
  ): Promise<{ readonly block: BlockRow; readonly created: boolean }> {
    const [inserted] = await tx.insert(blocks).values(row).onConflictDoNothing().returning();
    if (inserted !== undefined) return { block: inserted, created: true };
    const [existing] = await tx
      .select()
      .from(blocks)
      .where(and(eq(blocks.buyerId, row.buyerId), eq(blocks.sellerId, row.sellerId)));
    if (existing === undefined) throw new Error('blocks: satır okunamadı');
    return { block: existing, created: false };
  }

  /** Engeli siler; silindiyse true. */
  async deleteBlockTx(tx: Tx, buyerId: string, sellerId: string): Promise<boolean> {
    const deleted = await tx
      .delete(blocks)
      .where(and(eq(blocks.buyerId, buyerId), eq(blocks.sellerId, sellerId)))
      .returning({ sellerId: blocks.sellerId });
    return deleted.length > 0;
  }

  async listBlocksTx(tx: Tx, buyerId: string): Promise<BlockRow[]> {
    return await tx
      .select()
      .from(blocks)
      .where(eq(blocks.buyerId, buyerId))
      .orderBy(desc(blocks.createdAt), asc(blocks.sellerId));
  }

  // ---- F2.14a: bağlantı listesi ve koşullar ----

  /** Bağlantıyı işlem sonuna kadar kilitler; RLS yalnız iki tarafa gösterir. */
  async lockConnectionTx(tx: Tx, id: string): Promise<ConnectionRow | undefined> {
    const [row] = await tx.select().from(connections).where(eq(connections.id, id)).for('update');
    return row;
  }

  async updateTermsTx(
    tx: Tx,
    id: string,
    change: {
      readonly creditLimit?: string | null;
      readonly paymentTermDays?: number;
      readonly salesRepMembershipId?: string | null;
      readonly termsSetAt: Date;
      readonly termsSetByUserId: string;
    },
  ): Promise<ConnectionRow> {
    const [row] = await tx
      .update(connections)
      .set({ ...change, updatedAt: change.termsSetAt })
      .where(eq(connections.id, id))
      .returning();
    if (row === undefined) throw new Error('connections: koşul güncellenemedi');
    return row;
  }

  /** Temsilci adayı üyelik; `memberships` T politikası yalnız çağıranın işletmesini gösterir. */
  async salesRepCandidateTx(tx: Tx, membershipId: string): Promise<SalesRepCandidate | undefined> {
    const [row] = await tx
      .select({
        businessId: memberships.businessId,
        status: memberships.status,
        roleTemplateCode: roleTemplates.code,
      })
      .from(memberships)
      .innerJoin(
        roles,
        and(eq(roles.id, memberships.roleId), eq(roles.businessId, memberships.businessId)),
      )
      .leftJoin(roleTemplates, eq(roleTemplates.id, roles.sourceTemplateId))
      .where(eq(memberships.id, membershipId));
    return row;
  }

  /** Verilen üyeliklerden aktif olanlar (öneri temsilcisi süzgeci). */
  async activeMembershipIdsTx(tx: Tx, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(inArray(memberships.id, [...ids]), eq(memberships.status, 'active')));
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Bağlantılar, yeniden eskiye (UUIDv7 sırası); `side` çağıranın tarafı. Her satırla isteğin
   * önerilen vadesi (koşul önerisi, F2.14a K4).
   */
  async listConnectionsTx(
    tx: Tx,
    filter: {
      readonly side: 'seller' | 'buyer';
      readonly businessId: string;
      readonly status?: 'active' | 'cancelled';
      readonly salesRepMembershipId?: string;
      readonly cursor?: string;
      readonly limit: number;
    },
  ): Promise<{ connection: ConnectionRow; proposedPaymentTermDays: number | null }[]> {
    const conditions = [
      filter.side === 'seller'
        ? eq(connections.sellerId, filter.businessId)
        : eq(connections.buyerId, filter.businessId),
    ];
    if (filter.status !== undefined) conditions.push(eq(connections.status, filter.status));
    if (filter.salesRepMembershipId !== undefined) {
      conditions.push(eq(connections.salesRepMembershipId, filter.salesRepMembershipId));
    }
    if (filter.cursor !== undefined) conditions.push(lt(connections.id, filter.cursor));
    return await tx
      .select({
        connection: connections,
        proposedPaymentTermDays: connectionRequests.proposedPaymentTermDays,
      })
      .from(connections)
      .innerJoin(connectionRequests, eq(connectionRequests.id, connections.requestId))
      .where(and(...conditions))
      .orderBy(desc(connections.id))
      .limit(filter.limit);
  }

  /**
   * Satıcının bu alıcılarla son iptal edilmiş ve koşulu atanmış bağlantısı (US-024 AC3), alıcı
   * başına bir satır.
   */
  async previousTermsTx(
    tx: Tx,
    sellerId: string,
    buyerIds: readonly string[],
  ): Promise<Map<string, ConnectionRow>> {
    const result = new Map<string, ConnectionRow>();
    if (buyerIds.length === 0) return result;
    const rows = await tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.sellerId, sellerId),
          inArray(connections.buyerId, [...buyerIds]),
          eq(connections.status, 'cancelled'),
          isNotNull(connections.termsSetAt),
        ),
      )
      .orderBy(desc(connections.endedAt), desc(connections.id));
    for (const row of rows) {
      if (!result.has(row.buyerId)) result.set(row.buyerId, row);
    }
    return result;
  }
}
