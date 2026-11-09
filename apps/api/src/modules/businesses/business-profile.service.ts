// İşletme profilini düzenleme (F2.4, US-006; openapi `PATCH /api/v1/business`).
// - K1: yalnız `businesses` alanları (voen, legalName, regionId, addressLine, businessPhone).
// - K2 (VARSAYIM): VÖEN yalnız `buyer` yeteneğinde değişir; toptancı VÖEN'i admin açılışında
//   girilir, değişikliği moderasyonda (F2.18) → `403 CAPABILITY_REQUIRED`.
// - K3 (VARSAYIM): VÖEN değiştirilebilir, silinemez; aynı değer değişiklik sayılmaz.
// - K4 / AC3: tekillik `businesses_voen_uq` (tüm işletmeler) → `409 VOEN_ALREADY_REGISTERED`.
//   Kiracı başka işletmenin satırını göremez (RLS); bu yüzden ön sorgu yok, indeks karar verir.
// - AC2 / R20: `legal_type` ve rozet sıfırlama tetikleyicide (0016); servis bu alanları yazmaz.
// F2.10b (US-007 AC2 alanlarının düzenlenmesi):
// - 🔒 `contactName`, `personalPhone`, `email` → `person_data` (audit'te maskeli, log yok).
//   V5 (VARSAYIM): kişisel telefon ve e-posta `null` ile silinir; yetkili adı silinemez.
//   V6 (VARSAYIM): `person_data` satırı yoksa (toptancı) ilk yazımda `contactName` zorunlu.
// - `logoFileId` → `businesses.logo_file_id`; dosya bu işletmenin hazır `logo` dosyası olmalı
//   (`BusinessLogoPort`, ADR-0024), aksi `422 details.logoFileId = [invalid_logo]`; `null` kaldırır.
// F2.11a (Müfettiş 15 L4, VARSAYIM K3): perakendecide dizinde görünebilen bir alan değişirse
//   aynı işlemde outbox `buyer.profile_changed` (yükte yalnız kimlik; tüketici `directory`).
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { BUSINESS_LOGO_PORT, type BusinessLogoPort } from './business-logo.port';
import {
  type BusinessRow,
  BusinessesRepository,
  isVoenUniqueViolation,
  type OwnPersonData,
  type OwnProfilePatch,
} from './businesses.repository';
import { type ProfileField, profileCompleteness } from './profile-completeness';

const PATCH_FIELDS = [
  'voen',
  'legalName',
  'regionId',
  'addressLine',
  'businessPhone',
  'logoFileId',
] as const;
const PERSON_FIELDS = ['contactName', 'personalPhone', 'email'] as const;

/**
 * Dizin belgesine veya tam telefon eşleşmesine giren alanlar (F2.11a). E-posta ne indekste ne
 * eşleşmede; kişisel telefon indekste yok ama olay yine de belgeyi yeniler (zararsız, idempotent).
 */
const DIRECTORY_FIELDS: ReadonlySet<string> = new Set([
  'legalName',
  'regionId',
  'addressLine',
  'businessPhone',
  'voen',
  'logoFileId',
  'contactName',
  'personalPhone',
]);

/** `PATCH /api/v1/business` gövdesi (doğrulanmış). */
export interface ProfileUpdateInput extends OwnProfilePatch {
  readonly contactName?: string | undefined;
  readonly personalPhone?: string | null | undefined;
  readonly email?: string | null | undefined;
}

/** Güncel işletme satırı + kişisel veri (yanıt için). */
export interface OwnProfile {
  readonly business: BusinessRow;
  readonly person: OwnPersonData | undefined;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

/** Satırdaki değerle aynı olan alanlar yazılmaz (K3: aynı VÖEN rozeti sıfırlamaz). */
function changedFields(row: BusinessRow, input: OwnProfilePatch): OwnProfilePatch {
  const changed: Record<string, string | null> = {};
  for (const key of PATCH_FIELDS) {
    const value = input[key];
    if (value !== undefined && value !== row[key]) changed[key] = value;
  }
  return changed;
}

/** Değişen kişisel veri alanları; satır yoksa verilen her alan değişmiş sayılır. */
function changedPerson(
  row: OwnPersonData | undefined,
  input: ProfileUpdateInput,
): Partial<OwnPersonData> {
  const changed: Record<string, string | null> = {};
  for (const key of PERSON_FIELDS) {
    const value = input[key];
    if (value !== undefined && value !== row?.[key]) changed[key] = value;
  }
  return changed;
}

@Injectable()
export class BusinessProfileService {
  constructor(
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(BUSINESS_LOGO_PORT) private readonly logos: BusinessLogoPort,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
  ) {}

