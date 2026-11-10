// Bağlantı tablolarına erişim (F2.12a). Hepsi çağıranın kiracı işleminde (`withTenantTx`) çalışır;
// P politikası satıcının yalnız kendi satırlarını gösterir, sorgular ayrıca `seller_id`'yi açıkça
// süzer (Mimar notu: ilişki yalnız bağlamdaki satıcının satırlarından hesaplanır).
import { Injectable } from '@nestjs/common';
import type { ConnectionRequestStatus } from '@b2b/shared';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../core/db';
import { membershipRegions } from '../access';
import type { PairState } from './connection-policy';
import { connectionRequests } from './connections.schema';

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
}
