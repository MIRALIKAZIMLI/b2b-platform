// F1.4b entegrasyon: hak kontrolü (US-055 AC2, AC3), settings_get güncellemesi (Mimar D2),
// Money fiyat, kimlikler (D4) ve seed. Ayarların plan katmanı: settings.plan.int.test.ts.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import { toDecimalString } from '../../../core/money';
import { seedI18n } from '../../i18n';
import { SEED_PLANS, seedBilling } from '../seed/billing.seed';
import {
  type Billing,
  createBilling,
  createBusiness,
  newTenant,
  createPlan,
  createRefs,
  PLATFORM,
  type Refs,
  subscribedTenant,
} from './fixtures';

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

describe('billing (entegrasyon: PostgreSQL)', () => {
  let refs: Refs;
  let billing: Billing;
  /** Test sayacı: işletme başına "kullanıcı" sayısı (gerçek sayaç F2.7'de). */
  const usersOf = new Map<string, number>();

  beforeAll(async () => {
    refs = await createRefs();
    billing = createBilling();
    billing.usage.register('users.max', ({ businessId }) =>
      Promise.resolve(usersOf.get(businessId) ?? 0),
    );
  });

  async function tenantWithUsersMax(limit: number | null) {
    const planId = await createPlan(billing, PLATFORM);
    await billing.entitlements.setPlanEntitlement(planId, 'users.max', limit, PLATFORM);
    return await subscribedTenant(billing, refs, planId, PLATFORM);
  }

  it('US-055 AC2: users.max=3, kullanım 3, delta 1 → ENTITLEMENT_LIMIT_REACHED', async () => {
    const tenant = await tenantWithUsersMax(3);
    usersOf.set(tenant.businessId, 3);

    const error = await errorOf(billing.entitlements.check('users.max', tenant.businessId, 1));

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ENTITLEMENT_LIMIT_REACHED');
  });

  it('US-055 AC2: users.max=3, kullanım 2, delta 1 → izin', async () => {
    const tenant = await tenantWithUsersMax(3);
    usersOf.set(tenant.businessId, 2);

    await expect(
      billing.entitlements.check('users.max', tenant.businessId, 1),
    ).resolves.toBeUndefined();
  });

  it('US-055 AC2: kiracı işlemi verilince aynı işlemde okunur', async () => {
    const tenant = await tenantWithUsersMax(3);
    usersOf.set(tenant.businessId, 3);

    const error = await errorOf(
      withTenantTx(tenant, (tx) =>
        billing.entitlements.check('users.max', tenant.businessId, 1, tx),
      ),
    );

    expect((error as DomainError).code).toBe('ENTITLEMENT_LIMIT_REACHED');
  });

  it('US-055 AC2: aboneliksiz işletme → ENTITLEMENT_LIMIT_REACHED', async () => {
    const tenant = newTenant();
    await createBusiness(tenant, refs);

    const error = await errorOf(billing.entitlements.check('users.max', tenant.businessId, 1));

    expect((error as DomainError).code).toBe('ENTITLEMENT_LIMIT_REACHED');
  });

  it('US-055 AC2: iptal edilmiş abonelik güncel sayılmaz', async () => {
    const tenant = await tenantWithUsersMax(null);
    await withPlatformTx(PLATFORM, (tx) =>
      tx.execute(
        sql`update subscriptions set status = 'cancelled' where business_id = ${tenant.businessId}`,
      ),
    );

    const error = await errorOf(billing.entitlements.check('users.max', tenant.businessId, 1));

    expect((error as DomainError).code).toBe('ENTITLEMENT_LIMIT_REACHED');
  });

  it('US-055 AC2: null (sınırsız) izin verir', async () => {
    const tenant = await tenantWithUsersMax(null);
    usersOf.set(tenant.businessId, 10_000);

    await expect(
      billing.entitlements.check('users.max', tenant.businessId, 1),
    ).resolves.toBeUndefined();
  });

  it('US-055 AC3: işletmeye özel istisna plan değerinin yerine geçer', async () => {
    const tenant = await tenantWithUsersMax(3);
    usersOf.set(tenant.businessId, 3);
    await billing.entitlements.setOverride(tenant.businessId, 'users.max', 5, 'pilot', PLATFORM);

    await expect(
      billing.entitlements.check('users.max', tenant.businessId, 1),
    ).resolves.toBeUndefined();

    await billing.entitlements.setOverride(tenant.businessId, 'users.max', 2, null, PLATFORM);
    const error = await errorOf(billing.entitlements.check('users.max', tenant.businessId, 1));
    expect((error as DomainError).code).toBe('ENTITLEMENT_LIMIT_REACHED');
  });

  it('US-055 AC3: istisna created_by platform kullanıcısıdır', async () => {
    const tenant = await tenantWithUsersMax(3);
    await billing.entitlements.setOverride(tenant.businessId, 'users.max', 4, 'not', PLATFORM);

    const rows = await withTenantTx(tenant, (tx) =>
      tx.execute<{ value: unknown; reason: string; created_by: string }>(
        sql`select value, reason, created_by from entitlement_overrides
             where business_id = ${tenant.businessId}`,
      ),
    );
    expect(rows.rows).toEqual([{ value: 4, reason: 'not', created_by: PLATFORM.userId }]);
  });

  it('isEnabled: plan özelliği ve istisna', async () => {
    const planId = await createPlan(billing, PLATFORM);
    await billing.entitlements.setPlanEntitlement(planId, 'feature.export', true, PLATFORM);
    const tenant = await subscribedTenant(billing, refs, planId, PLATFORM);

    expect(await billing.entitlements.isEnabled('feature.export', tenant.businessId)).toBe(true);
    expect(await billing.entitlements.isEnabled('feature.courier_app', tenant.businessId)).toBe(
      false,
    );

    await billing.entitlements.setOverride(
      tenant.businessId,
      'feature.export',
      false,
      null,
      PLATFORM,
    );
    expect(await billing.entitlements.isEnabled('feature.export', tenant.businessId)).toBe(false);
  });

  it('D3: plan hakkı JSON null olarak saklanır; yanlış tip yazılmaz', async () => {
    const planId = await createPlan(billing, PLATFORM);
    await billing.entitlements.setPlanEntitlement(planId, 'users.max', null, PLATFORM);
    const error = await errorOf(
      billing.entitlements.setPlanEntitlement(planId, 'feature.export', 'evet', PLATFORM),
    );

    expect((error as DomainError).code).toBe('VALIDATION_FAILED');
    const rows = await withSystemTx((tx) =>
      tx.execute<{ key: string; is_json_null: boolean }>(
        sql`select key, jsonb_typeof(value) = 'null' as is_json_null
              from plan_entitlements where plan_id = ${planId}`,
      ),
    );
    expect(rows.rows).toEqual([{ key: 'users.max', is_json_null: true }]);
  });

  it('D4: plan ve abonelik kimlikleri UUIDv7; fiyat Money olarak okunur', async () => {
    const planId = await createPlan(billing, PLATFORM);
    const tenant = await subscribedTenant(billing, refs, planId, PLATFORM);
    const plan = await billing.plans.findPlan(planId);
    const sub = await withTenantTx(tenant, (tx) =>
      tx.execute<{ id: string }>(
        sql`select id from subscriptions where business_id = ${tenant.businessId}`,
      ),
    );

    expect(planId).toMatch(UUIDV7);
    expect(sub.rows[0]?.id).toMatch(UUIDV7);
    expect(plan && toDecimalString(plan.price, 2)).toBe('49.90');
  });

  it('subscriptions: işletmenin ikinci güncel aboneliği reddedilir (benzersiz indeks)', async () => {
    const planId = await createPlan(billing, PLATFORM);
    const tenant = await subscribedTenant(billing, refs, planId, PLATFORM);

    const error = await errorOf(
      billing.plans.startSubscription(
        {
          businessId: tenant.businessId,
          planId,
          currentPeriodStart: '2026-11-01',
          currentPeriodEnd: '2026-11-30',
        },
        PLATFORM,
      ),
    );
    expect(error).toBeDefined();
  });

  it('D2: settings_get SECURITY DEFINER ve search_path pg_catalog, public, pg_temp', async () => {
    const result = await withSystemTx((tx) =>
      tx.execute<{ proconfig: string[] | null; prosecdef: boolean; public_exec: boolean }>(sql`
        select p.proconfig, p.prosecdef,
               has_function_privilege('public', p.oid, 'EXECUTE') as public_exec
          from pg_proc p
         where p.proname = 'settings_get'`),
    );
    const row = result.rows[0];

    expect(result.rows).toHaveLength(1);
    expect(row?.prosecdef).toBe(true);
    expect(row?.proconfig).toContain('search_path=pg_catalog, public, pg_temp');
    expect(row?.public_exec).toBe(false);
  });

  describe('seed', () => {
    let owner: Awaited<ReturnType<typeof connectAsMigrator>>;

    beforeAll(async () => {
      owner = await connectAsMigrator();
      await seedI18n(owner);
    });

    afterAll(async () => {
      await owner.end();
    });

    async function snapshot() {
      return await withSystemTx((tx) =>
        tx.execute<{ code: string; id: string; key: string; value: unknown }>(sql`
          select p.code, p.id, e.key, e.value
            from plans p join plan_entitlements e on e.plan_id = p.id
           where p.code in ('pilot', 'buyer_free') order by p.code, e.key`),
      );
    }

    it('F1.4b: iki kez çalışınca aynı sonuç (idempotent)', async () => {
      const ids = () => randomUUID();
      await seedBilling(owner, ids);
      const first = await snapshot();
      const again = await seedBilling(owner, ids);
      const second = await snapshot();

      expect(again.inserted).toBe(0);
      expect(second.rows).toEqual(first.rows);
    });

    it('F1.4b: pilot ve buyer_free kartta yazıldığı gibi', async () => {
      await seedBilling(owner, () => randomUUID());
      const plansRows = await withSystemTx((tx) =>
        tx.execute<{
          code: string;
          capability: string;
          price: string;
          currency_code: string;
          period: string;
        }>(sql`
          select code, capability, price, currency_code, period from plans
           where code in ('pilot', 'buyer_free') order by code`),
      );
      const values = await snapshot();
      const byPlan = (code: string) =>
        Object.fromEntries(
          values.rows.filter((row) => row.code === code).map((row) => [row.key, row.value]),
        );

      expect(plansRows.rows).toEqual([
        {
          code: 'buyer_free',
          capability: 'buyer',
          price: '0.00',
          currency_code: 'AZN',
          period: 'month',
        },
        {
          code: 'pilot',
          capability: 'seller',
          price: '0.00',
          currency_code: 'AZN',
          period: 'month',
        },
      ]);
      expect(byPlan('pilot')).toEqual({
        'buyers.active.max': null,
        'connection_requests.daily': null,
        'feature.branch_pricing': true,
        'feature.courier_app': true,
        'feature.export': true,
        'users.max': null,
        'warehouses.max': null,
      });
      expect(byPlan('buyer_free')).toEqual({
        'buyers.active.max': null,
        'connection_requests.daily': null,
        'feature.branch_pricing': false,
        'feature.courier_app': false,
        'feature.export': false,
        'users.max': null,
        'warehouses.max': null,
      });
      expect(SEED_PLANS.map((plan) => plan.code)).toEqual(['pilot', 'buyer_free']);
    });
  });
});