  /** Kendi profili + kişisel veri (GET; F2.10b). */
  async get(tenant: TenantContext): Promise<OwnProfile> {
    return await withTenantTx(tenant, async (tx) => {
      const business = await this.businesses.lockOwnTx(tx, tenant.businessId, false);
      if (business === undefined) throw new DomainError('NOT_FOUND');
      return { business, person: await this.businesses.personDataTx(tx, tenant.businessId) };
    });
  }

  /** Logonun okuma adresi (yanıt); logo yoksa veya dosya okunamıyorsa `null`. */
  async logoUrl(tenant: TenantContext, business: BusinessRow): Promise<string | null> {
    if (business.logoFileId === null) return null;
    return await this.logos.readUrl(tenant, business.logoFileId);
  }

  /** US-006 AC1–AC3, R20; F2.10b. Dönen satır tetikleyiciden sonraki hâldir. */
  async update(
    tenant: TenantContext,
    input: ProfileUpdateInput,
    context: AuditRequestContext,
  ): Promise<OwnProfile> {
    const now = this.clock.now();
    // Logo dosyası kendi işlemiyle (dosya modülü) önce doğrulanır; `ready` dosya geri dönmez.
    if (
      typeof input.logoFileId === 'string' &&
      !(await this.logos.isUsableLogo(tenant, input.logoFileId))
    ) {
      throw invalid('logoFileId', 'invalid_logo');
    }
    try {
      return await withTenantTx(tenant, async (tx) => {
        const current = await this.businesses.lockOwnTx(tx, tenant.businessId);
        if (current === undefined) throw new DomainError('NOT_FOUND');
        const currentPerson = await this.businesses.personDataTx(tx, tenant.businessId);
        const patch = changedFields(current, input);
        const personPatch = changedPerson(currentPerson, input);
        const personChanged = Object.keys(personPatch).length > 0;
        if (Object.keys(patch).length === 0 && !personChanged) {
          return { business: current, person: currentPerson };
        }
        let person = currentPerson;
        if (personChanged) {
          const contactName = personPatch.contactName ?? currentPerson?.contactName;
          if (contactName === undefined) throw invalid('contactName', 'required');
          person = {
            contactName,
            personalPhone:
              personPatch.personalPhone !== undefined
                ? personPatch.personalPhone
                : (currentPerson?.personalPhone ?? null),
            email:
              personPatch.email !== undefined ? personPatch.email : (currentPerson?.email ?? null),
          };
          await this.businesses.upsertPersonDataTx(
            tx,
            tenant.businessId,
            this.ids.next(),
            person,
            now,
          );
        }
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
        // Kişisel veri yukarıda yazıldı; doluluk onu da görür.
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
        const changes = { ...rest, ...personPatch };
        if (Object.keys(changes).length > 0) {
          // 🔒 kişisel veri anahtarları audit yazıcısında maskelenir (audit-mask.ts).
          const before: Record<string, unknown> = {};
          for (const key of Object.keys(rest) as (keyof typeof rest)[]) before[key] = current[key];
          for (const key of Object.keys(personPatch) as (keyof OwnPersonData)[]) {
            before[key] = currentPerson?.[key] ?? null;
          }
          await this.audit.record(tx, {
            actor,
            businessId: tenant.businessId,
            action: 'business.profile_updated',
            targetType: 'business',
            targetId: tenant.businessId,
            before,
            after: changes,
            context,
          });
        }
        if (
          tenant.capabilities.includes('buyer') &&
          Object.keys(changes)
            .concat(voen === undefined ? [] : ['voen'])
            .some((key) => DIRECTORY_FIELDS.has(key))
        ) {
          await this.outbox.write(tx, {
            type: 'buyer.profile_changed',
            aggregateType: 'business',
            aggregateId: tenant.businessId,
            businessIds: [tenant.businessId],
            payload: { businessId: tenant.businessId },
          });
        }
        return { business: updated, person };
      });
    } catch (error) {
      if (isVoenUniqueViolation(error)) throw new DomainError('VOEN_ALREADY_REGISTERED');
      throw error;
    }
  }
}
