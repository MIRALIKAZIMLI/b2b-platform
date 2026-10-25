// Kiracı bağlamının kurulması (F1.8b, ADR-0004 sırası: üyelik → işletme durumu → 2FA → yetenek →
// izin). Üyelik ve işletme durumu her istekte veritabanından okunur; yalnızca rolün izin listesi
// önbelleklenir (PermissionCache, rol kimliğiyle doğrulanır).
import { Inject, Injectable } from '@nestjs/common';
import { type PermissionCode, PERMISSIONS } from '@b2b/shared';
import { z } from 'zod';
import { DomainError } from '../../core/errors/domain-error';
import type { TenantContext } from '../../core/tenant-context';
import { SettingsService } from '../settings';
import { PermissionCache } from './permission.cache';
import { type MembershipAccessRow, TenantContextRepository } from './tenant-context.repository';

/** İşletme bağlamlı uçları kapatan işletme durumları (Mimar K3; `dormant` geçer). */
export const BLOCKED_BUSINESS_STATUSES: ReadonlySet<string> = new Set(['suspended', 'archived']);

/** TOTP etkin mi (identity TotpRepository uyar). */
export interface TotpStatusPort {
  isEnabled(userId: string): Promise<boolean>;
}
export const TOTP_STATUS = Symbol('TOTP_STATUS');

const businessIdSchema = z.uuid();

export interface ResolvedTenant {
  readonly tenant: TenantContext;
  readonly membership: MembershipAccessRow;
}

@Injectable()
export class TenantContextService {
  constructor(
    @Inject(TenantContextRepository) private readonly repository: TenantContextRepository,
    @Inject(PermissionCache) private readonly cache: PermissionCache,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(TOTP_STATUS) private readonly totp: TotpStatusPort,
  ) {}

  /**
   * `X-Business-Id` başlığından bağlam kurar; `code` verilirse yetenek ve izni de denetler.
   * Başlık yok / geçersiz → VALIDATION_FAILED (422, http-map; Mimar K2); üye değil → 403 PERMISSION_DENIED.
   */
  async resolve(
    userId: string,
    rawBusinessId: unknown,
    code?: PermissionCode,
  ): Promise<ResolvedTenant> {
    const parsed = businessIdSchema.safeParse(rawBusinessId);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', { header: 'X-Business-Id' });
    }
    const businessId = parsed.data;
    const membership = await this.repository.findActiveMembership({ businessId, userId });
    if (membership === undefined) throw new DomainError('PERMISSION_DENIED');
    if (BLOCKED_BUSINESS_STATUSES.has(membership.businessStatus)) {
      throw new DomainError('BUSINESS_SUSPENDED');
    }
    if (membership.isBusinessAdmin) {
      const required = await this.settings.get('security.require_admin_2fa', businessId);
      if (required && !(await this.totp.isEnabled(userId))) {
        throw new DomainError('TOTP_REQUIRED');
      }
    }
    const capabilities = membership.approvedCapabilities.filter(
      (capability) => capability === membership.roleCapability,
    );
    const permissions = new Map(await this.permissionsOf(businessId, userId, membership));
    const tenant: TenantContext = {
      userId,
      businessId,
      membershipId: membership.membershipId,
      capabilities,
      isBusinessAdmin: membership.isBusinessAdmin,
      branchId: membership.branchId,
      warehouseId: membership.warehouseId,
      permissions,
    };
    if (code !== undefined) assertAllowed(tenant, code);
    return { tenant, membership };
  }

  private async permissionsOf(businessId: string, userId: string, membership: MembershipAccessRow) {
    const cached = await this.cache.get(membership.membershipId, membership.roleId);
    if (cached !== undefined) return cached;
    const fresh = await this.repository.rolePermissions({ businessId, userId }, membership.roleId);
    await this.cache.set(membership.membershipId, membership.roleId, fresh);
    return fresh;
  }
}

/**
 * Yetenek ve izin (ADR-0004 §1). `any` izinleri de işletmede rolün yeteneğinin onaylı olmasını
 * ister: onaysız yetenekteki rol hiçbir izin vermez (Müfettiş PR #23 notu 1, okuma tarafı).
 */
export function assertAllowed(tenant: TenantContext, code: PermissionCode): void {
  const required = PERMISSIONS[code].capability;
  const hasCapability =
    required === 'any' ? tenant.capabilities.length > 0 : tenant.capabilities.includes(required);
  if (!hasCapability) throw new DomainError('CAPABILITY_REQUIRED');
  if (!tenant.permissions.has(code)) throw new DomainError('PERMISSION_DENIED');
}
