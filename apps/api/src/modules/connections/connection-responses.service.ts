// Perakendecinin isteğe yanıtı ve engel listesi (F2.13a; US-023, SF-03, state-machines §1–2, R19).
// Hepsi alıcı kiracı işleminde (`withTenantTx`). İstek ve bağlantı satırları P politikasıyla
// yalnız iki tarafa görünür; satıcının profil özeti yalnız `connection_seller_summaries`
// (DEFINER) ile okunur. Kilit sırası her akışta aynı: önce istek, sonra bağlantı.
import { Inject, Injectable } from '@nestjs/common';
import type {
  BlockedSeller,
  BlockedSellerList,
  ConnectionSellerSummary,
  ConnectionView,
  IncomingConnectionRequestPage,
  IncomingConnectionRequestsQuery,
} from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { FilesService } from '../files';
import { INITIAL_PAYMENT_TERM_DAYS } from './connection-policy';
import { ConnectionRequestStateMachine } from './connection-request.state-machine';
import { toRequestView } from './connection-requests.service';
import { toConnectionView } from './connection-view';
import {
  type ConnectionRequestRow,
  ConnectionsRepository,
  type SellerSummaryRow,
} from './connections.repository';

const ACTIVE_PAIR_CONSTRAINT = 'connections_active_pair_uq';
/** Engelin kapattığı bağlantının bitiş nedeni (Mimar K6). */
const BLOCK_END_REASON = 'blocked';

function isActivePairViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === ACTIVE_PAIR_CONSTRAINT
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

