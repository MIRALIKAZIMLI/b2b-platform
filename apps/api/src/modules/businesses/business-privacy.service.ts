// Perakendeci görünürlük ayarları (F2.10, US-007 AC1–AC3, ADR-0014; openapi
// `GET|PUT /api/v1/business/privacy`).
// - V1 (VARSAYIM): yalnız `buyer` yeteneği olan işletme; aksi `403 CAPABILITY_REQUIRED`
//   (dizin yalnız perakendecileri listeler, ADR-0004: tipe değil yeteneğe bakılır).
// - V2 (VARSAYIM): PUT tam gövde; yedi anahtarın hepsi zorunlu (`privacyBodySchema`).
// - AC3: ünvan, faaliyet alanı, şehir/rayon için anahtar yoktur; gönderilirse 422 (strict).
// - V3: değişiklik yoksa yazma, audit ve outbox yok.
// - V4: değişince audit `business.privacy_updated` (yalnız değişen anahtarlar, kişisel veri yok)
//   ve outbox `buyer.privacy_changed` (tüketici F2.11a dizin indeksi; o zamana kadar bekler).
import { changedPrivacyKeys, type PrivacyKey, type PrivacySettings } from '@b2b/shared';
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { BusinessesRepository } from './businesses.repository';

function requireBuyer(tenant: TenantContext): void {
  if (!tenant.capabilities.includes('buyer')) throw new DomainError('CAPABILITY_REQUIRED');
}

function pick(settings: PrivacySettings, keys: readonly PrivacyKey[]): Record<string, boolean> {
  return Object.fromEntries(keys.map((key) => [key, settings[key]]));
}

@Injectable()
export class BusinessPrivacyService {
  constructor(
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async get(tenant: TenantContext): Promise<PrivacySettings> {
    requireBuyer(tenant);
    return withTenantTx(tenant, async (tx) => {
      const settings = await this.businesses.privacyTx(tx, tenant.businessId, false);
      if (settings === undefined) throw new DomainError('NOT_FOUND');
      return settings;
    });
  }

  async replace(
    tenant: TenantContext,
    next: PrivacySettings,
    context: AuditRequestContext,
  ): Promise<PrivacySettings> {
    requireBuyer(tenant);
    const now = this.clock.now();
    return withTenantTx(tenant, async (tx) => {
      const current = await this.businesses.privacyTx(tx, tenant.businessId, true);
      if (current === undefined) throw new DomainError('NOT_FOUND');
      const changed = changedPrivacyKeys(current, next);
      if (changed.length === 0) return current;

      await this.businesses.writePrivacyTx(tx, tenant.businessId, next, now);
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: tenant.businessId,
        action: 'business.privacy_updated',
        targetType: 'business',
        targetId: tenant.businessId,
        before: pick(current, changed),
        after: pick(next, changed),
        context,
      });
      await this.outbox.write(tx, {
        type: 'buyer.privacy_changed',
        aggregateType: 'business',
        aggregateId: tenant.businessId,
        businessIds: [tenant.businessId],
        payload: { businessId: tenant.businessId },
      });
      return next;
    });
  }
}
