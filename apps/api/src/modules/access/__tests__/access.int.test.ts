// F1.8a entegrasyon testleri: son admin koruması (F1.8-AC4, US-013 AC3), rol değişikliği audit'i
// (US-013 AC4), şablon güncellemesinin kopyayı değiştirmemesi (US-012 AC2), izin seed'i (F1.8-AC6).
// Bağlantı RLS'e tabi app_user'dır (F1 faz spesifikasyonu §6.12).
import { PERMISSION_CODES, PERMISSIONS, permissionModule } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { queryAsOwner } from '../../../../test/isolation';
import { withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import { AccessRepository, mapLastAdminError } from '../access.repository';
import { SEED_ROLE_TEMPLATES } from '../seed/role-templates';
import {
  type AccessServices,
  addMember,
  type AdminSetup,
  adminSetup,
  clock,
  createServices,
  runAccessSeed,
  templateRefs,
} from './fixtures';

const repository = new AccessRepository();
type Client = Awaited<ReturnType<typeof connectAsAppUser>>;

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => (error instanceof DomainError ? error.code : String(error)),
  );
}

async function membershipStatus(setup: AdminSetup, membershipId: string): Promise<string> {
  const rows = await withTenantTx(setup.tenant, (tx) =>
    tx.execute<{ status: string; role_id: string }>(
      sql`select status, role_id from memberships where id = ${membershipId}`,
    ),
  );
  return rows.rows[0]?.status ?? 'missing';
}

