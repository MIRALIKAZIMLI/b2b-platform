// Bağlantı listesi ve koşullar (F2.14a; US-024, SF-03 son adım). Hepsi çağıranın kiracı işleminde
// (`withTenantTx`); `connections` P politikası yalnız iki tarafa gösterir. Koşulları yalnız satıcı
// değiştirir (izin `connections.terms.manage`, yalnız `all` kapsam; `0024` bekçisi ikinci savunma).
import { Inject, Injectable } from '@nestjs/common';
import type {
  ConnectionPage,
  ConnectionsQuery,
  ConnectionTermsSuggestion,
  ConnectionTermsUpdate,
  ConnectionView,
} from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { fromDecimalString, LINE_TOTAL_SCALE, toDecimalString } from '../../core/money';
import type { TenantContext } from '../../core/tenant-context';
import { isAssignableSalesRep } from './connection-policy';
import { type ConnectionSide, toConnectionView } from './connection-view';
import {
  BUYER_TARGETS_MAX,
  type ConnectionRow,
  ConnectionsRepository,
} from './connections.repository';

function termsSnapshot(row: ConnectionRow) {
  return {
    creditLimit: row.creditLimit,
    paymentTermDays: row.paymentTermDays,
    salesRepMembershipId: row.salesRepMembershipId,
  };
}

