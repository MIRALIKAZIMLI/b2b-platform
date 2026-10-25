// İsteğin kiracı bağlamı (F1.8b, design-doc §4.3). AccessGuard `@RequirePermission` uçlarında
// `X-Business-Id`'yi kullanıcının o işletmedeki aktif üyeliğiyle doğrulayıp `request.tenant`'a
// yazar. Servisler veritabanı işlemini bu bağlamla açar: `withTenantTx(tenant, …)` (TenantContext,
// TenantTxContext'i genişletir). İstemciden gelen işletme kimliğine başka yolla güvenilmez.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionCode, PermissionScope } from '@b2b/shared';
import { DomainError } from './errors/domain-error';

export interface TenantContext {
  readonly userId: string;
  readonly businessId: string;
  readonly membershipId: string;
  /** İşletmenin onaylı yetenekleri ∩ rolün yeteneği (boşsa yetenek gerektiren izin verilmez). */
  readonly capabilities: readonly ('seller' | 'buyer')[];
  readonly isBusinessAdmin: boolean;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  /** Rolün izinleri ve kapsamları. */
  readonly permissions: ReadonlyMap<PermissionCode, PermissionScope>;
}

interface TenantRequest {
  tenant?: TenantContext;
}

/** `@RequirePermission` ucunda AccessGuard'ın kurduğu bağlam; başka uçta 403. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const tenant = context.switchToHttp().getRequest<TenantRequest>().tenant;
    if (tenant === undefined) throw new DomainError('PERMISSION_DENIED');
    return tenant;
  },
);

/** Guard'ın bağlamı isteğe yazması (yalnız AccessGuard). */
export function attachTenant(request: unknown, tenant: TenantContext): void {
  (request as TenantRequest).tenant = tenant;
}

/** İstekte kurulmuş bağlam varsa (ör. `/me` BusinessIdOptional). */
export function requestTenant(request: unknown): TenantContext | undefined {
  return (request as TenantRequest).tenant;
}
