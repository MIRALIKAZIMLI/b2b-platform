import { Module } from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { EntitlementUsageRegistry } from './entitlement-usage.registry';
import { EntitlementService } from './entitlement.service';
import { PlanService } from './plan.service';

/** Planlar, abonelikler ve hak kontrolü (F1.4b). Bu adımda HTTP uç noktası yok (F6.3). */
@Module({
  providers: [BillingRepository, EntitlementUsageRegistry, EntitlementService, PlanService],
  exports: [EntitlementService, EntitlementUsageRegistry, PlanService],
})
export class BillingModule {}
