// Bağlantı isteği gönderme ve gönderilenler listesi (F2.12a; US-021, SF-03, R23).
// Akış (tek kiracı işlemi): abonelik salt-okunur değil → hedef perakendeci (DEFINER, temsilci
// bölgesi) → satıcı kota kilidi → çift geçmişi + bugünkü sayı → ConnectionPolicy → ekle →
// alıcı adminlerine outbox olayı (bildirim). Ayarlar işlemden önce okunur (havuz tek bağlantı).
import { Inject, Injectable } from '@nestjs/common';
import type {
  ConnectionRequestCreate,
  ConnectionRequestView,
  OutgoingConnectionRequestPage,
  OutgoingConnectionRequestsQuery,
} from '@b2b/shared';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import { inRegionGroups } from '../../core/ports/buyer-directory-index';
import type { TenantContext } from '../../core/tenant-context';
import { EntitlementService, localDate, PlanService } from '../billing';
import { BusinessesRepository } from '../businesses';
import { SettingsService } from '../settings';
import { canRequest, type CooldownSettings, effectiveDailyQuota } from './connection-policy';
import { ConnectionRequestStateMachine } from './connection-request.state-machine';
import {
  BUYER_TARGETS_MAX,
  type BuyerTarget,
  type ConnectionRequestRow,
  ConnectionsRepository,
} from './connections.repository';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PENDING_PAIR_CONSTRAINT = 'connection_requests_pending_pair_uq';

