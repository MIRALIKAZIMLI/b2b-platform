// Ekip yönetimi (F2.7a, US-013). Uçlar `team.manage` izniyle (controller); burada iş kuralları:
// - Kapsam rolden türetilir (Mimar K9): rolde `branch` kapsamlı izin varsa şube, `warehouse`
//   kapsamlı izin varsa depo zorunlu; gerekmeyen alan gönderilirse 422. Rol değişince artık
//   gerekmeyen eski kapsam kendiliğinden temizlenir. Bölgeler (`membership_regions`) yalnız
//   `assigned` kapsamlı rolde (K4: kabulden sonra bu uçla atanır).
// - Çıkarma `status = removed`; bölgeler silinir. Tek admin → tetikleyici → 409 (US-013 AC3).
// - Rol değişikliği `MembershipService.applyRoleChangeTx` (audit kim/kime/eski/yeni, outbox);
//   önbellek commit'ten sonra temizlenir (US-013 AC4).
// Davet oluşturma `onboarding` modülündedir (c4 §1: billing + i18n + identity gerekir); kurallar
// `validateInvitationTargetTx` ile buradan paylaşılır.
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import type { TenantContext } from '../../core/tenant-context';
import { AccessRepository } from './access.repository';
import { MembershipService } from './membership.service';
import {
  type JobTitleRow,
  type MembershipPatch,
  type TeamInvitationRow,
  type TeamMemberRow,
  TeamRepository,
  type TeamRoleRow,
} from './team.repository';

/** openapi `TeamMember`. */
export interface TeamMemberView {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string;
  readonly phone: string;
  readonly roleId: string;
  readonly jobTitleId: string;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  readonly regionIds: string[];
  readonly isBusinessAdmin: boolean;
  readonly isSelf: boolean;
  readonly joinedAt: string | null;
}