describe('access (F1.8a)', () => {
  let services: AccessServices;

  beforeAll(async () => {
    const who = await withSystemTx((tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );
    expect(who.rows[0]?.current_user).toBe('app_user');
    await runAccessSeed();
    services = createServices();
  });

  describe('F1.8-AC4 son admin koruması', () => {
    it('F1.8-AC4: tek admin kendini kaldıramaz', async () => {
      const setup = await adminSetup(services);
      const admin = await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);

      const code = await errorCode(
        withTenantTx(setup.tenant, (tx) =>
          repository.removeMembership(tx, admin.membershipId, clock.now()),
        ),
      );
      expect(code).toBe('LAST_ADMIN_PROTECTED');
      const deleted = await errorCode(
        withTenantTx(setup.tenant, (tx) =>
          mapLastAdminError(
            tx.execute(sql`delete from memberships where id = ${admin.membershipId}`),
          ),
        ),
      );
      expect(deleted).toBe('LAST_ADMIN_PROTECTED');
      expect(await membershipStatus(setup, admin.membershipId)).toBe('active');
    });

    it('F1.8-AC4: tek admin rolünü düşüremez', async () => {
      const setup = await adminSetup(services);
      const admin = await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);

      const code = await errorCode(
        services.memberships.changeRole(
          { businessId: setup.tenant.businessId, userId: admin.userId },
          { membershipId: admin.membershipId, roleId: setup.staffRoleId },
        ),
      );
      expect(code).toBe('LAST_ADMIN_PROTECTED');
    });

    it('F1.8-AC4: son admin rolünün admin bayrağı kapatılamaz', async () => {
      const setup = await adminSetup(services);
      await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);

      const code = await errorCode(
        withTenantTx(setup.tenant, (tx) =>
          mapLastAdminError(
            tx.execute(
              sql`update roles set is_business_admin = false where id = ${setup.adminRoleId}`,
            ),
          ),
        ),
      );
      expect(code).toBe('LAST_ADMIN_PROTECTED');
    });

    it('F1.8-AC4: ikinci admin varken çalışır', async () => {
      const setup = await adminSetup(services);
      const first = await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);
      await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);

      await withTenantTx(setup.tenant, (tx) =>
        repository.removeMembership(tx, first.membershipId, clock.now()),
      );
      expect(await membershipStatus(setup, first.membershipId)).toBe('removed');
    });

    it('F1.8-AC4: admin olmayan üye kaldırılabilir', async () => {
      const setup = await adminSetup(services);
      await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);
      const staff = await addMember(setup.tenant, setup.staffRoleId, setup.staffTitleId);

      await withTenantTx(setup.tenant, (tx) =>
        repository.removeMembership(tx, staff.membershipId, clock.now()),
      );
      expect(await membershipStatus(setup, staff.membershipId)).toBe('removed');
    });

    it('F1.8-AC4: eşzamanlı iki admin kaldırma — biri reddedilir', async () => {
      const setup = await adminSetup(services);
      const first = await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);
      const second = await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId);
      const c1 = await connectAsAppUser();
      const c2 = await connectAsAppUser();
      const begin = async (client: Client) => {
        await client.query('begin');
        await client.query(
          "select set_config('app.business_id', $1, true), set_config('app.user_id', $2, true)",
          [setup.tenant.businessId, setup.tenant.userId],
        );
      };
      const remove = "update memberships set status = 'removed' where id = $1";
      try {
        await begin(c1);
        await begin(c2);
        await c1.query(remove, [first.membershipId]);
        const pending = c2.query(remove, [second.membershipId]).then(
          () => 'ok',
          (error: unknown) => (error as { code?: string }).code ?? 'error',
        );
        // c2, c1'in tuttuğu işletme kilidini beklemeli (yarış gerçekten oluşsun).
        for (let i = 0; i < 100; i++) {
          const waiting = await queryAsOwner<{ n: string }>(
            "select count(*)::text as n from pg_locks where locktype = 'advisory' and not granted",
          );
          if (waiting[0]?.n !== '0') break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await c1.query('commit');
        expect(await pending).toBe('AC001');
        await c2.query('rollback');
      } finally {
        await c1.end();
        await c2.end();
      }
      expect(await membershipStatus(setup, first.membershipId)).toBe('removed');
      expect(await membershipStatus(setup, second.membershipId)).toBe('active');
    });
  });

  describe('US-013 AC4 rol değişikliği audit', () => {
    it('US-013 AC4: audit kim, kime, eski ve yeni rol; outbox membership.role_changed', async () => {
      const setup = await adminSetup(services);
      await addMember(setup.tenant, setup.adminRoleId, setup.adminTitleId, setup.tenant.userId);
      const target = await addMember(setup.tenant, setup.staffRoleId, setup.staffTitleId);
      const courier = await templateRefs('seller_courier');
      const newRoleId = await services.roles.createFromTemplate(setup.tenant, courier.templateId);

      await services.memberships.changeRole(setup.tenant, {
        membershipId: target.membershipId,
        roleId: newRoleId,
      });

      const audit = await queryAsOwner<{
        actor_user_id: string;
        business_id: string;
        before: { userId: string; roleId: string };
        after: { userId: string; roleId: string };
      }>(
        `select actor_user_id, business_id, before, after from audit_logs
          where action = 'membership.role_changed' and target_type = 'membership'
            and target_id = $1`,
        [target.membershipId],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actor_user_id).toBe(setup.tenant.userId);
      expect(audit[0]?.business_id).toBe(setup.tenant.businessId);
      expect(audit[0]?.before).toEqual({ userId: target.userId, roleId: setup.staffRoleId });
      expect(audit[0]?.after).toEqual({ userId: target.userId, roleId: newRoleId });

      const events = await queryAsOwner<{ payload: Record<string, string> }>(
        `select payload from outbox_events
          where type = 'membership.role_changed' and aggregate_id = $1`,
        [target.membershipId],
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toEqual({
        membershipId: target.membershipId,
        userId: target.userId,
        oldRoleId: setup.staffRoleId,
        newRoleId,
      });
    });

    it('US-013 AC4: başka işletmenin rolü atanamaz (404), audit yazılmaz', async () => {
      const a = await adminSetup(services);
      const b = await adminSetup(services);
      const target = await addMember(a.tenant, a.staffRoleId, a.staffTitleId);

      const code = await errorCode(
        services.memberships.changeRole(a.tenant, {
          membershipId: target.membershipId,
          roleId: b.staffRoleId,
        }),
      );
      expect(code).toBe('NOT_FOUND');
      const audit = await queryAsOwner(
        "select 1 from audit_logs where action = 'membership.role_changed' and target_id = $1",
        [target.membershipId],
      );
      expect(audit).toHaveLength(0);
    });
  });

  describe('US-012 AC2 şablon kopyası', () => {
    it('US-012 AC2: şablon güncellemesi kopyalanmış işletme rolünü değiştirmez', async () => {
      const setup = await adminSetup(services);
      const rep = await templateRefs('seller_sales_rep');
      const before = await withTenantTx(setup.tenant, (tx) =>
        tx.execute<{ permission_code: string; scope: string }>(sql`
          select permission_code, scope from role_permissions where role_id = ${setup.staffRoleId}
          order by permission_code`),
      );
      expect(before.rows.length).toBeGreaterThan(0);

      // Platform şablonu günceller (izin ekler, kapsam değiştirir, sürüm artar); işlem geri alınır
      // ki diğer testler seed şablonunu değişmemiş görsün.
      const rollback = new Error('rollback');
      await withPlatformTx({ userId: setup.tenant.userId }, async (tx) => {
        await tx.execute(sql`update role_templates set version = version + 1
                              where id = ${rep.templateId}`);
        await tx.execute(sql`update role_template_permissions set default_scope = 'all'
                              where template_id = ${rep.templateId}`);
        await tx.execute(sql`insert into role_template_permissions
                               (template_id, permission_code, default_scope)
                             values (${rep.templateId}, 'catalog.manage', 'all')`);
        const after = await tx.execute<{ permission_code: string; scope: string }>(sql`
          select permission_code, scope from role_permissions where role_id = ${setup.staffRoleId}
          order by permission_code`);
        expect(after.rows).toEqual(before.rows);
        const role = await tx.execute<{ source_template_version: number }>(sql`
          select source_template_version from roles where id = ${setup.staffRoleId}`);
        expect(role.rows[0]?.source_template_version).toBe(1);
        throw rollback;
      }).catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
    });

    it('US-012 AC2: kopya şablonun izinlerini ve kaynağını taşır', async () => {
      const setup = await adminSetup(services);
      const rows = await withTenantTx(setup.tenant, (tx) =>
        tx.execute<{ permission_code: string; scope: string }>(sql`
          select permission_code, scope from role_permissions where role_id = ${setup.staffRoleId}`),
      );
      const expected = SEED_ROLE_TEMPLATES.find((t) => t.code === 'seller_sales_rep');
      expect(Object.fromEntries(rows.rows.map((r) => [r.permission_code, r.scope]))).toEqual(
        expected?.permissions,
      );
    });
  });

  describe('F1.8-AC6 izin seed', () => {
    it('F1.8-AC6: seed edilen permissions satırları = permissions.ts', async () => {
      const rows = await withSystemTx((tx) =>
        tx.execute<{ code: string; capability: string; module: string }>(
          sql`select code, capability, module from permissions order by code`,
        ),
      );
      const expected = [...PERMISSION_CODES].sort().map((code) => ({
        code,
        capability: PERMISSIONS[code].capability,
        module: permissionModule(code),
      }));
      expect(rows.rows).toEqual(expected);
    });

    it('F1.8-AC6: seed şablonları = role-templates.ts ve ikinci çalıştırma satır eklemez', async () => {
      expect(await runAccessSeed()).toBe(0);
      const rows = await withSystemTx((tx) =>
        tx.execute<{ code: string; permission_code: string; default_scope: string }>(sql`
          select t.code, p.permission_code, p.default_scope
            from role_templates t join role_template_permissions p on p.template_id = t.id`),
      );
      for (const template of SEED_ROLE_TEMPLATES) {
        const own = rows.rows.filter((row) => row.code === template.code);
        expect(Object.fromEntries(own.map((r) => [r.permission_code, r.default_scope]))).toEqual(
          template.permissions,
        );
      }
    });
  });
});
