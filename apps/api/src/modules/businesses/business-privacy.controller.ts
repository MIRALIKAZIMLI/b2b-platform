import { type PrivacySettings, privacyBodySchema } from '@b2b/shared';
import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { BusinessPrivacyService } from './business-privacy.service';

/**
 * Perakendeci görünürlük ayarları (F2.10, US-007 AC1–AC3). İzin `business.manage` (profil ile
 * aynı); yetenek `buyer` (servis). Yanıt her zaman openapi `Privacy` (yedi anahtar).
 */
@Controller('api/v1/business/privacy')
export class BusinessPrivacyController {
  constructor(@Inject(BusinessPrivacyService) private readonly privacy: BusinessPrivacyService) {}

  @Get()
  @RequirePermission('business.manage')
  async get(@CurrentTenant() tenant: TenantContext): Promise<PrivacySettings> {
    return this.privacy.get(tenant);
  }

  @Put()
  @RequirePermission('business.manage')
  async replace(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<PrivacySettings> {
    const input = privacyBodySchema.parse(body);
    return this.privacy.replace(tenant, input, requestAuditContext(req));
  }
}
