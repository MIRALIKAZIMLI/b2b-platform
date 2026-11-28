// Stok modları 0–1 (F3.10; US-038 AC1–AC2, ADR-0018). Var/yok işareti yalnız `availability`
// modunda yazılır; `none` modunda saklanan işaret yok sayılır (`variantBlockedByStock`). Miktarlı stok
// (`quantity`, F3.11a) iki adımda açılır (S5 = B): stok önce girilir (`StockService`), sonra
// `activateQuantity` modu yazar.
import { Inject, Injectable } from '@nestjs/common';
import type { StockMode } from '@b2b/shared';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import type { TenantContext } from '../../core/tenant-context';
import { SellerSetupRepository } from '../businesses';
import { InventoryRepository } from './inventory.repository';
import { StockRepository } from './stock.repository';

export interface QuantityActivation {
  readonly stockMode: StockMode;
  readonly uncountedCount: number;
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(InventoryRepository) private readonly repository: InventoryRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StockRepository) private readonly stock: StockRepository,
    @Inject(SellerSetupRepository) private readonly sellerSetup: SellerSetupRepository,
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
      const mode = await this.repository.stockModeTx(tx, sellerId, 'share');
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

  /**
   * `POST /stock-mode/quantity` (S5 = B ikinci adım; F3.11a). Mod satırı `FOR UPDATE`: iki eşzamanlı
   * geçiş sıralanır, yalnız ilki audit yazar. Sayılmamış satılabilir varyant varsa ve onay yoksa
   * `409 STOCK_UNCOUNTED_VARIANTS` (S2 = A: onayla açılır, o varyantlar "Stokta yok").
   */
  async activateQuantity(
    tenant: TenantContext,
    confirmUncounted: boolean,
    context: AuditRequestContext,
  ): Promise<QuantityActivation> {
    if (!tenant.capabilities.includes('seller')) throw new DomainError('CAPABILITY_REQUIRED');
    const now = this.clock.now();
    return await withTenantTx(tenant, async (tx) => {
      const sellerId = tenant.businessId;
      const mode = await this.repository.stockModeTx(tx, sellerId, 'update');
      const uncountedCount = await this.stock.uncountedVariantsTx(tx, sellerId);
      if (mode === 'quantity') return { stockMode: mode, uncountedCount };
      if (uncountedCount > 0 && !confirmUncounted) {
        throw new DomainError('STOCK_UNCOUNTED_VARIANTS', { uncountedCount });
      }
      await this.sellerSetup.upsertSellerProfileTx(tx, sellerId, { stockMode: 'quantity' }, now);
      await this.audit.record(tx, {
        actor: { type: 'user', userId: tenant.userId },
        businessId: sellerId,
        action: 'seller_profile.updated',
        targetType: 'business',
        targetId: sellerId,
        before: { stockMode: mode },
        after: { stockMode: 'quantity', uncountedCount },
        context,
      });
      return { stockMode: 'quantity', uncountedCount };
    });
  }
}
