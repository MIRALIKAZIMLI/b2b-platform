// Kademeli indirim (F3.9; US-037 AC1, ADR-0019; kullanıcı kararları S1 = A, S2 = A). Kademe bir
// ambalaj seviyesinin bütün perakendecilerine uygulanır; hesap yalnız `PriceResolver`'da (kademe
// seçilen fiyatın üzerine, şube indiriminden önce). Kurallar şemada (`tierPricesSetSchema`: eşik > 1,
// tekrarsız, 0 < indirim < 100, eşik büyüdükçe indirim büyür); sayı sınırı ayardan.
import { Inject, Injectable } from '@nestjs/common';
import type { TierPricePage, TierPricesQuery, TierPricesSet } from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import type { TenantContext } from '../../core/tenant-context';
import { SettingsService } from '../settings';
import { PriceListsRepository } from './price-lists.repository';
import { type TierPriceRow, TierPricesRepository } from './tier-prices.repository';

function tiersOf(rows: readonly TierPriceRow[], packagingId: string) {
  return rows
    .filter((row) => row.packagingId === packagingId)
    .map((row) => ({ minQty: row.minQty, discountPercent: row.discountPercent }));
}

@Injectable()
export class TierPricesService {
  constructor(
    @Inject(TierPricesRepository) private readonly repository: TierPricesRepository,
    @Inject(PriceListsRepository) private readonly lists: PriceListsRepository,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /**
   * `GET /tier-prices`: istenen ambalajların kademeleri (kademesi olmayan ambalaj boş listeyle).
   * Başka satıcının veya olmayan ambalaj sonuçta yer almaz. Kademe müşteriye bağlı değildir; temsilci
   * (`assigned`) de okur.
   */
  async list(tenant: TenantContext, query: TierPricesQuery): Promise<TierPricePage> {
    const maxPerPackaging = await this.settings.get(
      'pricing.tier_max_per_packaging',
      tenant.businessId,
    );
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const requested = [...new Set(query.packagingId)];
      const owned = await this.lists.ownedPackagingIdsTx(tx, sellerId, requested);
      const ids = requested.filter((id) => owned.has(id));
      const rows = await this.repository.listTx(tx, sellerId, ids);
      return {
        items: ids.map((packagingId) => ({ packagingId, tiers: tiersOf(rows, packagingId) })),
        maxPerPackaging,
      };
    });
  }

  /**
   * `PUT /tier-prices` (US-037 AC1): ambalajın bütün kademeleri gövdedekilerle değişir; boş liste
   * kademeleri kaldırır. Ambalaj satırı kilitlenir (eşzamanlı iki yazım sıralanır). Başka satıcının
   * ambalajı 404; ayardaki sınırı aşan liste 422 `tiers: too_many`.
   */
  async set(
    tenant: TenantContext,
    input: TierPricesSet,
    context: AuditRequestContext,
  ): Promise<{ packagingId: string; tiers: { minQty: string; discountPercent: string }[] }> {
    const max = await this.settings.get('pricing.tier_max_per_packaging', tenant.businessId);
    if (input.tiers.length > max) {
      throw new DomainError('VALIDATION_FAILED', { tiers: ['too_many'] });
    }
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const locked = await this.repository.lockPackagingTx(tx, sellerId, input.packagingId);
      if (!locked) throw new DomainError('NOT_FOUND');
      const before = tiersOf(
        await this.repository.listTx(tx, sellerId, [input.packagingId]),
        input.packagingId,
      );
      await this.repository.replaceTx(
        tx,
        sellerId,
        input.packagingId,
        input.tiers,
        this.clock.now(),
        tenant.userId,
      );
      const after = tiersOf(
        await this.repository.listTx(tx, sellerId, [input.packagingId]),
        input.packagingId,
      );
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: sellerId,
        action: 'tier_price.set',
        targetType: 'tier_price',
        targetId: input.packagingId,
        before: { tiers: before },
        after: { tiers: after },
        context,
      });
      return { packagingId: input.packagingId, tiers: after };
    });
  }
}
