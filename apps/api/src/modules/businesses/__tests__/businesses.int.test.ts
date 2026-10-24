// F1.7 entegrasyon testleri: activity_types G kuralı (AC1; check-rls testi core/db/__tests__/check-rls.int.test.ts), seller yeteneği kuralı K1 (AC3), businesses alan
// koruma tetikleyicisi ve bileşik depo FK'sı. Bağlantı RLS'e tabi
// app_user'dır (F1 faz spesifikasyonu §6.12).
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode } from '../../../../test/isolation';
import { type TenantTxContext, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { createBusiness, createRefs, newTenant, PLATFORM, type Refs } from './fixtures';

const PG_FOREIGN_KEY_VIOLATION = '23503';

function hasCode(code: string) {
  return (error: unknown) => pgErrorCode(error) === code;
}

async function capabilityStatus(tenant: TenantTxContext, capability: string) {
  const result = await withPlatformTx(PLATFORM, (tx) =>
    tx.execute<{ status: string }>(sql`
      select status from business_capabilities
       where business_id = ${tenant.businessId} and capability = ${capability}`),
  );
  return result.rows[0]?.status;
}

describe('F1.7 işletme çekirdek tabloları', () => {
  let refs: Refs;

  beforeAll(async () => {
    const who = await withSystemTx((tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );
    expect(who.rows[0]?.current_user).toBe('app_user');
    refs = await createRefs();
  });

  describe('AC1: RLS', () => {
    it('F1.7-AC1: activity_types kiracı bağlamında yazılamaz (42501)', async () => {
      const attempt = withTenantTx(newTenant(), (tx) =>
        tx.execute(sql`insert into activity_types (name) values ('{"az": "X"}'::jsonb)`),
      );
      await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));
    });

    it('F1.7-AC1: activity_types bağlamsız (sistem) yazılamaz, herkes okur', async () => {
      const attempt = withSystemTx((tx) =>
        tx.execute(sql`insert into activity_types (name) values ('{"az": "X"}'::jsonb)`),
      );
      await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));

      const visible = await withTenantTx(newTenant(), (tx) =>
        tx.execute(sql`select id from activity_types where id = ${refs.activityTypeId}`),
      );
      expect(visible.rowCount).toBe(1);
    });

    it('F1.7-AC1: activity_types kiracı bağlamında güncellenemez/silinemez (0 satır)', async () => {
      const counts = await withTenantTx(newTenant(), async (tx) => {
        const updated = await tx.execute(
          sql`update activity_types set sort_order = 9 where id = ${refs.activityTypeId}`,
        );
        const deleted = await tx.execute(
          sql`delete from activity_types where id = ${refs.activityTypeId}`,
        );
        return [updated.rowCount, deleted.rowCount];
      });
      expect(counts).toEqual([0, 0]);
    });
  });

  describe('AC3: seller yeteneği yalnızca platform bağlamında approved (K1)', () => {
    it('F1.7-AC3: kiracı bağlamında seller approved → 42501', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);

      const attempt = withTenantTx(tenant, (tx) =>
        tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                       values (${tenant.businessId}, 'seller', 'approved')`),
      );
      await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));
      expect(await capabilityStatus(tenant, 'seller')).toBeUndefined();
    });

    it('F1.7-AC3: kiracı bağlamında seller suspended → 42501', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);

      const attempt = withTenantTx(tenant, (tx) =>
        tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                       values (${tenant.businessId}, 'seller', 'suspended')`),
      );
      await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));
    });

    it('F1.7-AC3: platform bağlamında seller approved çalışır (ekleme ve pending → approved)', async () => {
      const direct = newTenant();
      await createBusiness(direct, refs);
      await withPlatformTx(PLATFORM, (tx) =>
        tx.execute(sql`insert into business_capabilities
                         (business_id, capability, status, approved_by, approved_at)
                       values (${direct.businessId}, 'seller', 'approved', ${PLATFORM.userId}, now())`),
      );
      expect(await capabilityStatus(direct, 'seller')).toBe('approved');

      const pending = newTenant();
      await createBusiness(pending, refs);
      await withTenantTx(pending, (tx) =>
        tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                       values (${pending.businessId}, 'seller', 'pending')`),
      );
      const updated = await withPlatformTx(PLATFORM, (tx) =>
        tx.execute(sql`update business_capabilities
                          set status = 'approved', approved_by = ${PLATFORM.userId}, approved_at = now()
                        where business_id = ${pending.businessId} and capability = 'seller'`),
      );
      expect(updated.rowCount).toBe(1);
      expect(await capabilityStatus(pending, 'seller')).toBe('approved');
    });

    it('F1.7-AC3: kiracı seller pending ekleyebilir', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);
      await withTenantTx(tenant, (tx) =>
        tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                       values (${tenant.businessId}, 'seller', 'pending')`),
      );
      expect(await capabilityStatus(tenant, 'seller')).toBe('pending');
    });

    it('F1.7-AC3: buyer için kural yok (kiracı buyer approved ekleyebilir)', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);
      await withTenantTx(tenant, (tx) =>
        tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                       values (${tenant.businessId}, 'buyer', 'approved')`),
      );
      expect(await capabilityStatus(tenant, 'buyer')).toBe('approved');
    });

    it('F1.7-AC3: kiracı onaylayan alanlarını dolduramaz → 42501', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);
      const attempt = withTenantTx(tenant, (tx) =>
        tx.execute(sql`insert into business_capabilities
                         (business_id, capability, status, approved_by, approved_at)
                       values (${tenant.businessId}, 'buyer', 'approved', ${randomUUID()}, now())`),
      );
      await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));
    });

    it('F1.7-AC3: kiracı yetenek satırını güncelleyemez/silemez (pending → approved dahil, 0 satır)', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);
      await withTenantTx(tenant, (tx) =>
        tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                       values (${tenant.businessId}, 'seller', 'pending')`),
      );
      const counts = await withTenantTx(tenant, async (tx) => {
        const updated = await tx.execute(sql`
          update business_capabilities set status = 'approved'
           where business_id = ${tenant.businessId} and capability = 'seller'`);
        const deleted = await tx.execute(sql`
          delete from business_capabilities where business_id = ${tenant.businessId}`);
        return [updated.rowCount, deleted.rowCount];
      });
      expect(counts).toEqual([0, 0]);
      expect(await capabilityStatus(tenant, 'seller')).toBe('pending');
    });

    it('F1.7-AC3: buyer askıya alma da yalnızca platformda (kiracı buyer suspended → 42501)', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);
      const attempt = withTenantTx(tenant, (tx) =>
        tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                       values (${tenant.businessId}, 'buyer', 'suspended')`),
      );
      await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));
    });
  });

  describe('businesses alan koruması (status, verified_*, created_via)', () => {
    it('F1.7: kiracı askıya alınmış veya admin kaynaklı işletme ekleyemez → 42501', async () => {
      for (const values of [sql`'suspended', 'self_signup'`, sql`'active', 'admin'`]) {
        const tenant = newTenant();
        const attempt = withTenantTx(tenant, (tx) =>
          tx.execute(sql`
            insert into businesses
              (id, legal_name, country_code, region_id, timezone, status, created_via)
            values (${tenant.businessId}, 'X', 'XB', ${refs.regionId}, 'Asia/Baku', ${values})`),
        );
        await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));
      }
    });

    it('F1.7: kiracı status / verified_at / verified_by / created_via değiştiremez → 42501', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);
      const changes = [
        sql`update businesses set status = 'suspended' where id = ${tenant.businessId}`,
        sql`update businesses set verified_at = now() where id = ${tenant.businessId}`,
        sql`update businesses set verified_by = ${randomUUID()} where id = ${tenant.businessId}`,
        sql`update businesses set created_via = 'admin' where id = ${tenant.businessId}`,
      ];
      for (const change of changes) {
        const attempt = withTenantTx(tenant, (tx) => tx.execute(change));
        await expect(attempt).rejects.toSatisfy(hasCode(PG_INSUFFICIENT_PRIVILEGE));
      }
    });

    it('F1.7: kiracı diğer alanları güncelleyebilir; platform korumalı alanları değiştirebilir', async () => {
      const tenant = newTenant();
      await createBusiness(tenant, refs);
      const own = await withTenantTx(tenant, (tx) =>
        tx.execute(
          sql`update businesses set legal_name = 'Yeni Ünvan' where id = ${tenant.businessId}`,
        ),
      );
      expect(own.rowCount).toBe(1);

      const platform = await withPlatformTx(PLATFORM, (tx) =>
        tx.execute(sql`update businesses
                          set status = 'suspended', verified_at = now(), verified_by = ${PLATFORM.userId}
                        where id = ${tenant.businessId}`),
      );
      expect(platform.rowCount).toBe(1);
    });

    it('F1.7: tetikleyici fonksiyonu sabit search_path taşır, PUBLIC çalıştıramaz', async () => {
      const result = await withSystemTx((tx) =>
        tx.execute<{ proconfig: string[] | null; prosecdef: boolean; public_exec: boolean }>(sql`
          select p.proconfig, p.prosecdef,
                 has_function_privilege('public', p.oid, 'EXECUTE') as public_exec
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'businesses_guard_platform_columns'`),
      );
      const row = result.rows[0];
      expect(row?.proconfig).toContain('search_path=pg_catalog, public, pg_temp');
      expect(row?.prosecdef).toBe(false);
      expect(row?.public_exec).toBe(false);
    });
  });

  describe('seller_profiles.default_warehouse_id bileşik FK', () => {
    it('F1.7: başka işletmenin deposu varsayılan depo olamaz (23503); kendi deposu olur', async () => {
      const a = newTenant();
      const b = newTenant();
      await createBusiness(a, refs);
      await createBusiness(b, refs);
      const ownWarehouse = randomUUID();
      const foreignWarehouse = randomUUID();
      await withTenantTx(a, (tx) =>
        tx.execute(sql`insert into warehouses (id, business_id, name)
                       values (${ownWarehouse}, ${a.businessId}, 'A deposu')`),
      );
      await withTenantTx(b, (tx) =>
        tx.execute(sql`insert into warehouses (id, business_id, name)
                       values (${foreignWarehouse}, ${b.businessId}, 'B deposu')`),
      );

      const attempt = withTenantTx(a, (tx) =>
        tx.execute(sql`insert into seller_profiles (business_id, default_warehouse_id)
                       values (${a.businessId}, ${foreignWarehouse})`),
      );
      await expect(attempt).rejects.toSatisfy(hasCode(PG_FOREIGN_KEY_VIOLATION));

      const own = await withTenantTx(a, (tx) =>
        tx.execute(sql`insert into seller_profiles (business_id, default_warehouse_id)
                       values (${a.businessId}, ${ownWarehouse})`),
      );
      expect(own.rowCount).toBe(1);
    });
  });
});
