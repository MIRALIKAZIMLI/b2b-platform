// Admin toptancı başvuru listesi ve ret (F2.2, US-008 AC1). Başvurudan toptancı açma
// SellersService.create (`applicationId`) içinde, aynı işlemde. Platform bağlamı yalnızca bu
// modülde açılır (c4 §3.7).
import { Inject, Injectable } from '@nestjs/common';
import { AuditService, type AuditRecorder, type AuditRequestContext } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withPlatformTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import {
  type SellerApplicationRow,
  SellerApplicationsRepository,
  type SellerApplicationStatus,
} from '../businesses';
import type { PlatformActor } from './sellers.service';

/** openapi `SellerApplication`. contactName ve phone kişisel veri; yalnız platform görür. */
export interface SellerApplicationView {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string;
  readonly contactName: string;
  readonly phone: string;
  readonly regionId: string;
  readonly categoryNote: string | null;
  readonly status: SellerApplicationStatus;
  readonly businessId: string | null;
  readonly createdAt: string;
}

function toView(row: SellerApplicationRow): SellerApplicationView {
  return {
    id: row.id,
    legalName: row.legalName,
    voen: row.voen,
    contactName: row.contactName,
    phone: row.phoneE164,
    regionId: row.regionId,
    categoryNote: row.categoryNote,
    status: row.status,
    businessId: row.businessId,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class SellerApplicationsAdminService {
  constructor(
    @Inject(SellerApplicationsRepository)
    private readonly applications: SellerApplicationsRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(
    actor: PlatformActor,
    status: SellerApplicationStatus,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: SellerApplicationView[]; nextCursor: string | null }> {
    return await withPlatformTx(actor, async (tx) => {
      // Bir fazla okunur: sonraki sayfa var mı.
      const rows = await this.applications.listTx(tx, status, cursor, limit + 1);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map(toView),
        nextCursor: rows.length > limit && last !== undefined ? last.id : null,
      };
    });
  }

  /** `pending` → `rejected`; yoksa 404, `pending` değilse 409 (state-machines §12). */
  async reject(
    actor: PlatformActor,
    id: string,
    context: AuditRequestContext,
  ): Promise<SellerApplicationView> {
    const now = this.clock.now();
    return await withPlatformTx(actor, async (tx) => {
      const application = await this.applications.lockTx(tx, id);
      if (application === undefined) throw new DomainError('NOT_FOUND');
      const updated = await this.applications.reviewTx(
        tx,
        application,
        { to: 'rejected' },
        actor.userId,
        now,
      );
      await this.audit.record(tx, {
        actor: { type: 'platform', userId: actor.userId },
        businessId: null,
        action: 'seller_application.rejected',
        targetType: 'seller_application',
        targetId: id,
        before: { status: application.status },
        after: { status: updated.status, voen: updated.voen },
        context,
      });
      return toView(updated);
    });
  }
}
