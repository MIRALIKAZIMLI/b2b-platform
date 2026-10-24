// F1.7 kiracı izolasyonu (AC4, AC5; Mimar düzeltmesi D1). İki işletme (A, B) her T tablosunda
// kendi satırlarını kendi bağlamında açar. B, A'nın satırını okuyamaz, güncelleyemez, silemez ve
// A adına ekleyemez. Platform bağlamı iki işletmeyi de görür ve yazabilir; bağlamsız sistem işlemi
// 0 satır görür. Bağlantı RLS'e tabi app_user'dır (F1 faz spesifikasyonu §6.12).
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

type Runner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
import { createBusiness, createRefs, newTenant, PLATFORM, type Refs } from './fixtures';

interface TableCase {
  readonly table: string;
  /** Kiracı kolonu (data-model §1.1). */
  readonly column: string;
  /** `owner` işletmesi adına geçerli tek satır ekleyen SQL. */
  readonly insert: (owner: string, refs: Refs) => SQL;
}

const T_TABLES: TableCase[] = [
  {
    table: 'businesses',
    column: 'id',
    insert: (owner, refs) =>
      sql`insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
          values (${owner}, 'X', 'XB', ${refs.regionId}, 'Asia/Baku', 'self_signup')`,
  },
  {
    table: 'business_capabilities',
    column: 'business_id',
    insert: (owner) =>
      sql`insert into business_capabilities (business_id, capability, status)
          values (${owner}, 'buyer', 'approved')`,
  },
  {
    table: 'warehouses',
    column: 'business_id',
    insert: (owner) =>
      sql`insert into warehouses (id, business_id, name) values (${randomUUID()}, ${owner}, 'Depo')`,
  },
  {
    table: 'seller_profiles',
    column: 'business_id',
    insert: (owner) => sql`insert into seller_profiles (business_id) values (${owner})`,
  },
  {
    table: 'buyer_profiles',
    column: 'business_id',
    insert: (owner, refs) =>
      sql`insert into buyer_profiles (business_id, activity_type_id)
          values (${owner}, ${refs.activityTypeId})`,
  },
  {
    table: 'business_privacy',
    column: 'business_id',
    insert: (owner) => sql`insert into business_privacy (business_id) values (${owner})`,
  },
  {
    table: 'person_data',
    column: 'business_id',
    insert: (owner) =>
      sql`insert into person_data (id, business_id, contact_name)
          values (${randomUUID()}, ${owner}, 'Test Şəxs')`,
  },
  {
    table: 'branches',
    column: 'business_id',
    insert: (owner, refs) =>
      sql`insert into branches (id, business_id, name, region_id, address_line)
          values (${randomUUID()}, ${owner}, 'Şube', ${refs.regionId}, 'Bakı')`,
  },
  {
    table: 'service_areas',
    column: 'seller_id',
    insert: (owner, refs) =>
      sql`insert into service_areas (seller_id, region_id) values (${owner}, ${refs.regionId})`,
  },
];

const CASES = T_TABLES.filter((c) => c.table !== 'businesses');

function owned(c: TableCase, owner: string): SQL {
  return sql`${sql.identifier(c.column)} = ${owner}`;
}

async function count(run: Runner, c: TableCase, owner: string): Promise<number> {
  const result = await run((tx) =>
    tx.execute(sql`select 1 from ${sql.identifier(c.table)} where ${owned(c, owner)}`),
  );
  return result.rowCount ?? 0;
}