/** Bekleyen çift kısmi benzersiz indeksi (eşzamanlı aynı çift, SF-03 hata tablosu). */
function isPendingPairViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === PENDING_PAIR_CONSTRAINT
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export function toRequestView(row: ConnectionRequestRow): ConnectionRequestView {
  return {
    id: row.id,
    sellerId: row.sellerId,
    buyerId: row.buyerId,
    status: row.status as ConnectionRequestView['status'],
    message: row.message,
    proposedPaymentTermDays: row.proposedPaymentTermDays,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ConnectionRequestsService {
  constructor(
    @Inject(ConnectionsRepository) private readonly repository: ConnectionsRepository,
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** Bekleme süreleri satıcı kapsamında: işletme → plan → platform (US-017 AC1, Mimar K6). */
  async cooldownSettings(sellerId: string): Promise<CooldownSettings> {
    const [afterRejectDays, afterBuyerCancelDays] = await Promise.all([
      this.settings.get('connection.cooldown_after_reject_days', sellerId),
      this.settings.get('connection.cooldown_after_buyer_cancel_days', sellerId),
    ]);
    return { afterRejectDays, afterBuyerCancelDays };
  }

  /** US-021: `POST /api/v1/connection-requests`. */
  async send(
    tenant: TenantContext,
    input: ConnectionRequestCreate,
  ): Promise<ConnectionRequestView> {
    const sellerId = tenant.businessId;
    const [cooldown, ttlDays, quotaSetting] = await Promise.all([
      this.cooldownSettings(sellerId),
      this.settings.get('connection.request_ttl_days', sellerId),
      this.settings.get('connection.daily_request_quota', sellerId),
    ]);
    try {
      return await withTenantTx(tenant, async (tx) => {
        // US-055 AC4 / SF-03: salt-okunur abonelik yeni istek gönderemez.
        if (await this.plans.isReadOnlyTx(tx, sellerId)) {
          throw new DomainError('SUBSCRIPTION_READ_ONLY');
        }
        // Müfettiş 17 M1: engel ile yarış; çift kilidi engel okunmadan önce, kotadan önce.
        await this.repository.lockPairTx(tx, sellerId, input.buyerId);
        const target = await this.targetTx(tx, tenant, input.buyerId);

        await this.repository.lockSellerQuotaTx(tx, sellerId);
        const now = this.clock.now();
        const seller = await this.businesses.lockOwnTx(tx, sellerId, false);
        if (seller === undefined) throw new DomainError('NOT_FOUND');
        const today = localDate(now, seller.timezone);
        const entitlement = await this.entitlements.limitOf(
          'connection_requests.daily',
          sellerId,
          tx,
        );
        if (entitlement === undefined) {
          throw new DomainError('ENTITLEMENT_LIMIT_REACHED', { key: 'connection_requests.daily' });
        }
        const history = (await this.repository.pairHistoriesTx(tx, sellerId, [target.id])).get(
          target.id,
        );
        if (history === undefined) throw new Error('çift geçmişi okunamadı');

        const decision = canRequest({
          pair: { ...history, blocked: target.blocked },
          cooldown,
          quota: {
            sentToday: await this.repository.countSentOnTx(tx, sellerId, today),
            dailyQuota: effectiveDailyQuota(quotaSetting, entitlement),
            timeZone: seller.timezone,
          },
          now,
        });
        if (!decision.ok) throw new DomainError(decision.code, decision.details);

        const row = await this.repository.insertRequestTx(tx, {
          id: this.ids.next(),
          sellerId,
          buyerId: target.id,
          sentByUserId: tenant.userId,
          message: input.message ?? null,
          proposedPaymentTermDays: input.proposedPaymentTermDays ?? null,
          status: 'pending',
          expiresAt: new Date(now.getTime() + ttlDays * MS_PER_DAY),
          sellerLocalDate: today,
          createdAt: now,
          updatedAt: now,
        });
        // US-021 AC1, US-054: perakendecinin her aktif adminine bir olay (dili alıcıda çözülür).
        for (const userId of await this.repository.recipientsTx(tx, row.id)) {
          await this.outbox.write(tx, {
            type: 'connection.request_created',
            aggregateType: 'connection_request',
            aggregateId: row.id,
            businessIds: [sellerId, target.id],
            payload: { requestId: row.id, sellerId, buyerId: target.id, userId },
          });
        }
        return toRequestView(row);
      });
    } catch (error) {
      if (isPendingPairViolation(error)) {
        throw new DomainError('CONNECTION_REQUEST_ALREADY_PENDING');
      }
      throw error;
    }
  }

  /**
   * `POST /api/v1/connection-requests/{id}/withdraw` (US-022 AC1): satıcı bekleyen isteğini geri
   * çeker; olay yok (state-machines §1). Temsilci (`assigned`) yalnız kendi gönderdiğini çeker;
   * başkasınınki ve alıcının isteği `404`. Kota iadesi yok (US-022 AC2).
   */
  async withdraw(tenant: TenantContext, requestId: string): Promise<ConnectionRequestView> {
    return await withTenantTx(tenant, async (tx) => {
      const request = await this.repository.lockRequestTx(tx, requestId);
      const assigned = tenant.permissions.get('connections.request.send') === 'assigned';
      if (
        request?.sellerId !== tenant.businessId ||
        (assigned && request.sentByUserId !== tenant.userId)
      ) {
        throw new DomainError('NOT_FOUND');
      }
      ConnectionRequestStateMachine.assertTransition(
        request.status as ConnectionRequestView['status'],
        'withdrawn',
      );
      const withdrawn = await this.repository.setRequestStatusTx(tx, request.id, {
        status: 'withdrawn',
        respondedAt: null,
        respondedByUserId: null,
        updatedAt: this.clock.now(),
      });
      return toRequestView(withdrawn);
    });
  }

  /**
   * İstek alabilir perakendeci (Mimar K3): yoksa, askıda/arşivde, `buyer` onaysız veya çağıranın
   * kendisiyse `404`. Temsilci (`assigned`) yalnız atandığı bölgedekine gönderir (Mimar K2);
   * bölge dışı da `404` (varlığı sızmaz).
   */
  private async targetTx(tx: Tx, tenant: TenantContext, buyerId: string): Promise<BuyerTarget> {
    const [target] = await this.repository.buyerTargetsTx(tx, [buyerId]);
    if (target === undefined) throw new DomainError('NOT_FOUND');
    if (tenant.permissions.get('connections.request.send') === 'assigned') {
      const regions = await this.repository.memberRegionIdsTx(tx, tenant.membershipId);
      if (!inRegionGroups(target, [regions])) throw new DomainError('NOT_FOUND');
    }
    return target;
  }

  /**
   * `GET /api/v1/connection-requests/outgoing`. Temsilci (`assigned`) yalnız kendi gönderdiklerini
   * görür (VARSAYIM). Ünvan DEFINER fonksiyonundan; perakendeci artık istek alamıyorsa `null`.
   */
  async outgoing(
    tenant: TenantContext,
    query: OutgoingConnectionRequestsQuery,
  ): Promise<OutgoingConnectionRequestPage> {
    return await withTenantTx(tenant, async (tx) => {
      const assigned = tenant.permissions.get('connections.request.send') === 'assigned';
      const rows = await this.repository.listOutgoingTx(tx, tenant.businessId, {
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(assigned ? { sentByUserId: tenant.userId } : {}),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const buyerIds = [...new Set(page.map((row) => row.buyerId))];
      const names = new Map<string, string>();
      for (let start = 0; start < buyerIds.length; start += BUYER_TARGETS_MAX) {
        const chunk = buyerIds.slice(start, start + BUYER_TARGETS_MAX);
        for (const target of await this.repository.buyerTargetsTx(tx, chunk)) {
          names.set(target.id, target.legalName);
        }
      }
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          ...toRequestView(row),
          buyerName: names.get(row.buyerId) ?? null,
        })),
        nextCursor: rows.length > query.limit && last !== undefined ? last.id : null,
      };
    });
  }
}
