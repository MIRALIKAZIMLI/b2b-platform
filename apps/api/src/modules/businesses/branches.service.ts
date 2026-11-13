// Şubeler (F2.5, US-010). İzin `business.manage` (controller; c4 §5 "Profil, depolar, şubeler…").
// - Yalnız `buyer` yeteneği (T1; yoksa `403 CAPABILITY_REQUIRED`).
// - AC1: ad, bölge, adres, konum, onay kuralı. AC3: kural verilmezse `every_order`.
// - Eşik yalnız `above_amount`'ta ve zorunlu; kural başka bir kurala geçince eşik silinir (T4).
//   `above_amount`'ta eşik yoksa 422 (PATCH kısmi olduğundan mevcut eşik de sayılır).
// - Konum ya iki koordinatla birlikte ya hiç (T6). Geçersiz değerler 0028 CHECK'leriyle de reddedilir.
// - AC4: silme ucu yok (T2), yalnız pasifleştirme. Son aktif şube pasifleşemez (T3) →
//   `409 INVALID_STATE_TRANSITION` (`last_active_branch`). Aktif üyesi veya açık daveti olan şube
//   pasifleşemez (S3, kullanıcı kararı 2026-11-13) → 409 (`branch_in_use`). Eşzamanlı iki
//   pasifleştirme işletme satırı kilidiyle sıraya girer.
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import type { TenantContext } from '../../core/tenant-context';
import type { BranchApprovalRule } from './branch-approval';
import { type BranchPatch, type BranchRow, BranchesRepository } from './branches.repository';
import { BranchUsageGate } from './branch-usage.gate';
import { BusinessesRepository } from './businesses.repository';

export interface BranchGeo {
  readonly lat: number;
  readonly lng: number;
}

export interface BranchCreateInput {
  readonly name: string;
  readonly regionId: string;
  readonly addressLine: string;
  readonly geo: BranchGeo | null;
  readonly approvalRule?: BranchApprovalRule | undefined;
  readonly approvalThreshold?: string | null | undefined;
}

export interface BranchUpdateInput {
  readonly name?: string | undefined;
  readonly regionId?: string | undefined;
  readonly addressLine?: string | undefined;
  /** undefined = değişmez, null = konum silinir. */
  readonly geo?: BranchGeo | null | undefined;
  readonly approvalRule?: BranchApprovalRule | undefined;
  readonly approvalThreshold?: string | null | undefined;
  readonly status?: 'active' | 'inactive' | undefined;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

function requireBuyer(tenant: TenantContext): void {
  if (!tenant.capabilities.includes('buyer')) throw new DomainError('CAPABILITY_REQUIRED');
}

/** numeric(9,6) metni. */
const coordinate = (value: number): string => value.toFixed(6);

/**
 * Kural ve eşiğin son hâli. `rule` / `threshold` istekte gelen (undefined = gönderilmedi),
 * `current*` satırın mevcut değeri.
 */
export function resolveApproval(
  rule: BranchApprovalRule | undefined,
  threshold: string | null | undefined,
  currentRule: string,
  currentThreshold: string | null,
): { approvalRule: string; approvalThreshold: string | null } {
  const finalRule = rule ?? currentRule;
  if (finalRule !== 'above_amount') {
    if (threshold !== undefined && threshold !== null) {
      throw invalid('approvalThreshold', 'not_allowed');
    }
    return { approvalRule: finalRule, approvalThreshold: null };
  }
  const finalThreshold = threshold === undefined ? currentThreshold : threshold;
  if (finalThreshold === null) throw invalid('approvalThreshold', 'required');
  return { approvalRule: finalRule, approvalThreshold: finalThreshold };
}

@Injectable()
export class BranchesService {
  constructor(
    @Inject(BranchesRepository) private readonly repository: BranchesRepository,
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(BranchUsageGate) private readonly usage: BranchUsageGate,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(tenant: TenantContext): Promise<BranchRow[]> {
    requireBuyer(tenant);
    return await withTenantTx(tenant, (tx) => this.repository.listTx(tx, tenant.businessId));
  }

  async get(tenant: TenantContext, id: string): Promise<BranchRow> {
    requireBuyer(tenant);
    const row = await withTenantTx(tenant, (tx) =>
      this.repository.findTx(tx, tenant.businessId, id),
    );
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return row;
  }

  /** US-010 AC1, AC3. */
  async create(
    tenant: TenantContext,
    input: BranchCreateInput,
    context: AuditRequestContext,
  ): Promise<BranchRow> {
    requireBuyer(tenant);
    const approval = resolveApproval(
      input.approvalRule,
      input.approvalThreshold,
      'every_order',
      null,
    );
    const now = this.clock.now();
    return await withTenantTx(tenant, async (tx) => {
      await this.assertRegion(tx, input.regionId);
      const row = await this.repository.insertTx(tx, {
        id: this.ids.next(),
        businessId: tenant.businessId,
        name: input.name,
        regionId: input.regionId,
        addressLine: input.addressLine,
        geoLat: input.geo === null ? null : coordinate(input.geo.lat),
        geoLng: input.geo === null ? null : coordinate(input.geo.lng),
        ...approval,
        now,
      });
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'branch.created',
        targetType: 'branch',
        targetId: row.id,
        after: {
          name: row.name,
          regionId: row.regionId,
          approvalRule: row.approvalRule,
          approvalThreshold: row.approvalThreshold,
          status: row.status,
        },
        context,
      });
      return row;
    });
  }

