// İşletme profilini düzenleme (F2.4, US-006; openapi `PATCH /api/v1/business`).
// - K1: yalnız `businesses` alanları (voen, legalName, regionId, addressLine, businessPhone).
// - K2 (VARSAYIM): VÖEN yalnız `buyer` yeteneğinde değişir; toptancı VÖEN'i admin açılışında
//   girilir, değişikliği moderasyonda (F2.18) → `403 CAPABILITY_REQUIRED`.
// - K3 (VARSAYIM): VÖEN değiştirilebilir, silinemez; aynı değer değişiklik sayılmaz.
// - K4 / AC3: tekillik `businesses_voen_uq` (tüm işletmeler) → `409 VOEN_ALREADY_REGISTERED`.
//   Kiracı başka işletmenin satırını göremez (RLS); bu yüzden ön sorgu yok, indeks karar verir.
// - AC2 / R20: `legal_type` ve rozet sıfırlama tetikleyicide (0016); servis bu alanları yazmaz.
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import type { TenantContext } from '../../core/tenant-context';
import {
  type BusinessRow,
  BusinessesRepository,
  isVoenUniqueViolation,
  type OwnProfilePatch,
} from './businesses.repository';
import { type ProfileField, profileCompleteness } from './profile-completeness';

const PATCH_FIELDS = ['voen', 'legalName', 'regionId', 'addressLine', 'businessPhone'] as const;

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

/** Satırdaki değerle aynı olan alanlar yazılmaz (K3: aynı VÖEN rozeti sıfırlamaz). */
function changedFields(row: BusinessRow, input: OwnProfilePatch): OwnProfilePatch {
  const changed: Record<string, string> = {};
  for (const key of PATCH_FIELDS) {
    const value = input[key];
    if (value !== undefined && value !== row[key]) changed[key] = value;
  }
  return changed;
}

@Injectable()
export class BusinessProfileService {
  constructor(
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** US-006 AC1–AC3, R20. Dönen satır tetikleyiciden sonraki hâldir. */
  async update(
    tenant: TenantContext,
    input: OwnProfilePatch,
    context: AuditRequestContext,
  ): Promise<BusinessRow> {
    const now = this.clock.now();
    try {
      return await withTenantTx(tenant, async (tx) => {
        const current = await this.businesses.lockOwnTx(tx, tenant.businessId);
        if (current === undefined) throw new DomainError('NOT_FOUND');
        const patch = changedFields(current, input);
        if (Object.keys(patch).length === 0) return current;
        if (patch.voen !== undefined && !tenant.capabilities.includes('buyer')) {
          throw new DomainError('CAPABILITY_REQUIRED');
        }
        if (
          patch.regionId !== undefined &&
          !(await this.businesses.regionExistsTx(tx, patch.regionId))
        ) {
          throw invalid('regionId', 'not_found');
        }

        const merged = { ...current, ...patch };
        const extras = await this.businesses.profileExtrasTx(tx, tenant.businessId);
        const filled = new Set<ProfileField>();
        if (merged.legalName !== '') filled.add('legalName');
        if (extras.activityType) filled.add('activityType');
        filled.add('region');
        if (extras.contactName) filled.add('contactName');
        if (merged.voen !== null) filled.add('voen');
        if (merged.addressLine !== null) filled.add('addressLine');
        if (merged.businessPhone !== null) filled.add('businessPhone');
        if (merged.logoFileId !== null) filled.add('logo');
        if (extras.email) filled.add('email');
        if (extras.branchAddress) filled.add('branchAddress');

        const updated = await this.businesses.updateOwnTx(
          tx,
          tenant.businessId,
          patch,
          profileCompleteness(filled),
          now,
        );
        if (updated === undefined) throw new DomainError('NOT_FOUND');

        const actor = { type: 'user' as const, userId: tenant.userId };
        const { voen, ...rest } = patch;
        if (voen !== undefined) {
          await this.audit.record(tx, {
            actor,
            businessId: tenant.businessId,
            action: 'business.voen_changed',
            targetType: 'business',
            targetId: tenant.businessId,
            before: { voen: current.voen, verified: current.verifiedAt !== null },
            after: {
              voen: updated.voen,
              legalType: updated.legalType,
              verified: updated.verifiedAt !== null,
            },
            context,
          });
        }
        if (Object.keys(rest).length > 0) {
          const before: Record<string, unknown> = {};
          for (const key of Object.keys(rest) as (keyof typeof rest)[]) before[key] = current[key];
          await this.audit.record(tx, {
            actor,
            businessId: tenant.businessId,
            action: 'business.profile_updated',
            targetType: 'business',
            targetId: tenant.businessId,
            before,
            after: rest,
            context,
          });
        }
        return updated;
      });
    } catch (error) {
      if (isVoenUniqueViolation(error)) throw new DomainError('VOEN_ALREADY_REGISTERED');
      throw error;
    }
  }
}