@Injectable()
export class ConnectionResponsesService {
  constructor(
    @Inject(ConnectionsRepository) private readonly repository: ConnectionsRepository,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /**
   * `GET /api/v1/connection-requests/incoming` (US-023 AC1, AC6; US-022 AC1): yalnız bekleyen ve
   * süresi geçmemiş istekler; her satırda satıcı özeti, mesaj ve önerilen vade.
   */
  async incoming(
    tenant: TenantContext,
    query: IncomingConnectionRequestsQuery,
  ): Promise<IncomingConnectionRequestPage> {
    const now = this.clock.now();
    const page = await withTenantTx(tenant, async (tx) => {
      const rows = await this.repository.listIncomingTx(tx, tenant.businessId, {
        now,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit + 1,
      });
      const items = rows.slice(0, query.limit);
      const summaries = await this.repository.sellerSummariesTx(
        tx,
        items.map((row) => row.sellerId),
      );
      return { rows, items, summaries };
    });
    const last = page.items.at(-1);
    const items = [];
    for (const row of page.items) {
      const summary = page.summaries.get(row.sellerId);
      // İsteği olan satıcı her zaman ilişkilidir; dönmüyorsa (yarış) satır atlanır.
      if (summary === undefined) continue;
      items.push({ ...toRequestView(row), seller: await this.summaryView(tenant, summary) });
    }
    return {
      items,
      nextCursor: page.rows.length > query.limit && last !== undefined ? last.id : null,
    };
  }

  /** `POST …/{id}/accept` (US-023 AC2, SF-03): istek `accepted`, yeni `active` bağlantı. */
  async accept(
    tenant: TenantContext,
    requestId: string,
    context: AuditRequestContext,
  ): Promise<ConnectionView> {
    try {
      return await withTenantTx(tenant, async (tx) => {
        const now = this.clock.now();
        const request = await this.ownIncomingTx(tx, tenant, requestId);
        ConnectionRequestStateMachine.assertRespondable(
          request.status as ConnectionStatusLike,
          request.expiresAt,
          now,
        );
        const summary = (await this.repository.sellerSummariesTx(tx, [request.sellerId])).get(
          request.sellerId,
        );
        if (summary === undefined) throw new Error('isteğin satıcısı okunamadı');

        await this.repository.setRequestStatusTx(tx, request.id, {
          status: 'accepted',
          respondedAt: now,
          respondedByUserId: tenant.userId,
          updatedAt: now,
        });
        const connection = await this.repository.insertConnectionTx(tx, {
          id: this.ids.next(),
          sellerId: request.sellerId,
          buyerId: request.buyerId,
          requestId: request.id,
          status: 'active',
          paymentTermDays: INITIAL_PAYMENT_TERM_DAYS,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        // US-023 AC2: veri paylaşım uyarısı onaylandı (Mimar K5).
        await this.audit.record(tx, {
          actor: { type: 'user', userId: tenant.userId },
          businessId: tenant.businessId,
          action: 'connection.accepted',
          targetType: 'connection',
          targetId: connection.id,
          after: {
            requestId: request.id,
            sellerId: request.sellerId,
            confirmDataSharing: true,
            paymentTermDays: connection.paymentTermDays,
          },
          context,
        });
        for (const userId of await this.repository.sellerRecipientsTx(tx, request.id)) {
          await this.outbox.write(tx, {
            type: 'connection.accepted',
            aggregateType: 'connection_request',
            aggregateId: request.id,
            businessIds: [request.sellerId, request.buyerId],
            payload: {
              requestId: request.id,
              connectionId: connection.id,
              sellerId: request.sellerId,
              buyerId: request.buyerId,
              userId,
            },
          });
        }
        return toConnectionView(connection, 'buyer', summary.legalName);
      });
    } catch (error) {
      if (isActivePairViolation(error)) throw new DomainError('CONNECTION_ALREADY_ACTIVE');
      throw error;
    }
  }

  /** `POST …/{id}/reject` (US-023 AC3): istek `rejected`; bekleme süresi `responded_at`'ten. */
  async reject(tenant: TenantContext, requestId: string) {
    return await withTenantTx(tenant, async (tx) => {
      const request = await this.ownIncomingTx(tx, tenant, requestId);
      // Müfettiş 17 L1: süresi geçmiş istek reddedilmez (bekleme süresi başlatmaz); kabulle aynı.
      ConnectionRequestStateMachine.assertRespondable(
        request.status as ConnectionStatusLike,
        request.expiresAt,
        this.clock.now(),
        'rejected',
      );
      const rejected = await this.rejectTx(tx, tenant, request);
      return toRequestView(rejected);
    });
  }

  /**
   * `POST /api/v1/blocks` (US-023 AC4): engel + çiftin bekleyen isteği `rejected` + aktif
   * bağlantısı `cancelled` (`ended_by_side = buyer`) tek işlemde. Yalnız çağıranla ilişkisi
   * (istek, bağlantı, engel) olan satıcı; değilse `404` (Mimar K2). Tekrar çağrı aynı sonucu verir.
   */
  async block(
    tenant: TenantContext,
    sellerId: string,
    context: AuditRequestContext,
  ): Promise<BlockedSeller> {
    const result = await withTenantTx(tenant, async (tx) => {
      const now = this.clock.now();
      const buyerId = tenant.businessId;
      // Müfettiş 17 M1: istek gönderme ile aynı çift kilidi (bekleyen isteği okumadan önce).
      await this.repository.lockPairTx(tx, sellerId, buyerId);
      const summary = (await this.repository.sellerSummariesTx(tx, [sellerId])).get(sellerId);
      if (summary === undefined) throw new DomainError('NOT_FOUND');

      const pending = await this.repository.lockPendingForPairTx(tx, sellerId, buyerId);
      if (pending !== undefined) await this.rejectTx(tx, tenant, pending);

      const active = await this.repository.lockActiveConnectionTx(tx, sellerId, buyerId);
      if (active !== undefined) {
        await this.repository.cancelConnectionTx(tx, active.id, {
          endedAt: now,
          endedBySide: 'buyer',
          endReason: BLOCK_END_REASON,
          endedByUserId: tenant.userId,
        });
        await this.outbox.write(tx, {
          type: 'connection.cancelled',
          aggregateType: 'connection',
          aggregateId: active.id,
          businessIds: [sellerId, buyerId],
          payload: { connectionId: active.id, sellerId, buyerId, endedBySide: 'buyer' },
        });
      }

      const { block, created } = await this.repository.insertBlockTx(tx, {
        buyerId,
        sellerId,
        createdByUserId: tenant.userId,
        createdAt: now,
      });
      if (created) {
        await this.audit.record(tx, {
          actor: { type: 'user', userId: tenant.userId },
          businessId: buyerId,
          action: 'block.created',
          targetType: 'block',
          targetId: sellerId,
          after: {
            rejectedRequestId: pending?.id ?? null,
            cancelledConnectionId: active?.id ?? null,
          },
          context,
        });
      }
      return { block, summary };
    });
    return await this.blockedView(tenant, result.block, result.summary);
  }

  /** `DELETE /api/v1/blocks/{sellerId}` (US-023 AC5): engel yoksa da `204` (idempotent). */
  async unblock(
    tenant: TenantContext,
    sellerId: string,
    context: AuditRequestContext,
  ): Promise<void> {
    await withTenantTx(tenant, async (tx) => {
      if (await this.repository.deleteBlockTx(tx, tenant.businessId, sellerId)) {
        await this.audit.record(tx, {
          actor: { type: 'user', userId: tenant.userId },
          businessId: tenant.businessId,
          action: 'block.deleted',
          targetType: 'block',
          targetId: sellerId,
          context,
        });
      }
    });
  }

  /** `GET /api/v1/blocks`: engellenen toptancılar, yeniden eskiye. */
  async blocks(tenant: TenantContext): Promise<BlockedSellerList> {
    const { rows, summaries } = await withTenantTx(tenant, async (tx) => {
      const list = await this.repository.listBlocksTx(tx, tenant.businessId);
      return {
        rows: list,
        summaries: await this.repository.sellerSummariesTx(
          tx,
          list.map((row) => row.sellerId),
        ),
      };
    });
    const items: BlockedSeller[] = [];
    for (const row of rows) {
      const summary = summaries.get(row.sellerId);
      if (summary !== undefined) items.push(await this.blockedView(tenant, row, summary));
    }
    return { items };
  }

  /** Çağıran alıcının isteği (kilitli); değilse `404` (satıcı kendi isteğine yanıt veremez). */
  private async ownIncomingTx(
    tx: Tx,
    tenant: TenantContext,
    requestId: string,
  ): Promise<ConnectionRequestRow> {
    const request = await this.repository.lockRequestTx(tx, requestId);
    if (request?.buyerId !== tenant.businessId) throw new DomainError('NOT_FOUND');
    return request;
  }

  /** `pending → rejected` + satıcı tarafına bildirim olayı (red ve engel ortak). */
  private async rejectTx(
    tx: Tx,
    tenant: TenantContext,
    request: ConnectionRequestRow,
  ): Promise<ConnectionRequestRow> {
    ConnectionRequestStateMachine.assertTransition(
      request.status as ConnectionStatusLike,
      'rejected',
    );
    const now = this.clock.now();
    const rejected = await this.repository.setRequestStatusTx(tx, request.id, {
      status: 'rejected',
      respondedAt: now,
      respondedByUserId: tenant.userId,
      updatedAt: now,
    });
    for (const userId of await this.repository.sellerRecipientsTx(tx, request.id)) {
      await this.outbox.write(tx, {
        type: 'connection.rejected',
        aggregateType: 'connection_request',
        aggregateId: request.id,
        businessIds: [request.sellerId, request.buyerId],
        payload: {
          requestId: request.id,
          sellerId: request.sellerId,
          buyerId: request.buyerId,
          userId,
        },
      });
    }
    return rejected;
  }

  private async summaryView(
    tenant: TenantContext,
    summary: SellerSummaryRow,
  ): Promise<ConnectionSellerSummary> {
    return {
      id: summary.id,
      name: summary.legalName,
      logoUrl:
        summary.logo === null
          ? null
          : await this.files.objectReadUrl(summary.logo, tenant.businessId),
      description: summary.description,
    };
  }

  private async blockedView(
    tenant: TenantContext,
    row: { readonly sellerId: string; readonly createdAt: Date },
    summary: SellerSummaryRow,
  ): Promise<BlockedSeller> {
    const view = await this.summaryView(tenant, summary);
    return {
      sellerId: row.sellerId,
      sellerName: view.name,
      logoUrl: view.logoUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

type ConnectionStatusLike = Parameters<typeof ConnectionRequestStateMachine.canTransition>[0];