/** openapi `TeamInvitation`. */
export interface TeamInvitationView {
  readonly id: string;
  readonly phone: string;
  readonly roleId: string;
  readonly jobTitleId: string;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface MemberUpdate {
  readonly roleId?: string | undefined;
  readonly branchId?: string | null | undefined;
  readonly warehouseId?: string | null | undefined;
  readonly regionIds?: readonly string[] | undefined;
  readonly status?: 'removed' | undefined;
}

export interface InvitationTarget {
  readonly roleId: string;
  readonly jobTitleId: string;
  readonly branchId?: string | undefined;
  readonly warehouseId?: string | undefined;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

/**
 * Bağlamın yetenekleri (team.manage `any`; guard en az bir onaylı yetenek ister). Yetenek tek
 * değere indirilmez (AGENTS kural 2; Müfettiş #48 M1): her kontrol listenin tamamıyla yapılır.
 */
function capabilitiesOf(tenant: TenantContext): readonly ('seller' | 'buyer')[] {
  if (tenant.capabilities.length === 0) throw new DomainError('CAPABILITY_REQUIRED');
  return tenant.capabilities;
}

function hasCapability(tenant: TenantContext, capability: string): boolean {
  return tenant.capabilities.some((item) => item === capability);
}

@Injectable()
export class TeamService {
  constructor(
    @Inject(TeamRepository) private readonly repository: TeamRepository,
    @Inject(AccessRepository) private readonly access: AccessRepository,
    @Inject(MembershipService) private readonly memberships: MembershipService,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async listMembers(tenant: TenantContext): Promise<TeamMemberView[]> {
    return await withTenantTx(tenant, async (tx) => {
      const rows = await this.repository.listMembers(tx, tenant.businessId);
      const regions = await this.repository.regionsOf(
        tx,
        rows.map((row) => row.id),
      );
      return rows.map((row) => this.toMemberView(tenant, row, regions.get(row.id) ?? []));
    });
  }

  async updateMember(
    tenant: TenantContext,
    membershipId: string,
    input: MemberUpdate,
    context: AuditRequestContext,
  ): Promise<TeamMemberView> {
    const now = this.clock.now();
    const result = await withTenantTx(tenant, async (tx) => {
      const locked = await this.access.lockMembership(tx, tenant.businessId, membershipId);
      const member =
        locked?.status === 'active'
          ? await this.repository.findActiveMember(tx, tenant.businessId, membershipId)
          : undefined;
      if (locked === undefined || member === undefined) throw new DomainError('NOT_FOUND');
      const oldRegions = (await this.repository.regionsOf(tx, [member.id])).get(member.id) ?? [];

      if (input.status === 'removed') {
        if (
          input.roleId !== undefined ||
          input.branchId !== undefined ||
          input.warehouseId !== undefined ||
          input.regionIds !== undefined
        ) {
          throw invalid('status', 'exclusive');
        }
        await this.repository.updateMembership(tx, member.id, { status: 'removed' }, now);
        await this.repository.replaceRegions(tx, member.id, []);
        await this.audit.record(tx, {
          actor: { type: 'user', userId: tenant.userId },
          businessId: tenant.businessId,
          action: 'membership.removed',
          targetType: 'membership',
          targetId: member.id,
          before: { userId: member.userId, roleId: member.roleId, status: 'active' },
          after: { userId: member.userId, roleId: member.roleId, status: 'removed' },
          context,
        });
        return { view: this.toMemberView(tenant, member, []), invalidate: true };
      }

      const roleId = input.roleId ?? member.roleId;
      const role = await this.access.findRole(tx, tenant.businessId, roleId);
      if (role === undefined) throw new DomainError('NOT_FOUND', { roleId: ['not_found'] });
      if (!hasCapability(tenant, role.capability)) {
        throw invalid('roleId', 'capability');
      }
      const scopes = await this.repository.roleScopes(tx, role.id);
      const branchId = await this.resolveScopeField(
        tx,
        tenant.businessId,
        'branchId',
        scopes.has('branch'),
        input.branchId,
        member.branchId,
      );
      const warehouseId = await this.resolveScopeField(
        tx,
        tenant.businessId,
        'warehouseId',
        scopes.has('warehouse'),
        input.warehouseId,
        member.warehouseId,
      );
      let regionIds: readonly string[] = scopes.has('assigned') ? oldRegions : [];
      if (input.regionIds !== undefined) {
        if (!scopes.has('assigned')) throw invalid('regionIds', 'not_allowed');
        regionIds = await this.assertRegions(tx, input.regionIds);
      }

      const roleChanged = role.id !== member.roleId;
      if (roleChanged) {
        await this.memberships.applyRoleChangeTx(tx, tenant, member, role.id, context);
      }
      const scopeChanged =
        branchId !== member.branchId ||
        warehouseId !== member.warehouseId ||
        !sameSet(regionIds, oldRegions);
      if (scopeChanged) {
        const patch: MembershipPatch = { branchId, warehouseId };
        await this.repository.updateMembership(tx, member.id, patch, now);
        if (!sameSet(regionIds, oldRegions)) {
          await this.repository.replaceRegions(tx, member.id, regionIds);
        }
        await this.audit.record(tx, {
          actor: { type: 'user', userId: tenant.userId },
          businessId: tenant.businessId,
          action: 'membership.scope_changed',
          targetType: 'membership',
          targetId: member.id,
          before: {
            userId: member.userId,
            branchId: member.branchId,
            warehouseId: member.warehouseId,
            regionIds: oldRegions,
          },
          after: { userId: member.userId, branchId, warehouseId, regionIds: [...regionIds] },
          context,
        });
      }
      const fresh = await this.repository.findActiveMember(tx, tenant.businessId, member.id);
      if (fresh === undefined) throw new DomainError('NOT_FOUND');
      return {
        view: this.toMemberView(tenant, fresh, [...regionIds].sort()),
        invalidate: roleChanged,
      };
    });
    if (result.invalidate) await this.memberships.invalidatePermissions(membershipId);
    return result.view;
  }

  async listInvitations(tenant: TenantContext): Promise<TeamInvitationView[]> {
    const now = this.clock.now();
    return await withTenantTx(tenant, async (tx) => {
      const rows = await this.repository.listOpenInvitations(tx, tenant.businessId, now);
      return rows.map(toInvitationView);
    });
  }

  async revokeInvitation(
    tenant: TenantContext,
    invitationId: string,
    context: AuditRequestContext,
  ): Promise<void> {
    const now = this.clock.now();
    await withTenantTx(tenant, async (tx) => {
      if (!(await this.repository.expireOpenInvitation(tx, tenant.businessId, invitationId, now))) {
        throw new DomainError('NOT_FOUND');
      }
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: invitationId,
        context,
      });
    });
  }

  async listRoles(tenant: TenantContext): Promise<TeamRoleRow[]> {
    const capabilities = capabilitiesOf(tenant);
    return await withTenantTx(tenant, (tx) =>
      this.repository.listRoles(tx, tenant.businessId, capabilities),
    );
  }

  async listJobTitles(tenant: TenantContext): Promise<JobTitleRow[]> {
    const capabilities = capabilitiesOf(tenant);
    return await withTenantTx(tenant, (tx) => this.repository.listJobTitles(tx, capabilities));
  }

  // --- Davet oluşturma için, çağıranın (onboarding) kiracı işleminde ---

