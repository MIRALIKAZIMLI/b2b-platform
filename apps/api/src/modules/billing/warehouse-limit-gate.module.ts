import { Global, Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { Tx } from '../../core/db';
import { BusinessesModule, SellerSetupRepository, WarehouseLimitGate } from '../businesses';
import { BillingModule } from './billing.module';
import { EntitlementUsageRegistry } from './entitlement-usage.registry';
import { EntitlementService } from './entitlement.service';

/** `warehouses.max` (US-011 AC2): değer billing'den, kullanım = aktif depo sayısı (F2.6). */
@Injectable()
export class EntitlementWarehouseLimitGate extends WarehouseLimitGate implements OnModuleInit {
  constructor(
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(EntitlementUsageRegistry) private readonly usage: EntitlementUsageRegistry,
    @Inject(SellerSetupRepository) private readonly warehouses: SellerSetupRepository,
  ) {
    super();
  }

  onModuleInit(): void {
    this.usage.register('warehouses.max', ({ businessId, tx }) =>
      this.warehouses.countActiveWarehousesTx(tx, businessId),
    );
  }

  async assertCanAddActive(tx: Tx, businessId: string): Promise<void> {
    await this.entitlements.check('warehouses.max', businessId, 1, tx);
  }
}

/**
 * `WarehouseLimitGate` uygulaması. Global: `businesses` modülü billing'i içe aktarmadan
 * (c4 §1 yönü `billing → businesses`) belirteci çözer.
 */
@Global()
@Module({
  imports: [BillingModule, BusinessesModule],
  providers: [
    EntitlementWarehouseLimitGate,
    { provide: WarehouseLimitGate, useExisting: EntitlementWarehouseLimitGate },
  ],
  exports: [WarehouseLimitGate],
})
export class WarehouseLimitGateModule {}