  /** Düzenleme ve pasifleştirme / etkinleştirme (US-010 AC4). */
  async update(
    tenant: TenantContext,
    id: string,
    input: BranchUpdateInput,
    context: AuditRequestContext,
  ): Promise<BranchRow> {
    requireBuyer(tenant);
    const now = this.clock.now();
    return await withTenantTx(tenant, async (tx) => {
      // İşletme kilidi: "son aktif şube" sayımı eşzamanlı pasifleştirmeyle yarışmaz.
      if ((await this.businesses.lockOwnTx(tx, tenant.businessId)) === undefined) {
        throw new DomainError('NOT_FOUND');
      }
      const current = await this.repository.lockTx(tx, tenant.businessId, id);
      if (current === undefined) throw new DomainError('NOT_FOUND');

      const patch: BranchPatch = {};
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const note = <K extends keyof BranchPatch>(key: K, value: BranchPatch[K]) => {
        if (current[key] === value) return;
        patch[key] = value;
        before[key] = current[key];
        after[key] = value;
      };
      if (input.name !== undefined) note('name', input.name);
      if (input.regionId !== undefined && input.regionId !== current.regionId) {
        await this.assertRegion(tx, input.regionId);
        note('regionId', input.regionId);
      }
      if (input.addressLine !== undefined) note('addressLine', input.addressLine);
      if (input.geo !== undefined) {
        note('geoLat', input.geo === null ? null : coordinate(input.geo.lat));
        note('geoLng', input.geo === null ? null : coordinate(input.geo.lng));
      }
      if (input.approvalRule !== undefined || input.approvalThreshold !== undefined) {
        const approval = resolveApproval(
          input.approvalRule,
          input.approvalThreshold,
          current.approvalRule,
          current.approvalThreshold,
        );
        note('approvalRule', approval.approvalRule);
        note('approvalThreshold', approval.approvalThreshold);
      }
      if (input.status !== undefined) note('status', input.status);

      if (patch.status === 'inactive') {
        if ((await this.repository.countOtherActiveTx(tx, tenant.businessId, id)) === 0) {
          throw new DomainError('INVALID_STATE_TRANSITION', { reason: 'last_active_branch' });
        }
        // S3 (kullanıcı kararı 2026-11-13): aktif üyesi / açık daveti olan şube pasifleşemez.
        const bound = await this.usage.countBoundTx(tx, tenant.businessId, id, now);
        if (bound.members > 0 || bound.invitations > 0) {
          throw new DomainError('INVALID_STATE_TRANSITION', {
            reason: 'branch_in_use',
            members: bound.members,
            invitations: bound.invitations,
          });
        }
      }
      if (Object.keys(patch).length === 0) return current;
      const updated = await this.repository.updateTx(tx, tenant.businessId, id, patch, now);
      if (updated === undefined) throw new DomainError('NOT_FOUND');
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'branch.updated',
        targetType: 'branch',
        targetId: id,
        before,
        after,
        context,
      });
      return updated;
    });
  }

  private async assertRegion(tx: Tx, regionId: string): Promise<void> {
    if (!(await this.repository.regionExistsTx(tx, regionId))) {
      throw invalid('regionId', 'not_found');
    }
  }
}
