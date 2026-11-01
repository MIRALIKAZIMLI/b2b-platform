import { Controller, Get, Inject } from '@nestjs/common';
import { RequirePermission } from '../../core/auth/access-decorators';
import { DomainError } from '../../core/errors/domain-error';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { BusinessesRepository, type BusinessRow } from './businesses.repository';

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
    // Logo yükleme ve imzalı adres profil düzenlemesiyle gelir (F2.4/F2.10); şimdilik yok.
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
  constructor(@Inject(BusinessesRepository) private readonly businesses: BusinessesRepository) {}

  @Get()
  @RequirePermission('business.manage')
  async get(@CurrentTenant() tenant: TenantContext): Promise<BusinessProfile> {
    const row = await this.businesses.findOwn(tenant);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return toBusinessProfile(row);
  }
}
