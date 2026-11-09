// F1.8-AC7 kiracı izolasyonu (access). T tabloları: roles, role_permissions, memberships,
// membership_regions, invitations. Kiracı yalnızca kendi satırını görür ve yazar; B, A'nınkini
// göremez ve A adına yazamaz; bağlamsız işlem 0 satır görür; platform her şeyi görür. Bileşik FK:
// B kendi üyeliğine A'nın rolünü bağlayamaz. list_my_memberships(): kullanıcı yalnızca kendi
// üyeliklerini görür (Mimar K1). G tabloları: herkes okur, kiracı yazamaz.
// Bağlantı RLS'e tabi app_user'dır (F1 faz spesifikasyonu §6.12).
import { randomBytes, randomUUID } from 'node:crypto';
import { type SQL, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { insertTestUsers, randomTestPhone } from '../../../../test/users';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx, withUserTx } from '../../../core/db';
import { AccessRepository } from '../access.repository';
import {
  type AccessServices,
  addMember,
  type AdminSetup,
  adminSetup,
  createServices,
  ids,
  runAccessSeed,
  testRefs,
} from './fixtures';

type Runner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

const PG_FOREIGN_KEY_VIOLATION = '23503';

async function rejected(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => pgErrorCode(error),
  );
}

interface Fixture {
  readonly owner: AdminSetup;
  readonly membershipId: string;
  readonly regionId: string;
}

interface TableCase {
  readonly table: string;
  /** `owner` satırlarını seçen koşul. */
  readonly filter: (f: Fixture) => SQL;
  /** `owner` adına yeni satır ekleyen sorgu. */
  readonly insert: (f: Fixture) => SQL;
}

const T_TABLES: TableCase[] = [
  {
    table: 'roles',
    filter: (f) => sql`business_id = ${f.owner.tenant.businessId}`,
    insert: (f) => sql`insert into roles (id, business_id, name, capability)
      values (${randomUUID()}, ${f.owner.tenant.businessId}, '{"az":"X"}'::jsonb, 'seller')`,
  },
  {
    table: 'role_permissions',
    filter: (f) => sql`role_id = ${f.owner.staffRoleId}`,
    insert: (f) => sql`insert into role_permissions (role_id, permission_code, scope)
      values (${f.owner.staffRoleId}, 'catalog.manage', 'all')`,
  },
  {
    table: 'memberships',
    filter: (f) => sql`business_id = ${f.owner.tenant.businessId}`,
    insert: (f) => sql`insert into memberships (id, user_id, business_id, role_id, job_title_id)
      values (${randomUUID()}, ${f.owner.tenant.userId}, ${f.owner.tenant.businessId},
              ${f.owner.staffRoleId}, ${f.owner.staffTitleId})`,
  },
  {
    table: 'membership_regions',
    filter: (f) => sql`membership_id = ${f.membershipId}`,
    insert: (f) => sql`insert into membership_regions (membership_id, region_id)
      values (${f.membershipId}, ${f.regionId})
      on conflict do nothing`,
  },
  {
    table: 'invitations',
    filter: (f) => sql`business_id = ${f.owner.tenant.businessId}`,
    insert: (f) => sql`insert into invitations
        (id, business_id, phone_e164, role_id, job_title_id, token_hash, expires_at, created_by)
      values (${randomUUID()}, ${f.owner.tenant.businessId}, ${randomTestPhone()},
              ${f.owner.staffRoleId}, ${f.owner.staffTitleId},
              ${randomBytes(32).toString('hex')}, now() + interval '7 days',
              ${f.owner.tenant.userId})`,
  },
];

function select1(item: TableCase, f: Fixture): SQL {
  return sql`select 1 from ${sql.identifier(item.table)} where ${item.filter(f)}`;
}

async function count(run: Runner, query: SQL): Promise<number> {
  const result = await run((tx) => tx.execute(query));
  return result.rowCount ?? 0;
}