@Injectable()
export class ConnectionTermsService {
  constructor(
    @Inject(ConnectionsRepository) private readonly repository: ConnectionsRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /**
   * `GET /api/v1/connections`: satıcı veya alıcı bakışı (işletmenin yeteneği). Satıcıda `assigned`
   * kapsamlı üye (temsilci) yalnız kendisine atanmış bağlantıları görür (F2.14a K5).
   */
  async list(tenant: TenantContext, query: ConnectionsQuery): Promise<ConnectionPage> {
    const side: ConnectionSide = tenant.capabilities.includes('seller') ? 'seller' : 'buyer';
    const assigned = side === 'seller' && tenant.permissions.get('connections.view') === 'assigned';
    return await withTenantTx(tenant, async (tx) => {
      const rows = await this.repository.listConnectionsTx(tx, {
        side,
        businessId: tenant.businessId,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(assigned ? { salesRepMembershipId: tenant.membershipId } : {}),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const connections = page.map((row) => row.connection);
      const names = await this.counterpartyNamesTx(tx, side, connections);
      const suggestions =
        side === 'seller'
          ? await this.suggestionsTx(tx, tenant.businessId, page)
          : new Map<string, ConnectionTermsSuggestion | null>();
      const last = page.at(-1);
      return {
        items: connections.map((row) =>
          toConnectionView(
            row,
            side,
            names.get(side === 'seller' ? row.buyerId : row.sellerId) ?? null,
            side === 'seller' ? (suggestions.get(row.id) ?? null) : undefined,
          ),
        ),
        nextCursor: rows.length > query.limit && last !== undefined ? last.connection.id : null,
      };
    });
  }

  /**
   * `PATCH /api/v1/connections/{id}/terms` (US-024 AC2): kısmi güncelleme, satır kilidiyle.
   * Başkasının bağlantısı `404`; iptal edilmiş bağlantı `409 INVALID_STATE_TRANSITION`; temsilci
   * satıcının aktif üyesi değilse `422`. Audit `connection.terms_updated` (önce/sonra).
   */
  async updateTerms(
    tenant: TenantContext,
    connectionId: string,
    input: ConnectionTermsUpdate,
    context: AuditRequestContext,
  ): Promise<ConnectionView> {
    return await withTenantTx(tenant, async (tx) => {
      const row = await this.repository.lockConnectionTx(tx, connectionId);
      if (row?.sellerId !== tenant.businessId) throw new DomainError('NOT_FOUND');
      if (row.status !== 'active') throw new DomainError('INVALID_STATE_TRANSITION');
      if (
        input.salesRepMembershipId !== undefined &&
        input.salesRepMembershipId !== null &&
        input.salesRepMembershipId !== row.salesRepMembershipId &&
        !isAssignableSalesRep(
          await this.repository.salesRepCandidateTx(tx, input.salesRepMembershipId),
          tenant.businessId,
        )
      ) {
        throw new DomainError('VALIDATION_FAILED', { salesRepMembershipId: ['invalid_sales_rep'] });
      }

      const now = this.clock.now();
      const updated = await this.repository.updateTermsTx(tx, row.id, {
        ...(input.creditLimit === undefined
          ? {}
          : {
              creditLimit:
                input.creditLimit === null
                  ? null
                  : toDecimalString(fromDecimalString(input.creditLimit), LINE_TOTAL_SCALE),
            }),
        ...(input.paymentTermDays === undefined ? {} : { paymentTermDays: input.paymentTermDays }),
        ...(input.salesRepMembershipId === undefined
          ? {}
          : { salesRepMembershipId: input.salesRepMembershipId }),
        termsSetAt: now,
        termsSetByUserId: tenant.userId,
      });
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'connection.terms_updated',
        targetType: 'connection',
        targetId: row.id,
        before: termsSnapshot(row),
        after: termsSnapshot(updated),
        context,
      });
      const names = await this.counterpartyNamesTx(tx, 'seller', [updated]);
      return toConnectionView(updated, 'seller', names.get(updated.buyerId) ?? null, null);
    });
  }

  /** Karşı taraf ünvanları: satıcıya `connection_buyer_targets`, alıcıya `connection_seller_summaries`. */
  private async counterpartyNamesTx(
    tx: Tx,
    side: ConnectionSide,
    rows: readonly ConnectionRow[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (side === 'buyer') {
      const summaries = await this.repository.sellerSummariesTx(tx, [
        ...new Set(rows.map((row) => row.sellerId)),
      ]);
      for (const [id, summary] of summaries) names.set(id, summary.legalName);
      return names;
    }
    const buyerIds = [...new Set(rows.map((row) => row.buyerId))];
    for (let start = 0; start < buyerIds.length; start += BUYER_TARGETS_MAX) {
      const chunk = buyerIds.slice(start, start + BUYER_TARGETS_MAX);
      for (const target of await this.repository.buyerTargetsTx(tx, chunk)) {
        names.set(target.id, target.legalName);
      }
    }
    return names;
  }

  /**
   * Koşulu atanmamış aktif bağlantılar için öneri (F2.14a K4): önceki dönemin atanmış koşulları
   * (US-024 AC3), yoksa isteğin önerilen vadesi. Önceki temsilci artık aktif üye değilse null.
   */
  private async suggestionsTx(
    tx: Tx,
    sellerId: string,
    page: readonly { connection: ConnectionRow; proposedPaymentTermDays: number | null }[],
  ): Promise<Map<string, ConnectionTermsSuggestion | null>> {
    const open = page.filter(
      (row) => row.connection.status === 'active' && row.connection.termsSetAt === null,
    );
    const previous = await this.repository.previousTermsTx(
      tx,
      sellerId,
      open.map((row) => row.connection.buyerId),
    );
    const activeReps = await this.repository.activeMembershipIdsTx(
      tx,
      [...previous.values()].flatMap((row) =>
        row.salesRepMembershipId === null ? [] : [row.salesRepMembershipId],
      ),
    );
    const result = new Map<string, ConnectionTermsSuggestion | null>();
    for (const { connection, proposedPaymentTermDays } of open) {
      const prior = previous.get(connection.buyerId);
      if (prior !== undefined) {
        result.set(connection.id, {
          source: 'previous_connection',
          creditLimit: prior.creditLimit,
          paymentTermDays: prior.paymentTermDays,
          salesRepMembershipId:
            prior.salesRepMembershipId !== null && activeReps.has(prior.salesRepMembershipId)
              ? prior.salesRepMembershipId
              : null,
        });
      } else if (proposedPaymentTermDays !== null) {
        result.set(connection.id, {
          source: 'request',
          creditLimit: null,
          paymentTermDays: proposedPaymentTermDays,
          salesRepMembershipId: null,
        });
      }
    }
    return result;
  }
}
