// F1.4b entegrasyon/izolasyon testleri için ortak kurulum. Üst kayıtlar ve işletme satırı ham SQL
// ile (başka modülün test dosyası içe aktarılmaz, coding-guidelines §3.1); plan ve abonelik
// platform bağlamında PlanService ile (UUIDv7 kimlik, Money fiyat).
// Plan kodları rastgele: seed kodlarıyla (pilot, buyer_free) ve dosyalar arasında çakışmaz.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { type TenantTxContext, withPlatformTx, withTenantTx } from '../../../core/db';
import { SystemClock } from '../../../core/clock';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { fromDecimalString } from '../../../core/money';
import { BillingRepository } from '../billing.repository';
import { EntitlementUsageRegistry } from '../entitlement-usage.registry';
import { EntitlementService } from '../entitlement.service';
import { PlanService } from '../plan.service';

export const PLATFORM = { userId: randomUUID() };

export interface Refs {
  readonly regionId: string;
}

/** Üst kayıtlar (para birimi XBA, ülke XB, bölge); F1.7 fixture'larıyla aynı kodlar. */
export async function createRefs(): Promise<Refs> {
  return await withPlatformTx(PLATFORM, async (tx) => {
    await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                         values ('XBA', 'X', 2, true) on conflict do nothing`);
    await tx.execute(sql`insert into countries
                           (code, name, default_currency, default_timezone, phone_prefix)
                         values ('XB', '{"az": "Test"}'::jsonb, 'XBA', 'Asia/Baku', '+997')
                         on conflict do nothing`);
    const region = await tx.execute<{ id: string }>(sql`
      insert into regions (country_code, parent_id, type, name)
      values ('XB', null, 'city', '{"az": "Test"}'::jsonb) returning id`);
    const regionId = region.rows[0]?.id;
    if (regionId === undefined) throw new Error('test bölgesi oluşmadı');
    return { regionId };
  });
}

export function newTenant(): TenantTxContext {
  return { businessId: randomUUID(), userId: randomUUID() };
}

/** Kiracının kendi bağlamında işletme satırı açar (aboneliksiz). */
export async function createBusiness(tenant: TenantTxContext, refs: Refs): Promise<void> {
  await withTenantTx(tenant, (tx) =>
    tx.execute(sql`
      insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
      values (${tenant.businessId}, 'Test MMC', 'XB', ${refs.regionId}, 'Asia/Baku', 'self_signup')`),
  );
}

export interface Billing {
  readonly repository: BillingRepository;
  readonly usage: EntitlementUsageRegistry;
  readonly entitlements: EntitlementService;
  readonly plans: PlanService;
}

export function createBilling(): Billing {
  const repository = new BillingRepository();
  const usage = new EntitlementUsageRegistry();
  return {
    repository,
    usage,
    entitlements: new EntitlementService(repository, usage),
    plans: new PlanService(repository, new UuidV7IdGenerator(new SystemClock())),
  };
}

/** Test planı (XBA para birimi, createRefs ile açılır). */
export async function createPlan(billing: Billing, actor: { userId: string }): Promise<string> {
  return await billing.plans.createPlan(
    {
      code: `test_${randomUUID()}`,
      name: { az: 'Test' },
      capability: 'seller',
      price: fromDecimalString('49.90'),
      currencyCode: 'XBA',
      period: 'month',
    },
    actor,
  );
}

/** İşletme açar ve verilen plana güncel abonelik başlatır. */
export async function subscribedTenant(
  billing: Billing,
  refs: Refs,
  planId: string,
  actor: { userId: string },
): Promise<TenantTxContext> {
  const tenant = newTenant();
  await createBusiness(tenant, refs);
  await billing.plans.startSubscription(
    {
      businessId: tenant.businessId,
      planId,
      currentPeriodStart: '2026-10-01',
      currentPeriodEnd: '2026-10-31',
    },
    actor,
  );
  return tenant;
}
