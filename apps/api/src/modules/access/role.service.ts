// İşletme rolü (F1.8a, ADR-0004 §3, US-012 AC2). Rol, platform şablonunun o anki izinleri
// kopyalanarak açılır; şablon sonradan güncellense de kopya değişmez. Kaynak şablon ve sürümü
// saklanır ("yeni şablon sürümü" bildirimi F2'de bu alanları kullanır).
// Kapsam ve yetenek denetimi servis kuralıdır (Mimar K3): izin katalogda olmalı, rolün yeteneğine
// uymalı ve kapsam iznin kapsam seçeneklerinden biri olmalı.
import { Inject, Injectable } from '@nestjs/common';
import {
  isPermissionCode,
  isPermissionForCapability,
  isScopeAllowed,
  isPermissionScope,
} from '@b2b/shared';
import { Clock } from '../../core/clock';
import { type TenantTxContext, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { AccessRepository, type TemplatePermission } from './access.repository';

@Injectable()
export class RoleService {
  constructor(
    @Inject(AccessRepository) private readonly repository: AccessRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** Şablonu işletmeye kopyalar; yeni rolün kimliğini döner. */
  async createFromTemplate(ctx: TenantTxContext, templateId: string): Promise<string> {
    return await withTenantTx(ctx, async (tx) => {
      const template = await this.repository.findTemplate(tx, templateId);
      if (template === undefined) {
        throw new DomainError('NOT_FOUND');
      }
      const capability = template.capability === 'buyer' ? 'buyer' : 'seller';
      // Rolün yeteneği işletmenin yeteneği olmalı (data-model §4.5; Müfettiş PR #23 notu 1).
      if (!(await this.repository.businessHasCapability(tx, ctx.businessId, capability))) {
        throw new DomainError('CAPABILITY_REQUIRED');
      }
      const items = await this.repository.templatePermissions(tx, templateId);
      assertPermissionsValid(capability, items);
      const roleId = this.ids.next();
      const now = this.clock.now();
      await this.repository.insertRole(tx, {
        id: roleId,
        businessId: ctx.businessId,
        name: template.name,
        capability,
        isBusinessAdmin: template.isBusinessAdmin,
        sourceTemplateId: template.id,
        sourceTemplateVersion: template.version,
        createdAt: now,
        updatedAt: now,
      });
      await this.repository.insertRolePermissions(tx, roleId, items);
      return roleId;
    });
  }
}

/** Rol izinleri katalogla tutarlı mı? Değilse VALIDATION_FAILED (Mimar K3). */
export function assertPermissionsValid(
  capability: 'seller' | 'buyer',
  items: readonly TemplatePermission[],
): void {
  for (const item of items) {
    if (
      !isPermissionCode(item.permissionCode) ||
      !isPermissionScope(item.scope) ||
      !isPermissionForCapability(item.permissionCode, capability) ||
      !isScopeAllowed(item.permissionCode, item.scope)
    ) {
      throw new DomainError('VALIDATION_FAILED', { permission: item.permissionCode });
    }
  }
}
