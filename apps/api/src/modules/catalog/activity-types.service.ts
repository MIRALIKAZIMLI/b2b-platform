// Faaliyet alanı admin kuralları (F3.2a, US-029 AC1; R38). Tablo businesses modülünde (F2.3a, G);
// herkese açık liste `GET /catalog/activity-types` orada kalır. Yazma çağıranın platform işleminde.
import { Inject, Injectable } from '@nestjs/common';
import type { ActivityTypeCreate, CatalogEntryPatch, CatalogName } from '@b2b/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { activityTypes } from '../businesses';
import { namesClash, sameName } from './catalog-names';
import type { CatalogActor } from './categories.service';

/** openapi `ActivityTypeAdmin`. */
export interface ActivityTypeAdminView {
  readonly id: string;
  readonly name: unknown;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

const columns = {
  id: activityTypes.id,
  name: activityTypes.name,
  sortOrder: activityTypes.sortOrder,
  isActive: activityTypes.isActive,
};

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

@Injectable()
export class ActivityTypesAdminService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async listTx(tx: Tx): Promise<ActivityTypeAdminView[]> {
    return await tx
      .select(columns)
      .from(activityTypes)
      .orderBy(asc(activityTypes.sortOrder), asc(activityTypes.createdAt));
  }

  async createTx(
    tx: Tx,
    actor: CatalogActor,
    input: ActivityTypeCreate,
    context: AuditRequestContext,
  ): Promise<ActivityTypeAdminView> {
    await this.assertNameFreeTx(tx, input.name, null);
    const now = this.clock.now();
    const inserted = await tx
      .insert(activityTypes)
      .values({
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning(columns);
    const row = inserted[0];
    if (row === undefined) throw new Error('faaliyet alanı eklenemedi');
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'activity_type.created',
      targetType: 'activity_type',
      targetId: row.id,
      after: { name: input.name, sortOrder: row.sortOrder },
      context,
    });
    return row;
  }

  /** Ad, sıra, aktiflik; silme yok (R38). Pasif tür kayıt formunda görünmez. */
  async updateTx(
    tx: Tx,
    actor: CatalogActor,
    id: string,
    input: CatalogEntryPatch,
    context: AuditRequestContext,
  ): Promise<ActivityTypeAdminView> {
    const rows = await tx
      .select(columns)
      .from(activityTypes)
      .where(eq(activityTypes.id, id))
      .for('update');
    const current = rows[0];
    if (current === undefined) throw new DomainError('NOT_FOUND');
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: { name?: CatalogName; sortOrder?: number; isActive?: boolean } = {};
    if (input.name !== undefined && !sameName(current.name, input.name)) {
      await this.assertNameFreeTx(tx, input.name, id);
      before.name = current.name;
      after.name = input.name;
      patch.name = input.name;
    }
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) {
      before.sortOrder = current.sortOrder;
      after.sortOrder = input.sortOrder;
      patch.sortOrder = input.sortOrder;
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      before.isActive = current.isActive;
      after.isActive = input.isActive;
      patch.isActive = input.isActive;
    }
    if (Object.keys(patch).length === 0) return current;
    const updated = await tx
      .update(activityTypes)
      .set({ ...patch, updatedAt: this.clock.now() })
      .where(eq(activityTypes.id, id))
      .returning(columns);
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'activity_type.updated',
      targetType: 'activity_type',
      targetId: id,
      before,
      after,
      context,
    });
    return updated[0] ?? current;
  }

  /** Aynı adda iki faaliyet alanı olmaz (K3 kuralı tek kapsamda). */
  private async assertNameFreeTx(tx: Tx, name: CatalogName, selfId: string | null): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('activity_types', 0))`);
    const rows = await tx.select(columns).from(activityTypes);
    if (rows.some((row) => row.id !== selfId && namesClash(row.name, name))) {
      throw invalid('name', 'taken');
    }
  }
}