describe('F1.8-AC7 kiracı izolasyonu (access)', () => {
  let services: AccessServices;
  let a: Fixture;
  let b: Fixture;
  let asA: Runner;
  let asB: Runner;
  let asPlatform: Runner;

  beforeAll(async () => {
    const who = await withSystemTx((tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );
    expect(who.rows[0]?.current_user).toBe('app_user');
    await runAccessSeed();
    services = createServices();
    const { regionId } = await testRefs();

    const make = async (): Promise<Fixture> => {
      const owner = await adminSetup(services);
      await addMember(owner.tenant, owner.adminRoleId, owner.adminTitleId, owner.tenant.userId);
      const staff = await addMember(owner.tenant, owner.staffRoleId, owner.staffTitleId);
      const fixture = { owner, membershipId: staff.membershipId, regionId };
      // Her T tablosunda en az bir satır olsun.
      await withTenantTx(owner.tenant, async (tx) => {
        for (const item of T_TABLES) {
          if (item.table === 'memberships' || item.table === 'role_permissions') continue;
          await tx.execute(item.insert(fixture));
        }
      });
      return fixture;
    };
    a = await make();
    b = await make();
    asA = (fn) => withTenantTx(a.owner.tenant, fn);
    asB = (fn) => withTenantTx(b.owner.tenant, fn);
    asPlatform = (fn) => withPlatformTx({ userId: a.owner.tenant.userId }, fn);
  });

  for (const item of T_TABLES) {
    describe(item.table, () => {
      it(`F1.8-AC7: ${item.table} kiracı kendi satırını görür, B görmez`, async () => {
        expect(await count(asA, select1(item, a))).toBeGreaterThan(0);
        expect(await count(asB, select1(item, a))).toBe(0);
        expect(await count(asA, select1(item, b))).toBe(0);
      });

      it(`F1.8-AC7: ${item.table} B, A adına yazamaz`, async () => {
        expect(await rejected(asB((tx) => tx.execute(item.insert(a))))).toBe(
          PG_INSUFFICIENT_PRIVILEGE,
        );
      });

      it(`F1.8-AC7: ${item.table} B, A'nın satırını güncelleyemez ve silemez (0 satır)`, async () => {
        const where = select1(item, a);
        const target = await count(asA, where);
        expect(target).toBeGreaterThan(0);
        const table = sql.identifier(item.table);
        const del = await asB((tx) =>
          tx.execute(sql`delete from ${table} where ${item.filter(a)}`),
        );
        expect(del.rowCount ?? 0).toBe(0);
        if (item.table !== 'role_permissions' && item.table !== 'membership_regions') {
          const upd = await asB((tx) =>
            tx.execute(sql`update ${table} set business_id = business_id where ${item.filter(a)}`),
          );
          expect(upd.rowCount ?? 0).toBe(0);
        }
        expect(await count(asA, where)).toBe(target);
      });

      it(`F1.8-AC7: ${item.table} bağlamsız 0 satır, platform görür`, async () => {
        expect(await count((fn) => withSystemTx(fn), select1(item, a))).toBe(0);
        expect(await count(asPlatform, select1(item, a))).toBeGreaterThan(0);
      });
    });
  }

  it("F1.8-AC7: bileşik FK — B kendi üyeliğine A'nın rolünü bağlayamaz", async () => {
    const newUserId = randomUUID();
    await insertTestUsers(newUserId);
    const code = await rejected(
      asB((tx) =>
        tx.execute(sql`insert into memberships (id, user_id, business_id, role_id, job_title_id)
          values (${randomUUID()}, ${newUserId}, ${b.owner.tenant.businessId},
                  ${a.owner.staffRoleId}, ${b.owner.staffTitleId})`),
      ),
    );
    expect(code).toBe(PG_FOREIGN_KEY_VIOLATION);
  });

  describe('elle yazılan SQL bekçileri (review-guide T6, T7)', () => {
    const TABLES = [
      'permissions',
      'role_templates',
      'role_template_permissions',
      'job_titles',
      'roles',
      'role_permissions',
      'memberships',
      'membership_regions',
      'invitations',
    ];

    it('F1.8-AC7: yetkiler — app_user SELECT/INSERT/UPDATE/DELETE, readonly yalnız SELECT, PUBLIC hiç', async () => {
      const rows = await queryAsOwner<{
        t: string;
        app_crud: boolean;
        app_truncate: boolean;
        ro_select: boolean;
        ro_write: boolean;
        public_any: boolean;
        public_columns: boolean;
      }>(
        `select t,
                has_table_privilege('app_user', t, 'SELECT, INSERT, UPDATE, DELETE')
                  and has_table_privilege('app_user', t, 'SELECT')
                  and has_table_privilege('app_user', t, 'INSERT')
                  and has_table_privilege('app_user', t, 'UPDATE')
                  and has_table_privilege('app_user', t, 'DELETE') as app_crud,
                has_table_privilege('app_user', t, 'TRUNCATE') as app_truncate,
                has_table_privilege('readonly', t, 'SELECT') as ro_select,
                has_table_privilege('readonly', t, 'INSERT, UPDATE, DELETE') as ro_write,
                has_table_privilege('public', t, 'SELECT, INSERT, UPDATE, DELETE') as public_any,
                has_any_column_privilege('public', t, 'SELECT, INSERT, UPDATE') as public_columns
           from unnest($1::text[]) as t`,
        [TABLES],
      );
      expect(rows).toHaveLength(TABLES.length);
      for (const row of rows) {
        expect(row, row.t).toMatchObject({
          app_crud: true,
          app_truncate: false,
          ro_select: true,
          ro_write: false,
          public_any: false,
          public_columns: false,
        });
      }
    });

    it("F1.8-AC7: politikalar ve bileşik FK'lar yerinde; TO migrator politikası yalnız migrator için", async () => {
      const policies = await queryAsOwner<{ tablename: string; policyname: string; roles: string }>(
        `select tablename, policyname, array_to_string(roles, ',') as roles
           from pg_policies where tablename = any($1::text[]) order by tablename, policyname`,
        [TABLES],
      );
      const names = policies.map((p) => `${p.tablename}.${p.policyname}`);
      for (const t of ['roles', 'memberships', 'invitations']) {
        expect(names).toContain(`${t}.${t}_tenant`);
        expect(names).toContain(`${t}.${t}_platform`);
      }
      expect(names).toContain('role_permissions.role_permissions_parent');
      expect(names).toContain('membership_regions.membership_regions_parent');
      // SECURITY DEFINER fonksiyonları için yalnız migrator'a açık politikalar (bilinçli liste):
      // list_my_memberships (F1.8a), invitation_accept (F2.1a, 0013), dizin tam eşleşmesi
      // (F2.11a, 0020: admin giriş telefonu için üyelik ve rol okuması).
      const definerPolicies = [
        'memberships_self_definer',
        'memberships_definer_insert',
        'memberships_definer_update',
        'memberships_definer_select',
        'roles_definer_select',
        'invitations_definer_select',
        'invitations_definer_update',
      ];
      for (const name of definerPolicies) {
        expect(policies.find((p) => p.policyname === name)?.roles, name).toBe('migrator');
      }
      for (const p of policies.filter((item) => !definerPolicies.includes(item.policyname))) {
        expect(p.roles, p.policyname).toBe('public');
      }

      const fks = await queryAsOwner<{ conname: string; cols: string }>(
        `select conname, pg_get_constraintdef(oid) as cols from pg_constraint
          where contype = 'f' and conname = any($1::text[]) order by conname`,
        [
          [
            'invitations_branch_fk',
            'invitations_role_fk',
            'invitations_warehouse_fk',
            'memberships_branch_fk',
            'memberships_role_fk',
            'memberships_warehouse_fk',
          ],
        ],
      );
      expect(fks).toHaveLength(6);
      for (const fk of fks) {
        expect(fk.cols, fk.conname).toMatch(/^FOREIGN KEY \(business_id, \w+_id\) REFERENCES/);
      }
    });

    it('F1.8-AC7: son admin tetikleyicileri SECURITY INVOKER, search_path pg_temp sonda', async () => {
      const rows = await queryAsOwner<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
        `select proname, prosecdef, proconfig from pg_proc
          where proname = any($1::text[]) order by proname`,
        [
          [
            'access_assert_business_has_admin',
            'memberships_last_admin_guard',
            'roles_last_admin_guard',
          ],
        ],
      );
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.prosecdef, row.proname).toBe(false);
        expect(row.proconfig).toContain('search_path=pg_catalog, public, pg_temp');
      }
    });
  });

  describe('list_my_memberships (Mimar K1)', () => {
    it('F1.8-AC7: kullanıcı tüm işletmelerdeki kendi aktif üyeliklerini görür, başkasınınkini görmez', async () => {
      const userId = randomUUID();
      const inA = await addMember(
        a.owner.tenant,
        a.owner.staffRoleId,
        a.owner.staffTitleId,
        userId,
      );
      const inB = await addMember(
        b.owner.tenant,
        b.owner.staffRoleId,
        b.owner.staffTitleId,
        userId,
      );
      const repository = new AccessRepository();

      const mine = await services.memberships.listMine(userId);
      expect(mine.map((m) => m.membershipId).sort()).toEqual(
        [inA.membershipId, inB.membershipId].sort(),
      );
      // Kiracı A bağlamında çağrılsa da yalnızca app.user_id'nin satırları.
      const inTenant = await withTenantTx({ businessId: a.owner.tenant.businessId, userId }, (tx) =>
        repository.listMyMemberships(tx),
      );
      expect(inTenant).toHaveLength(2);
      const other = await services.memberships.listMine(randomUUID());
      expect(other).toHaveLength(0);
      const none = await withSystemTx((tx) => repository.listMyMemberships(tx));
      expect(none).toHaveLength(0);
    });

    it('F1.8-AC7: T kuralı saf — kullanıcı bağlamında memberships doğrudan okunamaz', async () => {
      const userId = randomUUID();
      await addMember(a.owner.tenant, a.owner.staffRoleId, a.owner.staffTitleId, userId);
      const direct = await withUserTx({ userId }, (tx) =>
        tx.execute(sql`select 1 from memberships where user_id = ${userId}`),
      );
      expect(direct.rowCount ?? 0).toBe(0);
      // Tenant B bağlamında aynı kullanıcı A'daki üyeliğini doğrudan göremez.
      const fromB = await withTenantTx({ businessId: b.owner.tenant.businessId, userId }, (tx) =>
        tx.execute(sql`select 1 from memberships where user_id = ${userId}`),
      );
      expect(fromB.rowCount ?? 0).toBe(0);
    });

    it('F1.8-AC7: removed üyelik listede yok', async () => {
      const userId = randomUUID();
      const m = await addMember(a.owner.tenant, a.owner.staffRoleId, a.owner.staffTitleId, userId);
      await withTenantTx(a.owner.tenant, (tx) =>
        tx.execute(sql`update memberships set status = 'removed' where id = ${m.membershipId}`),
      );
      expect(await services.memberships.listMine(userId)).toHaveLength(0);
    });
  });

  describe('G tabloları', () => {
    const G_INSERTS: Record<string, () => SQL> = {
      permissions: () => sql`insert into permissions (code, capability, module)
        values (${`x.${randomUUID()}`}, 'any', 'x')`,
      role_templates: () => sql`insert into role_templates (id, code, name, capability)
        values (${ids.next()}, ${`x_${randomUUID()}`}, '{}'::jsonb, 'seller')`,
      job_titles: () => sql`insert into job_titles (id, code, name, capability)
        values (${ids.next()}, ${`x_${randomUUID()}`}, '{}'::jsonb, 'seller')`,
      role_template_permissions: () => sql`insert into role_template_permissions
          (template_id, permission_code, default_scope)
        select id, 'catalog.manage', 'all' from role_templates where code = 'seller_courier'`,
    };

    for (const [table, insert] of Object.entries(G_INSERTS)) {
      it(`F1.8-AC7: ${table} herkes okur, kiracı yazamaz`, async () => {
        const read = await asA((tx) =>
          tx.execute(sql`select 1 from ${sql.identifier(table)} limit 1`),
        );
        expect(read.rowCount ?? 0).toBe(1);
        expect(await rejected(asA((tx) => tx.execute(insert())))).toBe(PG_INSUFFICIENT_PRIVILEGE);
        const updated = await asA((tx) =>
          tx.execute(
            sql`update ${sql.identifier(table)} set ${sql.raw(
              table === 'role_template_permissions' ? 'default_scope' : 'capability',
            )} = ${sql.raw(table === 'role_template_permissions' ? 'default_scope' : 'capability')}`,
          ),
        );
        expect(updated.rowCount ?? 0).toBe(0);
      });
    }
  });
});
