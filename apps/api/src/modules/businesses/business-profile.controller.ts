import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import { voenSchema } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { DomainError } from '../../core/errors/domain-error';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { BusinessProfileService } from './business-profile.service';
import { BusinessesRepository, type BusinessRow } from './businesses.repository';

/**
 * openapi `BusinessUpdate`; F2.4'te yalnız `businesses` alanları (K1). Kişisel veri
 * (`contactName`, `personalPhone`, `email`) ve `logoFileId` F2.10'da; gelirse 422 (strict).
 * VÖEN biçimi hatalıysa `details.voen = ['VOEN_INVALID']` (US-006 AC1).
 */
const updateBodySchema = z
  .strictObject({
    voen: voenSchema,
    legalName: z.string().trim().min(1).max(200),
    regionId: z.uuid(),
    addressLine: z.string().trim().min(1).max(300),
    businessPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, { message: 'invalid_phone' }),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty_body' });

/** openapi `Business` şeması. */
export interface BusinessProfile {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string | null;
  readonly legalType: string | null;
  readonly regionId: string;
  readonly addressLine: string | null;
  readonly businessPhone: string | null;
  readonly logoUrl: string | null;
  readonly status: string;
  readonly verified: boolean;
  readonly profileCompleteness: number;
  readonly timezone: string;
  readonly currency: string | null;
}

export function toBusinessProfile(row: BusinessRow): BusinessProfile {
  return {
    id: row.id,
    legalName: row.legalName,
    voen: row.voen,
    legalType: row.legalType,
    regionId: row.regionId,
    addressLine: row.addressLine,
    businessPhone: row.businessPhone,
    // Logo yükleme ve imzalı adres F2.10 profil düzenlemesiyle gelir; şimdilik yok.
    logoUrl: null,
    status: row.status,
    verified: row.verifiedAt !== null,
    profileCompleteness: row.profileCompleteness,
    timezone: row.timezone,
    currency: row.currencyCode,
  };
}

/**
 * Aktif işletmenin profili (openapi `GET /api/v1/business`; F2.3b, US-005 AC2 "Profilinizi
 * tamamlayın" kartı). İzin `business.manage` (Mimar onayı F2.3b): kartı yalnız profili
 * düzenleyebilen görür. Okuma kiracı işleminde; RLS başka işletmenin satırını göstermez.
 */
@Controller('api/v1/business')
export class BusinessProfileController {
  constructor(
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(BusinessProfileService) private readonly profiles: BusinessProfileService,
  ) {}

  @Get()
  @RequirePermission('business.manage')
  async get(@CurrentTenant() tenant: TenantContext): Promise<BusinessProfile> {
    const row = await this.businesses.findOwn(tenant);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return toBusinessProfile(row);
  }

  /** F2.4, US-006 AC1–AC3: profil ve VÖEN; yanıt güncel `Business`. */
  @Patch()
  @RequirePermission('business.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BusinessProfile> {
    const input = updateBodySchema.parse(body);
    const row = await this.profiles.update(tenant, input, requestAuditContext(req));
    return toBusinessProfile(row);
  }
}
