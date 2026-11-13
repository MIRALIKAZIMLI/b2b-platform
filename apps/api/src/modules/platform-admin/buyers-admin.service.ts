// Platform admininin perakendeci yönetimi (F2.18; US-015 moderasyon, US-016 askıya alma ve "sil").
// Her işlem tek `withPlatformTx`; işletme satırı `FOR UPDATE` ile kilitlenir. Durum geçişleri
// `BusinessStateMachine` ile (state-machines §9). Erişim engeli (askı/arşiv) `AccessGuard`'da her
// istekte DB'den okunur (`403 BUSINESS_SUSPENDED`); bağlantı ve açık istekler askıda değişmez
// (US-016 AC1). Dizin olay ile yenilenir (`buyer.profile_changed`; askıda/arşivde indeksten düşer).
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BusinessStatusActionInput, BuyerAdminFilter, VoenDecision } from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withPlatformTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { OutboxWriter } from '../../core/outbox';
import { FileStorage } from '../../core/ports/file-storage';
import { InvitationService } from '../access';
import {
  BusinessStateMachine,
  type BusinessStatus,
  BuyerAdminRepository,
  type BuyerAdminRow,
} from '../businesses';
import { BuyerArchiveService } from './buyer-archive.service';
import type { PlatformActor } from './sellers.service';

export interface BuyerAdminView {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string | null;
  readonly legalType: string | null;
  readonly regionId: string;
  readonly status: BusinessStatus;
  readonly verifiedAt: string | null;
  readonly profileCompleteness: number;
  readonly createdAt: string;
}

export interface BusinessStatusResult {
  readonly id: string;
  /** `deleted`: kayıt kalıcı silindi (US-016 AC3); diğerlerinde yeni durum. */
  readonly outcome: 'updated' | 'archived' | 'deleted';
  readonly status: BusinessStatus | null;
}