describe('F1.7 kiracı izolasyonu (T tabloları)', () => {
  let refs: Refs;
  let a: TenantTxContext;
  let b: TenantTxContext;

  beforeAll(async () => {
    const who = await withSystemTx((tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );
    expect(who.rows[0]?.current_user).toBe('app_user');

    refs = await createRefs();
    a = newTenant();
    b = newTenant();
    for (const tenant of [a, b]) {
      await createBusiness(tenant, refs);
      await withTenantTx(tenant, async (tx) => {
        for (const c of CASES) await tx.execute(c.insert(tenant.businessId, refs));
      });
    }
  });

  describe.each(T_TABLES)('$table', (c) => {
    it(`F1.7-AC4: ${c.table} B, A'nın satırını okuyamaz`, async () => {
      expect(await count((fn) => withTenantTx(b, fn), c, a.businessId)).toBe(0);
      expect(await count((fn) => withTenantTx(b, fn), c, b.businessId)).toBeGreaterThan(0);
    });

    it(`F1.7-AC4: ${c.table} B, A'nın satırını güncelleyemez (0 satır)`, async () => {
      const column = sql.identifier(c.column);
      const result = await withTenantTx(b, (tx) =>
        tx.execute(
          sql`update ${sql.identifier(c.table)} set ${column} = ${column} where ${owned(c, a.businessId)}`,
        ),
      );
      expect(result.rowCount).toBe(0);
    });

    it(`F1.7-AC4: ${c.table} B, A'nın satırını silemez (0 satır)`, async () => {
      const result = await withTenantTx(b, (tx) =>
        tx.execute(sql`delete from ${sql.identifier(c.table)} where ${owned(c, a.businessId)}`),
      );
      expect(result.rowCount).toBe(0);
      expect(await count((fn) => withPlatformTx(PLATFORM, fn), c, a.businessId)).toBeGreaterThan(0);
    });

    it(`F1.7-AC4: ${c.table} B, A adına ekleyemez (42501)`, async () => {
      const attempt = withTenantTx(b, (tx) => tx.execute(c.insert(a.businessId, refs)));
      await expect(attempt).rejects.toSatisfy(
        (error: unknown) => pgErrorCode(error) === PG_INSUFFICIENT_PRIVILEGE,
      );
    });

    it(`F1.7-AC4: ${c.table} platform bağlamı A ve B satırlarını okur`, async () => {
      expect(await count((fn) => withPlatformTx(PLATFORM, fn), c, a.businessId)).toBeGreaterThan(0);
      expect(await count((fn) => withPlatformTx(PLATFORM, fn), c, b.businessId)).toBeGreaterThan(0);
    });

    it(`F1.7-AC4: ${c.table} platform bağlamı başka işletmenin satırını günceller`, async () => {
      const column = sql.identifier(c.column);
      const result = await withPlatformTx(PLATFORM, (tx) =>
        tx.execute(
          sql`update ${sql.identifier(c.table)} set ${column} = ${column} where ${owned(c, a.businessId)}`,
        ),
      );
      expect(result.rowCount).toBeGreaterThan(0);
    });

    it(`F1.7-AC4: ${c.table} bağlamsız (withSystemTx) 0 satır görür`, async () => {
      const result = await withSystemTx((tx) =>
        tx.execute(sql`select 1 from ${sql.identifier(c.table)}`),
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it('F1.7-AC4: platform bağlamı yeni işletme ve satırlarını açabilir', async () => {
    const owner = randomUUID();
    await withPlatformTx(PLATFORM, async (tx) => {
      await tx.execute(sql`
        insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
        values (${owner}, 'Admin açılışı', 'XB', ${refs.regionId}, 'Asia/Baku', 'admin')`);
      for (const c of CASES) await tx.execute(c.insert(owner, refs));
    });
    const businesses = T_TABLES[0];
    if (businesses === undefined) throw new Error('businesses durumu yok');
    expect(await count((fn) => withPlatformTx(PLATFORM, fn), businesses, owner)).toBe(1);
  });

  it('F1.7-AC5: işletme businesses tablosunda yalnızca kendi kaydını görür', async () => {
    const result = await withTenantTx(b, (tx) =>
      tx.execute<{ id: string }>(sql`select id from businesses`),
    );
    expect(result.rows.map((row) => row.id)).toEqual([b.businessId]);
  });
});