  /**
   * Davetin rolü, unvanı ve kapsamı geçerli mi (K9, PATCH ile aynı kural). Geçerliyse
   * yazılacak kapsamı döner; değilse 404 / 422.
   */
  async validateInvitationTargetTx(
    tx: Tx,
    tenant: TenantContext,
    target: InvitationTarget,
  ): Promise<{ branchId: string | null; warehouseId: string | null }> {
    capabilitiesOf(tenant);
    const role = await this.access.findRole(tx, tenant.businessId, target.roleId);
    if (role === undefined) throw new DomainError('NOT_FOUND', { roleId: ['not_found'] });
    if (!hasCapability(tenant, role.capability)) throw invalid('roleId', 'capability');
    const jobTitle = await this.repository.findActiveJobTitle(tx, target.jobTitleId);
    if (jobTitle === undefined) throw new DomainError('NOT_FOUND', { jobTitleId: ['not_found'] });
    // Unvan rolle aynı yetenekte olmalı (seller rolüne buyer unvanı verilemez).
    if (jobTitle.capability !== role.capability) throw invalid('jobTitleId', 'capability');
    const scopes = await this.repository.roleScopes(tx, role.id);
    const branchId = await this.resolveScopeField(
      tx,
      tenant.businessId,
      'branchId',
      scopes.has('branch'),
      target.branchId,
      null,
    );
    const warehouseId = await this.resolveScopeField(
      tx,
      tenant.businessId,
      'warehouseId',
      scopes.has('warehouse'),
      target.warehouseId,
      null,
    );
    return { branchId, warehouseId };
  }

  async isActiveMemberPhoneTx(tx: Tx, businessId: string, phoneE164: string): Promise<boolean> {
    return await this.repository.isActiveMemberPhone(tx, businessId, phoneE164);
  }

  async expireOpenInvitationsForPhoneTx(
    tx: Tx,
    businessId: string,
    phoneE164: string,
    now: Date,
  ): Promise<void> {
    await this.repository.expireOpenInvitationsForPhone(tx, businessId, phoneE164, now);
  }

  /** `users.max` kullanımı: aktif üyelik + açık davet (VARSAYIM K2). */
  async countSeatsTx(tx: Tx, businessId: string): Promise<number> {
    return await this.repository.countSeats(tx, businessId, this.clock.now());
  }

  /** Davet edilenin kullanıcı kimliği (`user_ensure_for_invitation`, yalnız team.manage). */
  async ensureInvitedUserTx(
    tx: Tx,
    input: { id: string; phoneE164: string; fullName: string; now: Date },
  ): Promise<string> {
    return await this.repository.ensureInvitedUser(tx, input);
  }

  /**
   * Kapsam alanı (şube/depo). `required` rolün o kapsamı isteyip istemediği; `given` istekte
   * gelen (undefined = gönderilmedi), `current` üyeliğin mevcut değeri.
   */
  private async resolveScopeField(
    tx: Tx,
    businessId: string,
    field: 'branchId' | 'warehouseId',
    required: boolean,
    given: string | null | undefined,
    current: string | null,
  ): Promise<string | null> {
    if (!required) {
      if (given !== undefined && given !== null) throw invalid(field, 'not_allowed');
      return null;
    }
    const value = given === undefined ? current : given;
    if (value === null) throw invalid(field, 'required');
    if (given !== undefined) {
      const status =
        field === 'branchId'
          ? await this.repository.branchStatus(tx, businessId, value)
          : await this.repository.warehouseStatus(tx, businessId, value);
      if (status === undefined) throw new DomainError('NOT_FOUND', { [field]: ['not_found'] });
      if (status !== 'active') throw invalid(field, 'inactive');
    }
    return value;
  }

  private async assertRegions(tx: Tx, regionIds: readonly string[]): Promise<string[]> {
    const unique = [...new Set(regionIds)];
    const existing = await this.repository.existingRegions(tx, unique);
    if (existing.size !== unique.length) {
      throw new DomainError('NOT_FOUND', { regionIds: ['not_found'] });
    }
    return unique;
  }

  private toMemberView(
    tenant: TenantContext,
    row: TeamMemberRow,
    regionIds: string[],
  ): TeamMemberView {
    return {
      id: row.id,
      userId: row.userId,
      fullName: row.fullName,
      phone: row.phoneE164,
      roleId: row.roleId,
      jobTitleId: row.jobTitleId,
      branchId: row.branchId,
      warehouseId: row.warehouseId,
      regionIds,
      isBusinessAdmin: row.isBusinessAdmin,
      isSelf: row.userId === tenant.userId,
      joinedAt: row.joinedAt?.toISOString() ?? null,
    };
  }
}

function toInvitationView(row: TeamInvitationRow): TeamInvitationView {
  return {
    id: row.id,
    phone: row.phoneE164,
    roleId: row.roleId,
    jobTitleId: row.jobTitleId,
    branchId: row.branchId,
    warehouseId: row.warehouseId,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}
