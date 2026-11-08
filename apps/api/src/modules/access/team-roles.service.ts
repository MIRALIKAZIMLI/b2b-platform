// İşletmeye özel rol (F2.8, US-014). Uçlar `team.manage` izniyle (controller); burada iş kuralları:
// - Rol bir platform şablonundan açılır, izinleri istekteki gibidir (AC1). İzin rolün yeteneğine ait
//   olmalı ve kapsam iznin seçeneklerinden biri olmalı; değilse 422 (AC2, F1.8a K3).
// - Özel rol işletme admini değildir (kart V1); yalnız özel roller düzenlenir (V3).
// - Yetki yükseltme koruması (Müfettiş 11 R3, V5): admin olmayan aktör kendinde olmayan izni veya
//   kapsamı role koyamaz, kendisini aşan rolü düzenleyemez → 403 PERMISSION_DENIED.
// - İzin değişince `permissions_version` artar (önbellek bununla doğrulanır), rolün her aktif üyeliği
//   için `role.permissions_changed` outbox olayı yazılır ve commit'ten sonra önbellek silinir (R22).
import { Inject, Injectable } from '@nestjs/common';
import { type LocalizedText, permissionsBeyondActor, rolePermissionError } from '@b2b/shared';
import { type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { AccessRepository } from './access.repository';
import { PermissionCache } from './permission.cache';
import { type RoleTemplateView, TeamRolesRepository } from './team-roles.repository';
import { TeamRepository, type TeamRoleRow } from './team.repository';

export interface RolePermissionInput {
  readonly code: string;
  readonly scope: string;
}

export interface CustomRoleInput {
  readonly templateId: string;
  readonly name: LocalizedText;
  readonly permissions: readonly RolePermissionInput[];
}

export interface CustomRoleUpdate {
  readonly name?: LocalizedText | undefined;
  readonly permissions?: readonly RolePermissionInput[] | undefined;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

function capabilitiesOf(tenant: TenantContext): readonly ('seller' | 'buyer')[] {
  if (tenant.capabilities.length === 0) throw new DomainError('CAPABILITY_REQUIRED');
  return tenant.capabilities;
}

function asCapability(tenant: TenantContext, value: string): 'seller' | 'buyer' | undefined {
  return tenant.capabilities.find((item) => item === value);
}

/** AC2 + K3: izin listesi rolün yeteneğiyle ve katalogla tutarlı olmalı. */
function assertPermissions(
  capability: 'seller' | 'buyer',
  items: readonly RolePermissionInput[],
): void {
  const error = rolePermissionError(capability, items);
  if (error !== undefined) {
    throw new DomainError('VALIDATION_FAILED', { permissions: [error.reason], code: error.code });
  }
}

/** R3: aktörü aşan izin varsa 403 (ayrıntıda yalnız izin kodları). */
export function assertWithinActor(
  tenant: TenantContext,
  role: { isBusinessAdmin: boolean; permissions: readonly RolePermissionInput[] },
  field: string,
): void {
  const beyond = permissionsBeyondActor(tenant, role);
  if (beyond.length > 0) {
    throw new DomainError('PERMISSION_DENIED', { [field]: ['beyond_actor'], permissions: beyond });
  }
}

/** Kapsam alanı gerektiren türler (şube / depo / bölge; team.service K9 ile aynı). */
function scopeKinds(items: readonly RolePermissionInput[]): string {
  const kinds = new Set(items.map((item) => item.scope).filter((scope) => scope !== 'all'));
  return [...kinds].sort().join(',');
}

function samePermissions(
  a: readonly RolePermissionInput[],
  b: readonly RolePermissionInput[],
): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(a.map((item) => [item.code, item.scope]));
  return b.every((item) => map.get(item.code) === item.scope);
}

const sorted = (items: readonly RolePermissionInput[]): RolePermissionInput[] =>
  [...items]
    .map((item) => ({ code: item.code, scope: item.scope }))
    .sort((x, y) => x.code.localeCompare(y.code));

@Injectable()
export class TeamRolesService {
  constructor(
    @Inject(TeamRolesRepository) private readonly repository: TeamRolesRepository,
    @Inject(TeamRepository) private readonly team: TeamRepository,
    @Inject(AccessRepository) private readonly access: AccessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(PermissionCache) private readonly cache: Pick<PermissionCache, 'invalidateMany'>,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async listTemplates(tenant: TenantContext): Promise<RoleTemplateView[]> {
    const capabilities = capabilitiesOf(tenant);
    return await withTenantTx(tenant, (tx) => this.repository.listTemplates(tx, capabilities));
  }

  /** US-014 AC1: şablondan özel rol. */
  async create(
    tenant: TenantContext,
    input: CustomRoleInput,
    context: AuditRequestContext,
  ): Promise<TeamRoleRow> {
    capabilitiesOf(tenant);
    return await withTenantTx(tenant, async (tx) => {
      const template = await this.access.findTemplate(tx, input.templateId);
      if (template === undefined) {
        throw new DomainError('NOT_FOUND', { templateId: ['not_found'] });
      }
      const capability = asCapability(tenant, template.capability);
      if (capability === undefined) throw invalid('templateId', 'capability');
      assertPermissions(capability, input.permissions);
      assertWithinActor(
        tenant,
        { isBusinessAdmin: false, permissions: input.permissions },
        'permissions',
      );

      const roleId = this.ids.next();
      const now = this.clock.now();
      await this.access.insertRole(tx, {
        id: roleId,
        businessId: tenant.businessId,
        name: input.name,
        capability,
        isBusinessAdmin: false,
        sourceTemplateId: template.id,
        sourceTemplateVersion: template.version,
        isCustom: true,
        permissionsVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
      await this.access.insertRolePermissions(
        tx,
        roleId,
        input.permissions.map((item) => ({ permissionCode: item.code, scope: item.scope })),
      );
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'role.created',
        targetType: 'role',
        targetId: roleId,
        after: {
          name: input.name,
          templateId: template.id,
          permissions: sorted(input.permissions),
        },
        context,
      });
      return await this.view(tx, tenant, roleId);
    });
  }

  /** US-014: özel rolün adı ve izinleri; izin değişince önbellek temizlenir (R22). */
  async update(
    tenant: TenantContext,
    roleId: string,
    input: CustomRoleUpdate,
    context: AuditRequestContext,
  ): Promise<TeamRoleRow> {
    capabilitiesOf(tenant);
    const now = this.clock.now();
    const result = await withTenantTx(tenant, async (tx) => {
      const role = await this.repository.lockRole(tx, tenant.businessId, roleId);
      const capability = role === undefined ? undefined : asCapability(tenant, role.capability);
      if (role === undefined || capability === undefined) throw new DomainError('NOT_FOUND');
      if (!role.isCustom) throw invalid('roleId', 'not_editable');
      const current = await this.repository.permissionsOf(tx, role.id);
      // Kendisini aşan rolü düzenleyemez (ör. yöneticinin kendinden geniş rolü daraltması da).
      assertWithinActor(
        tenant,
        { isBusinessAdmin: role.isBusinessAdmin, permissions: current },
        'roleId',
      );

      let invalidate: string[] = [];
      let version: number | undefined;
      const patch: { name?: LocalizedText; permissionsVersion?: number } = {};
      const next = input.permissions;
      const permissionsChanged = next !== undefined && !samePermissions(current, next);
      if (next !== undefined && permissionsChanged) {
        assertPermissions(capability, next);
        assertWithinActor(tenant, { isBusinessAdmin: false, permissions: next }, 'permissions');
        const members = await this.repository.activeMembershipIds(tx, tenant.businessId, role.id);
        if (scopeKinds(current) !== scopeKinds(next)) {
          const inUse =
            members.length > 0 ||
            (await this.repository.hasOpenInvitation(tx, tenant.businessId, role.id, now));
          if (inUse) throw invalid('permissions', 'scope_change_in_use');
        }
        await this.repository.replacePermissions(tx, role.id, next);
        version = role.permissionsVersion + 1;
        patch.permissionsVersion = version;
        invalidate = members;
      }
      const nameChanged =
        input.name !== undefined && JSON.stringify(input.name) !== JSON.stringify(role.name);
      if (input.name !== undefined && nameChanged) patch.name = input.name;
      if (!permissionsChanged && !nameChanged) {
        return { view: await this.view(tx, tenant, role.id), invalidate };
      }

      await this.repository.updateRole(tx, tenant.businessId, role.id, patch, now);
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'role.updated',
        targetType: 'role',
        targetId: role.id,
        before: {
          ...(nameChanged ? { name: role.name } : {}),
          ...(permissionsChanged ? { permissions: sorted(current) } : {}),
        },
        after: {
          ...(nameChanged ? { name: input.name } : {}),
          ...(permissionsChanged ? { permissions: sorted(next) } : {}),
        },
        context,
      });
      if (version !== undefined) {
        for (const membershipId of invalidate) {
          await this.outbox.write(tx, {
            type: 'role.permissions_changed',
            aggregateType: 'role',
            aggregateId: role.id,
            businessIds: [tenant.businessId],
            payload: { roleId: role.id, membershipId, version },
          });
        }
      }
      return { view: await this.view(tx, tenant, role.id), invalidate };
    });
    // Commit sonrası (worker tüketicisi yedek). Önbellek ayrıca sürümle doğrulanır.
    await this.cache.invalidateMany(result.invalidate);
    return result.view;
  }

  private async view(tx: Tx, tenant: TenantContext, roleId: string): Promise<TeamRoleRow> {
    const rows = await this.team.listRoles(tx, tenant.businessId, tenant.capabilities, roleId);
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return row;
  }
}
