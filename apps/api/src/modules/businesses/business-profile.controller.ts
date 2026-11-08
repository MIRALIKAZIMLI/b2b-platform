import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import { PHONE_E164_PATTERN, voenSchema } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { BusinessProfileService, type OwnProfile } from './business-profile.service';

/**
 * openapi `BusinessUpdate` (strict; bilinmeyen alan 422). F2.4: `businesses` alanları; F2.10b:
 * 🔒 `contactName`, `personalPhone`, `email` (`person_data`) ve `logoFileId`. Kişisel telefon,
 * e-posta ve logo `null` ile kaldırılır (V5). VÖEN biçimi hatalıysa
 * `details.voen = ['VOEN_INVALID']` (US-006 AC1).
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
    logoFileId: z.uuid().nullable(),
    contactName: z.string().trim().min(1).max(120),
    personalPhone: z
      .string()
      .trim()
      .regex(PHONE_E164_PATTERN, { message: 'invalid_phone' })
      .nullable(),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.email({ message: 'invalid_email' }))
      .nullable(),
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
  readonly logoFileId: string | null;
  readonly contactName: string | null;
  readonly personalPhone: string | null;
  readonly email: string | null;
  readonly status: string;
  readonly verified: boolean;
  readonly profileCompleteness: number;
  readonly timezone: string;
  readonly currency: string | null;
}

export function toBusinessProfile(
  { business: row, person }: OwnProfile,
  logoUrl: string | null,
): BusinessProfile {
  return {
    id: row.id,
    legalName: row.legalName,
    voen: row.voen,
    legalType: row.legalType,
    regionId: row.regionId,
    addressLine: row.addressLine,
    businessPhone: row.businessPhone,
    logoUrl,
    logoFileId: row.logoFileId,
    // 🔒 Yalnız `business.manage` sahibine, kendi işletmesi için (F2.10b).
    contactName: person?.contactName ?? null,
    personalPhone: person?.personalPhone ?? null,
    email: person?.email ?? null,
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
  constructor(@Inject(BusinessProfileService) private readonly profiles: BusinessProfileService) {}

  private async view(tenant: TenantContext, profile: OwnProfile): Promise<BusinessProfile> {
    return toBusinessProfile(profile, await this.profiles.logoUrl(tenant, profile.business));
  }

  @Get()
  @RequirePermission('business.manage')
  async get(@CurrentTenant() tenant: TenantContext): Promise<BusinessProfile> {
    return await this.view(tenant, await this.profiles.get(tenant));
  }

  /** F2.4, US-006 AC1–AC3: profil ve VÖEN; F2.10b kişisel veri ve logo. Yanıt güncel `Business`. */
  @Patch()
  @RequirePermission('business.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BusinessProfile> {
    const input = updateBodySchema.parse(body);
    const profile = await this.profiles.update(tenant, input, requestAuditContext(req));
    return await this.view(tenant, profile);
  }
}
