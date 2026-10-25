// F1.4-AC7 kiracı izolasyonu (Mimar D1). `subscriptions` ve `entitlement_overrides` (T):
// kiracı yalnızca kendi satırını okur, kendi satırını bile yazamaz; B, A'nınkini göremez.
// Platform bağlamı okur ve yazar; bağlamsız sistem işlemi 0 satır görür.
// `plans` ve `plan_entitlements` (G): herkes okur, yalnızca platform yazar.
// Bağlantı RLS'e tabi app_user'dır (F1 faz spesifikasyonu §6.12).
import { randomUUID } from 'node:crypto';
import { type SQL, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode } from '../../../../test/isolation';
import {
  type TenantTxContext,
  type Tx,
  withPlatformTx,
  withSystemTx,
  withTenantTx,
} from '../../../core/db';
import {
  type Billing,
  createBilling,
  createPlan,
  createRefs,
  PLATFORM,
  type Refs,
  subscribedTenant,
} from './fixtures';

type Runner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

interface TableCase {
  readonly table: 'subscriptions' | 'entitlement_overrides';
  /** `owner` işletmesi adına geçerli yeni bir satır ekleyen SQL. */
  readonly insert: (owner: string, planId: string) => SQL;
}

const T_TABLES: TableCase[] = [
  {
    table: 'subscriptions',
    insert: (owner, planId) =>
      sql`insert into subscriptions
            (id, business_id, plan_id, status, current_period_start, current_period_end)
          values (${randomUUID()}, ${owner}, ${planId}, 'cancelled', '2026-01-01', '2026-01-31')`,
  },
  {
    table: 'entitlement_overrides',
    insert: (owner) =>
      sql`insert into entitlement_overrides (business_id, key, value)
          values (${owner}, ${`feature.export.${randomUUID()}`}, 'true'::jsonb)`,
  },
];

async function rejected(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => pgErrorCode(error),
  );
}

async function count(run: Runner, table: string, owner: string): Promise<number> {
  const result = await run((tx) =>
    tx.execute(sql`select 1 from ${sql.identifier(table)} where business_id = ${owner}`),
  );
  return result.rowCount ?? 0;
}