function toView(row: BuyerAdminRow): BuyerAdminView {
  return {
    id: row.id,
    legalName: row.legalName,
    voen: row.voen,
    legalType: row.legalType,
    regionId: row.regionId,
    status: row.status,
    verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
    profileCompleteness: row.profileCompleteness,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class BuyersAdminService {
  constructor(
    @Inject(BuyerAdminRepository) private readonly buyers: BuyerAdminRepository,
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(BuyerArchiveService) private readonly archiver: BuyerArchiveService,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: Pick<FileStorage, 'delete'>,
  ) {}

  private readonly log = new Logger(BuyersAdminService.name);

  /** openapi `GET /admin/buyers` (US-015 AC1 kuyruk: `voen_pending`). */
  async list(
    actor: PlatformActor,
    filter: BuyerAdminFilter,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: BuyerAdminView[]; nextCursor: string | null }> {
    return await withPlatformTx(actor, async (tx) => {
      const rows = await this.buyers.listTx(tx, filter, cursor, limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toView),
        nextCursor: rows.length > limit && last !== undefined ? last.id : null,
      };
    });
  }

  /** openapi `GET /admin/buyers/{id}` (US-015 AC1 kayıt ayrıntısı); arşivli → 404. */
  async get(actor: PlatformActor, id: string): Promise<BuyerAdminView> {
    return await withPlatformTx(actor, async (tx) =>
      toView(await this.requireBuyer(tx, id, false)),
    );
  }

  /** openapi `POST /admin/buyers/{id}/verify` (US-015 AC2). */
  async decideVoen(
    actor: PlatformActor,
    id: string,
    decision: VoenDecision,
    context: AuditRequestContext,
  ): Promise<BuyerAdminView> {
    return await withPlatformTx(actor, async (tx) => {
      const buyer = await this.requireBuyer(tx, id, true);
      if (buyer.voen === null) throw new DomainError('VOEN_REQUIRED');
      if (buyer.verifiedAt !== null) throw new DomainError('INVALID_STATE_TRANSITION');
      const now = this.clock.now();
      const auditBase = {
        actor: { type: 'platform' as const, userId: actor.userId },
        businessId: id,
        targetType: 'business' as const,
        targetId: id,
        context,
      };
      if (decision.decision === 'verify') {
        await this.buyers.verifyTx(tx, id, actor.userId, now);
        await this.audit.record(tx, {
          ...auditBase,
          action: 'business.voen_verified',
          before: { voen: buyer.voen, verified: false },
          after: { voen: buyer.voen, verified: true },
        });
      } else {
        await this.buyers.clearVoenTx(tx, id, now);
        await this.audit.record(tx, {
          ...auditBase,
          action: 'business.voen_rejected',
          before: { voen: buyer.voen, legalType: buyer.legalType },
          after: { voen: null, reason: decision.reason, note: decision.note ?? null },
        });
        for (const userId of await this.invitations.activeAdminUserIdsTx(tx, id)) {
          await this.outbox.write(tx, {
            type: 'buyer.voen_rejected',
            aggregateType: 'business',
            aggregateId: id,
            businessIds: [id],
            payload: { businessId: id, userId, reason: decision.reason },
          });
        }
      }
      await this.directoryChanged(tx, id);
      return toView(await this.requireBuyer(tx, id, false));
    });
  }

  /** openapi `POST /admin/businesses/{id}/status` (US-016 AC1–AC3). */
  async changeStatus(
    actor: PlatformActor,
    id: string,
    input: BusinessStatusActionInput,
    context: AuditRequestContext,
  ): Promise<BusinessStatusResult> {
    const { result, objectKeys } = await withPlatformTx(actor, async (tx) => {
      const business = await this.buyers.lockForStatusTx(tx, id);
      if (business === undefined || business.status === 'archived') {
        throw new DomainError('NOT_FOUND');
      }
      const isBuyer = business.capabilities.includes('buyer');
      if (input.action === 'archive') {
        // V2: "sil" yalnız perakendecide (US-016); toptancı arşivi belgede yok.
        if (!isBuyer) throw new DomainError('VALIDATION_FAILED', { id: ['not_a_buyer'] });
        BusinessStateMachine.assertTransition(business.status, 'archived');
        const archived = await this.archiver.archiveTx(tx, actor, business, input.reason, context);
        return {
          result: {
            id,
            outcome: archived.outcome,
            status: archived.outcome === 'deleted' ? null : ('archived' as const),
          },
          objectKeys: archived.objectKeys,
        };
      }
      const target: BusinessStatus = input.action === 'suspend' ? 'suspended' : 'active';
      BusinessStateMachine.assertTransition(business.status, target);
      await this.buyers.setStatusTx(tx, id, target, this.clock.now());
      await this.audit.record(tx, {
        actor: { type: 'platform', userId: actor.userId },
        businessId: id,
        action: input.action === 'suspend' ? 'business.suspended' : 'business.unsuspended',
        targetType: 'business',
        targetId: id,
        before: { status: business.status },
        after: { status: target, reason: input.reason },
        context,
      });
      if (isBuyer) await this.directoryChanged(tx, id);
      return { result: { id, outcome: 'updated' as const, status: target }, objectKeys: [] };
    });
    await this.deleteObjects(objectKeys);
    return result;
  }

  /** V4: kalıcı silmede depo nesneleri commit sonrası, en iyi çabayla (artık temizliği F2.16b). */
  private async deleteObjects(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        this.log.warn(
          { event: 'business.purge_object_delete_failed', error: (error as Error).name },
          'silinen işletmenin dosya nesnesi silinemedi',
        );
      }
    }
  }

  private async requireBuyer(tx: Tx, id: string, lock: boolean): Promise<BuyerAdminRow> {
    const row = await this.buyers.findTx(tx, id, lock);
    if (row === undefined || row.status === 'archived') throw new DomainError('NOT_FOUND');
    return row;
  }

  /** Dizin belgesi yenilenir (rozet, askı); tüketici `directory` (F2.11a). */
  private async directoryChanged(tx: Tx, id: string): Promise<void> {
    await this.outbox.write(tx, {
      type: 'buyer.profile_changed',
      aggregateType: 'business',
      aggregateId: id,
      businessIds: [id],
      payload: { businessId: id },
    });
  }
}
