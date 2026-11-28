// Stok modları 0–1 (F3.10; US-038 AC1–AC2, ADR-0018). Var/yok işareti yalnız `availability`
// modunda yazılır; `none` modunda saklanan işaret yok sayılır (`variantBlockedByStock`). Miktarlı stok
// (`quantity`) F3.11a'da bu modüle eklenir.
import { Inject, Injectable } from '@nestjs/common';
import type { StockMode } from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import type { TenantContext } from '../../core/tenant-context';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    @Inject(InventoryRepository) private readonly repository: InventoryRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async stockMode(tenant: TenantContext): Promise<{ stockMode: StockMode }> {
    const stockMode = await withTenantTx(tenant, (tx) =>
      this.repository.stockModeTx(tx, tenant.businessId),
    );
    return { stockMode };
  }

  /**
   * `PUT /variants/{id}/availability` (US-038 AC2). Mod satırı `FOR SHARE` (mod değişikliğiyle
   * yarış yok), varyant satırı `FOR NO KEY UPDATE`. Aynı değer: yazım ve audit yok.
   */
  async setAvailability(
    tenant: TenantContext,
    variantId: string,
    isAvailable: boolean,
    context: AuditRequestContext,
  ): Promise<{ variantId: string; isAvailable: boolean }> {
    const now = this.clock.now();
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const variant = await this.repository.lockVariantTx(tx, sellerId, variantId);
      if (variant === undefined) throw new DomainError('NOT_FOUND');
      const mode = await this.repository.stockModeTx(tx, sellerId, true);
      if (mode !== 'availability') throw new DomainError('STOCK_MODE_MISMATCH');
      if (variant.status === 'archived' || variant.productStatus === 'archived') {
        throw new DomainError('INVALID_STATE_TRANSITION');
      }
      if (variant.isAvailable !== isAvailable) {
        await this.repository.setAvailableTx(tx, sellerId, variantId, isAvailable, now);
        await this.audit.record(tx, {
          actor: { type: 'user', userId: tenant.userId },
          businessId: sellerId,
          action: 'variant.availability_set',
          targetType: 'product_variant',
          targetId: variantId,
          before: { isAvailable: variant.isAvailable },
          after: { isAvailable },
          context,
        });
      }
      return { variantId, isAvailable };
    });
  }
}