describe('F1.4-AC7 kiracı izolasyonu (billing)', () => {
  let refs: Refs;
  let billing: Billing;
  let planId: string;
  let a: TenantTxContext;
  let b: TenantTxContext;

  beforeAll(async () => {
    const who = await withSystemTx((tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );
    expect(who.rows[0]?.current_user).toBe('app_user');

    refs = await createRefs();
    billing = createBilling();
    planId = await createPlan(billing, PLATFORM);
    await billing.entitlements.setPlanEntitlement(planId, 'users.max', 3, PLATFORM);
    a = await subscribedTenant(billing, refs, planId, PLATFORM);
    b = await subscribedTenant(billing, refs, planId, PLATFORM);
    for (const tenant of [a, b]) {
      await billing.entitlements.setOverride(tenant.businessId, 'users.max', 9, null, PLATFORM);
    }
  });

  describe.each(T_TABLES)('$table', (c) => {
    it(`F1.4-AC7: ${c.table} kiracı kendi satırını okur, B A'nınkini okuyamaz`, async () => {
      expect(await count((fn) => withTenantTx(a, fn), c.table, a.businessId)).toBeGreaterThan(0);
      expect(await count((fn) => withTenantTx(b, fn), c.table, a.businessId)).toBe(0);
    });

    it(`F1.4-AC7: ${c.table} kiracı kendi adına ekleyemez (42501)`, async () => {
      expect(
        await rejected(withTenantTx(a, (tx) => tx.execute(c.insert(a.businessId, planId)))),
      ).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it(`F1.4-AC7: ${c.table} B, A adına ekleyemez (42501)`, async () => {
      expect(
        await rejected(withTenantTx(b, (tx) => tx.execute(c.insert(a.businessId, planId)))),
      ).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it(`F1.4-AC7: ${c.table} kiracı kendi satırını güncelleyemez (0 satır)`, async () => {
      const own = await withTenantTx(a, (tx) =>
        tx.execute(
          sql`update ${sql.identifier(c.table)} set updated_at = updated_at
               where business_id = ${a.businessId}`,
        ),
      );
      const other = await withTenantTx(b, (tx) =>
        tx.execute(
          sql`update ${sql.identifier(c.table)} set updated_at = updated_at
               where business_id = ${a.businessId}`,
        ),
      );
      expect(own.rowCount).toBe(0);
      expect(other.rowCount).toBe(0);
    });

    it(`F1.4-AC7: ${c.table} bağlamsız (withSystemTx) 0 satır görür`, async () => {
      const result = await withSystemTx((tx) =>
        tx.execute(sql`select 1 from ${sql.identifier(c.table)}`),
      );
      expect(result.rowCount).toBe(0);
    });

    it(`F1.4-AC7: ${c.table} platform bağlamı A ve B'yi okur ve A adına ekler`, async () => {
      const platform: Runner = (fn) => withPlatformTx(PLATFORM, fn);
      expect(await count(platform, c.table, a.businessId)).toBeGreaterThan(0);
      expect(await count(platform, c.table, b.businessId)).toBeGreaterThan(0);
      const before = await count(platform, c.table, a.businessId);
      await withPlatformTx(PLATFORM, (tx) => tx.execute(c.insert(a.businessId, planId)));
      expect(await count(platform, c.table, a.businessId)).toBe(before + 1);
    });
  });

  it('F1.4-AC7: kiracı kendi istisnasını silemez (0 satır); subscriptions DELETE izni yok', async () => {
    const own = await withTenantTx(a, (tx) =>
      tx.execute(sql`delete from entitlement_overrides where business_id = ${a.businessId}`),
    );
    expect(own.rowCount).toBe(0);
    expect(
      await rejected(
        withPlatformTx(PLATFORM, (tx) =>
          tx.execute(sql`delete from subscriptions where business_id = ${a.businessId}`),
        ),
      ),
    ).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it("F1.4-AC7: B, A'nın hakkını kendi kimliğiyle sorgulayınca A'nın değerini görmez", async () => {
    const asB = await withTenantTx(b, (tx) =>
      billing.repository.findSources(tx, a.businessId, 'users.max'),
    );
    expect(asB).toEqual({});
  });

  describe.each(['plans', 'plan_entitlements'])('%s (G)', (table) => {
    it(`F1.4-AC7: ${table} kiracı okur`, async () => {
      const result = await withTenantTx(a, (tx) =>
        tx.execute(sql`select 1 from ${sql.identifier(table)}`),
      );
      expect(result.rowCount).toBeGreaterThan(0);
    });

    it(`F1.4-AC7: ${table} kiracı güncelleyemez/silemez (0 satır)`, async () => {
      const update = await withTenantTx(a, (tx) =>
        tx.execute(sql`update ${sql.identifier(table)} set updated_at = updated_at`),
      );
      const remove = await withTenantTx(a, (tx) =>
        tx.execute(sql`delete from ${sql.identifier(table)}`),
      );
      expect(update.rowCount).toBe(0);
      expect(remove.rowCount).toBe(0);
    });
  });

  it('F1.4-AC7: plans ve plan_entitlements yalnızca platform bağlamında eklenir', async () => {
    const id = randomUUID();
    const insertPlan = sql`insert into plans (id, code, name, capability, price, currency_code, period)
                           values (${id}, ${`iso_${id}`}, '{"az":"X"}'::jsonb, 'buyer', 0, 'XBA', 'month')`;
    const insertValue = sql`insert into plan_entitlements (plan_id, key, value)
                            values (${planId}, 'feature.courier_app', 'true'::jsonb)`;

    expect(await rejected(withTenantTx(a, (tx) => tx.execute(insertPlan)))).toBe(
      PG_INSUFFICIENT_PRIVILEGE,
    );
    expect(await rejected(withTenantTx(a, (tx) => tx.execute(insertValue)))).toBe(
      PG_INSUFFICIENT_PRIVILEGE,
    );
    expect(await rejected(withSystemTx((tx) => tx.execute(insertPlan)))).toBe(
      PG_INSUFFICIENT_PRIVILEGE,
    );
    await withPlatformTx(PLATFORM, (tx) => tx.execute(insertPlan));
    await withPlatformTx(PLATFORM, (tx) => tx.execute(insertValue));
  });

  it("F1.4-AC7: settings_get B bağlamında A'nın plan satırını döndürmez", async () => {
    await withPlatformTx(PLATFORM, (tx) =>
      tx.execute(sql`select settings_put('plan', ${planId}::uuid, 'sms.daily_cap', '42'::jsonb)`),
    );
    const call = (tx: Tx) =>
      tx.execute<{ scope: string }>(
        sql`select scope from settings_get(${'sms.daily_cap'}, ${a.businessId}::uuid)`,
      );

    const asA = await withTenantTx(a, call);
    const asB = await withTenantTx(b, call);
    const asSystem = await withSystemTx(call);

    expect(asA.rows.map((row) => row.scope)).toContain('plan');
    expect(asB.rows.filter((row) => row.scope === 'plan')).toEqual([]);
    expect(asSystem.rows.filter((row) => row.scope === 'plan')).toEqual([]);
  });
});
