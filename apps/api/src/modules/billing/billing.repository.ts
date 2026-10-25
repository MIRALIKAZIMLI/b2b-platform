import { Injectable } from '@nestjs/common';
import type { EntitlementKey } from '@b2b/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  type PlatformTxContext,
  type Tx,
  withPlatformTx,
  withSystemTx,
  withTenantTx,
} from '../../core/db';
import type { EntitlementRepositoryPort, EntitlementSources } from './billing.ports';
import {
  CURRENT_SUBSCRIPTION_STATUSES,
  entitlementOverrides,
  planEntitlements,
  plans,
  subscriptions,
} from './billing.schema';

export type PlanRow = typeof plans.$inferSelect;
export type NewPlanRow = typeof plans.$inferInsert;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;

/** jsonb'ye `null` dahil değeri JSON olarak yazar (Drizzle `null`'ı SQL NULL yapar). */
function jsonValue(value: unknown) {
  return sql`${JSON.stringify(value)}::jsonb`;
}

/**
 * billing tablolarına erişim (F1.4b). Yazmalar yalnızca platform bağlamında (Mimar D1);
 * kiracı kendi aboneliğini ve istisnasını yalnızca okur. `plans` ve `plan_entitlements` G sınıfıdır.
 */
@Injectable()
export class BillingRepository implements EntitlementRepositoryPort {
  async inTenantTx<T>(
    businessId: string,
    tx: Tx | undefined,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    if (tx !== undefined) return await fn(tx);
    return await withTenantTx({ businessId, userId: null }, fn);
  }

  async findSources(tx: Tx, businessId: string, key: EntitlementKey): Promise<EntitlementSources> {
    const override = await tx
      .select({ value: entitlementOverrides.value })
      .from(entitlementOverrides)
      .where(
        and(eq(entitlementOverrides.businessId, businessId), eq(entitlementOverrides.key, key)),
      );
    const plan = await tx
      .select({ value: planEntitlements.value })
      .from(subscriptions)
      .innerJoin(planEntitlements, eq(planEntitlements.planId, subscriptions.planId))
      .where(
        and(
          eq(subscriptions.businessId, businessId),
          inArray(subscriptions.status, [...CURRENT_SUBSCRIPTION_STATUSES]),
          eq(planEntitlements.key, key),
        ),
      );
    const sources: { override?: unknown; plan?: unknown } = {};
    if (override[0] !== undefined) sources.override = override[0].value;
    if (plan[0] !== undefined) sources.plan = plan[0].value;
    return sources;
  }

  async writePlanEntitlement(
    ctx: PlatformTxContext,
    planId: string,
    key: EntitlementKey,
    value: unknown,
  ): Promise<void> {
    await withPlatformTx(ctx, (tx) =>
      tx
        .insert(planEntitlements)
        .values({ planId, key, value: jsonValue(value) })
        .onConflictDoUpdate({
          target: [planEntitlements.planId, planEntitlements.key],
          set: { value: jsonValue(value), updatedAt: sql`now()` },
        }),
    );
  }

  async writeOverride(
    ctx: PlatformTxContext,
    businessId: string,
    key: EntitlementKey,
    value: unknown,
    reason: string | null,
  ): Promise<void> {
    await withPlatformTx(ctx, (tx) =>
      tx
        .insert(entitlementOverrides)
        .values({ businessId, key, value: jsonValue(value), reason, createdBy: ctx.userId })
        .onConflictDoUpdate({
          target: [entitlementOverrides.businessId, entitlementOverrides.key],
          set: { value: jsonValue(value), reason, createdBy: ctx.userId, updatedAt: sql`now()` },
        }),
    );
  }

  async insertPlan(ctx: PlatformTxContext, row: NewPlanRow): Promise<void> {
    await withPlatformTx(ctx, (tx) => tx.insert(plans).values(row));
  }

  /** G tablosu: bağlamsız okunabilir. */
  async findPlan(planId: string): Promise<PlanRow | undefined> {
    const rows = await withSystemTx((tx) => tx.select().from(plans).where(eq(plans.id, planId)));
    return rows[0];
  }

  async insertSubscription(ctx: PlatformTxContext, row: NewSubscriptionRow): Promise<void> {
    await withPlatformTx(ctx, (tx) => tx.insert(subscriptions).values(row));
  }
}
