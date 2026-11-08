// F2.8 (US-014): şablondan işletmeye özel rol, düzenleme, izin önbelleği (R22), yetki yükseltme
// koruması (Müfettiş 11 R3) ve şablon kopyası kısmi tekil indeksi (Müfettiş 12 notu). İşletmeler
// F2.7 fikstürüyle; uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { permissionCacheKey } from '../permission.cache';
import {
  addMemberFromTemplate,
  newTestBusiness,
  platformRows,
  roleFromTemplate,
  runTeamSeeds,
  TeamHttp,
} from './team-fixtures';

interface Who {
  readonly userId: string;
  readonly businessId: string;
  readonly auth: Record<string, string>;
}

interface RoleJson {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly capability: string;
  readonly isBusinessAdmin: boolean;
  readonly isCustom: boolean;
  readonly sourceTemplateId: string | null;
  readonly permissions: { code: string; scope: string }[];
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

const MANAGER_PERMS = [
  { code: 'team.manage', scope: 'all' },
  { code: 'catalog.view', scope: 'all' },
  { code: 'orders.view', scope: 'assigned' },
];

describe('F2.8 işletmeye özel rol (US-014)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TeamHttp;

  beforeAll(async () => {
    await runTeamSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TeamHttp(app);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const http = () => h.http();

  async function as(userId: string, businessId: string): Promise<Who> {
    const bearer = await h.bearer(userId);
    return { userId, businessId, auth: { ...bearer, 'X-Business-Id': businessId } };
  }

  async function admin(capability: 'seller' | 'buyer' = 'seller'): Promise<Who> {
    const business = await newTestBusiness(capability);
    return await as(business.adminUserId, business.businessId);
  }

  async function templateId(code: string): Promise<string> {
    const [row] = await platformRows<{ id: string }>(
      'select id from role_templates where code = $1',
      [code],
    );
    if (row === undefined) throw new Error(`şablon yok: ${code}`);
    return row.id;
  }

  const createRole = (who: Who, body: object) =>
    http().post('/api/v1/team/roles').set(who.auth).send(body);
  const patchRole = (who: Who, id: string, body: object) =>
    http().patch(`/api/v1/team/roles/${id}`).set(who.auth).send(body);
  const roles = (who: Who) => http().get('/api/v1/team/roles').set(who.auth);
  const patchMember = (who: Who, id: string, body: object) =>
    http().patch(`/api/v1/team/members/${id}`).set(who.auth).send(body);

  async function membershipOf(businessId: string, userId: string): Promise<string> {
    const [row] = await platformRows<{ id: string }>(
      'select id from memberships where business_id = $1 and user_id = $2',
      [businessId, userId],
    );
    if (row === undefined) throw new Error('üyelik yok');
    return row.id;
  }

  /** Admin, `team.manage` içeren özel rolü açar ve yeni bir üyeye atar (admin olmayan yönetici). */
  async function manager(who: Who, permissions = MANAGER_PERMS) {
    const created = await createRole(who, {
      templateId: await templateId('seller_sales_manager'),
      name: { az: 'Komanda meneceri' },
      permissions,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const role = created.body as RoleJson;
    const userId = await addMemberFromTemplate(who.businessId, 'seller_sales_rep');
    const membershipId = await membershipOf(who.businessId, userId);
    const assigned = await patchMember(who, membershipId, { roleId: role.id });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    return { role, membershipId, who: await as(userId, who.businessId) };
  }

  describe('AC1 şablondan özel rol', () => {
    it('US-014-AC1 şablondan özel rol açılır, izinler istekteki gibi; listede ve audit’te görünür', async () => {
      const who = await admin();
      const source = await templateId('seller_sales_manager');
      const response = await createRole(who, {
        templateId: source,
        name: { az: '  Kiçik menecer ', ru: 'Младший менеджер' },
        permissions: [
          { code: 'catalog.view', scope: 'all' },
          { code: 'orders.view', scope: 'assigned' },
          { code: 'reports.view', scope: 'all' },
        ],
      });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const role = response.body as RoleJson;
      expect(role).toMatchObject({
        name: { az: 'Kiçik menecer', ru: 'Младший менеджер' },
        capability: 'seller',
        isBusinessAdmin: false,
        isCustom: true,
        sourceTemplateId: source,
      });
      expect(role.permissions).toEqual([
        { code: 'catalog.view', scope: 'all' },
        { code: 'orders.view', scope: 'assigned' },
        { code: 'reports.view', scope: 'all' },
      ]);
      const list = (await roles(who)).body as RoleJson[];
      expect(list.find((item) => item.id === role.id)?.isCustom).toBe(true);
      expect(list.filter((item) => !item.isCustom).every((item) => item.id !== role.id)).toBe(true);

      const [audit] = await platformRows<{ actor_user_id: string; after: Record<string, unknown> }>(
        `select actor_user_id, after from audit_logs
          where business_id = $1 and action = 'role.created' and target_id = $2`,
        [who.businessId, role.id],
      );
      expect(audit).toMatchObject({ actor_user_id: who.userId, after: { templateId: source } });
    });

    it('US-014-AC1 aynı şablondan birden çok özel rol açılabilir; admin şablonundan açılan rol admin değildir (V1)', async () => {
      const who = await admin();
      const body = {
        templateId: await templateId('seller_business_admin'),
        name: { az: 'Kopya' },
        permissions: [{ code: 'team.manage', scope: 'all' }],
      };
      const first = await createRole(who, body);
      const second = await createRole(who, body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect((first.body as RoleJson).isBusinessAdmin).toBe(false);
    });

    it('US-014-AC1 özel rol üyeye atanır, davette kullanılır; şablon listesi yalnız işletmenin yeteneği', async () => {
      const who = await admin();
      const { role, membershipId } = await manager(who);
      const [row] = await platformRows<{ role_id: string }>(
        'select role_id from memberships where id = $1',
        [membershipId],
      );
      expect(row?.role_id).toBe(role.id);

      const [title] = await platformRows<{ id: string }>(
        "select id from job_titles where code = 'seller_sales_rep'",
      );
      const invited = await http().post('/api/v1/team/invitations').set(who.auth).send({
        phone: randomTestPhone(),
        fullName: 'Özel Rol',
        jobTitleId: title?.id,
        roleId: role.id,
      });
      expect(invited.status, JSON.stringify(invited.body)).toBe(201);

      const templates = await http().get('/api/v1/team/role-templates').set(who.auth);
      expect(templates.status).toBe(200);
      const list = templates.body as { code: string; capability: string; permissions: unknown[] }[];
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((item) => item.capability === 'seller')).toBe(true);
      expect(list.find((item) => item.code === 'seller_courier')?.permissions.length).toBe(3);
    });

    it('US-014-AC1 doğrulama: olmayan şablon 404, boş ad / boş izin / bilinmeyen alan 422', async () => {
      const who = await admin();
      const source = await templateId('seller_sales_manager');
      const missing = await createRole(who, {
        templateId: randomUUID(),
        name: { az: 'X' },
        permissions: MANAGER_PERMS,
      });
      expect(missing.status).toBe(404);
      for (const body of [
        { templateId: source, name: { az: '  ' }, permissions: MANAGER_PERMS },
        { templateId: source, name: {}, permissions: MANAGER_PERMS },
        { templateId: source, name: { az: 'X' }, permissions: [] },
        {
          templateId: source,
          name: { az: 'X' },
          permissions: MANAGER_PERMS,
          isBusinessAdmin: true,
        },
        {
          templateId: source,
          name: { az: 'X' },
          permissions: [{ code: 'orders.view', scope: 'warehouse' }],
        },
        {
          templateId: source,
          name: { az: 'X' },
          permissions: [{ code: 'orders.delete', scope: 'all' }],
        },
      ]) {
        const response = await createRole(who, body);
        expect(response.status, JSON.stringify(body)).toBe(422);
      }
    });
  });

  describe('AC2 yetenek', () => {
    it('US-014-AC2 buyer rolüne seller izni 422; buyer işletmesi seller şablonunu kopyalayamaz', async () => {
      const who = await admin('buyer');
      const response = await createRole(who, {
        templateId: await templateId('buyer_purchaser'),
        name: { az: 'Alıcı+' },
        permissions: [
          { code: 'catalog.browse', scope: 'all' },
          { code: 'orders.approve', scope: 'all' },
        ],
      });
      expect(response.status).toBe(422);
      expect((response.body as ErrorJson).details).toMatchObject({
        permissions: ['capability'],
        code: 'orders.approve',
      });
      const seller = await createRole(who, {
        templateId: await templateId('seller_sales_manager'),
        name: { az: 'X' },
        permissions: [{ code: 'team.manage', scope: 'all' }],
      });
      expect(seller.status).toBe(422);
      expect((seller.body as ErrorJson).details).toMatchObject({ templateId: ['capability'] });
      const templates = await http().get('/api/v1/team/role-templates').set(who.auth);
      expect(
        (templates.body as { capability: string }[]).every((item) => item.capability === 'buyer'),
      ).toBe(true);
    });
  });

  describe('düzenleme ve izin önbelleği (R22)', () => {
    it('R22 özel rol izni değişince üyenin sonraki isteği yeni izni görür; eski önbellek kaydı geri konsa bile', async () => {
      const who = await admin();
      const { role, membershipId, who: member } = await manager(who);
      expect((await http().get('/api/v1/team/members').set(member.auth)).status).toBe(200);
      const key = permissionCacheKey(membershipId);
      const stale = await redis.client.get(key);
      expect(stale).not.toBeNull();

      const changed = await patchRole(who, role.id, {
        permissions: [
          { code: 'catalog.view', scope: 'all' },
          { code: 'orders.view', scope: 'assigned' },
        ],
      });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(await redis.client.get(key)).toBeNull();
      // Silme başarısız olmuş gibi eski kayıt geri konur: sürüm eşleşmediği için yok sayılır.
      await redis.client.set(key, stale ?? '', 'EX', 60);
      const next = await http().get('/api/v1/team/members').set(member.auth);
      expect(next.status).toBe(403);
      expect((next.body as ErrorJson).code).toBe('PERMISSION_DENIED');

      const [version] = await platformRows<{ permissions_version: number }>(
        'select permissions_version from roles where id = $1',
        [role.id],
      );
      expect(version?.permissions_version).toBe(2);
      const events = await platformRows<{ payload: Record<string, unknown> }>(
        `select payload from outbox_events where type = 'role.permissions_changed'
          and aggregate_id = $1`,
        [role.id],
      );
      expect(events.map((event) => event.payload)).toEqual([
        { roleId: role.id, membershipId, version: 2 },
      ]);
      const [audit] = await platformRows<{
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      }>(`select before, after from audit_logs where action = 'role.updated' and target_id = $1`, [
        role.id,
      ]);
      expect(audit?.before).toHaveProperty('permissions');
      expect(audit?.after).toEqual({
        permissions: [
          { code: 'catalog.view', scope: 'all' },
          { code: 'orders.view', scope: 'assigned' },
        ],
      });
    });

    it('US-014 yalnız ad değişince sürüm artmaz; aynı gövde değişiklik yazmaz', async () => {
      const who = await admin();
      const { role } = await manager(who);
      const renamed = await patchRole(who, role.id, { name: { az: 'Yeni ad' } });
      expect(renamed.status).toBe(200);
      expect((renamed.body as RoleJson).name).toEqual({ az: 'Yeni ad' });
      const same = await patchRole(who, role.id, { permissions: MANAGER_PERMS });
      expect(same.status).toBe(200);
      const [row] = await platformRows<{ permissions_version: number }>(
        'select permissions_version from roles where id = $1',
        [role.id],
      );
      expect(row?.permissions_version).toBe(1);
      const audits = await platformRows(
        `select 1 from audit_logs where action = 'role.updated' and target_id = $1`,
        [role.id],
      );
      expect(audits).toHaveLength(1);
    });

    it('US-014 şablon kopyası düzenlenemez (422 not_editable); kullanımdaki rolde kapsam türü değişemez (V4)', async () => {
      const who = await admin();
      const copy = await roleFromTemplate(who.businessId, 'seller_sales_manager');
      const locked = await patchRole(who, copy.roleId, { name: { az: 'X' } });
      expect(locked.status).toBe(422);
      expect((locked.body as ErrorJson).details).toMatchObject({ roleId: ['not_editable'] });

      const { role } = await manager(who);
      const widened = await patchRole(who, role.id, {
        permissions: [...MANAGER_PERMS, { code: 'inventory.view', scope: 'warehouse' }],
      });
      expect(widened.status).toBe(422);
      expect((widened.body as ErrorJson).details).toMatchObject({
        permissions: ['scope_change_in_use'],
      });

      const unused = await createRole(who, {
        templateId: await templateId('seller_warehouse'),
        name: { az: 'Boş' },
        permissions: [{ code: 'catalog.view', scope: 'all' }],
      });
      const free = await patchRole(who, (unused.body as RoleJson).id, {
        permissions: [{ code: 'inventory.view', scope: 'warehouse' }],
      });
      expect(free.status, JSON.stringify(free.body)).toBe(200);
    });
  });

  describe('yetki yükseltme koruması (Müfettiş 11 R3)', () => {
    it('R3 admin olmayan yönetici kendinde olmayan izinle rol açamaz 403; kendi izinleriyle açabilir', async () => {
      const who = await admin();
      const { who: mgr } = await manager(who);
      const source = await templateId('seller_sales_manager');
      const beyond = await createRole(mgr, {
        templateId: source,
        name: { az: 'Yüksək' },
        permissions: [
          { code: 'team.manage', scope: 'all' },
          { code: 'orders.approve', scope: 'all' },
        ],
      });
      expect(beyond.status).toBe(403);
      expect((beyond.body as ErrorJson).details).toMatchObject({ permissions: ['orders.approve'] });
      const wider = await createRole(mgr, {
        templateId: source,
        name: { az: 'Geniş' },
        permissions: [{ code: 'orders.view', scope: 'all' }],
      });
      expect(wider.status).toBe(403);
      const within = await createRole(mgr, {
        templateId: source,
        name: { az: 'Uyğun' },
        permissions: [
          { code: 'catalog.view', scope: 'all' },
          { code: 'orders.view', scope: 'assigned' },
        ],
      });
      expect(within.status, JSON.stringify(within.body)).toBe(201);
    });

    it('R3 admin olmayan yönetici kendi rolüne izin ekleyemez, admin rolünü atayamaz / davet edemez, admini değiştiremez', async () => {
      const who = await admin();
      const { role, membershipId, who: mgr } = await manager(who);
      const raise = await patchRole(mgr, role.id, {
        permissions: [...MANAGER_PERMS, { code: 'orders.approve', scope: 'all' }],
      });
      expect(raise.status).toBe(403);

      const [adminRole] = await platformRows<{ id: string }>(
        `select id from roles where business_id = $1 and is_business_admin`,
        [who.businessId],
      );
      const self = await patchMember(mgr, membershipId, { roleId: adminRole?.id });
      expect(self.status).toBe(403);
      expect((self.body as ErrorJson).code).toBe('PERMISSION_DENIED');

      const [title] = await platformRows<{ id: string }>(
        "select id from job_titles where code = 'seller_business_admin'",
      );
      const invited = await http().post('/api/v1/team/invitations').set(mgr.auth).send({
        phone: randomTestPhone(),
        fullName: 'Admin olmaq istəyən',
        jobTitleId: title?.id,
        roleId: adminRole?.id,
      });
      expect(invited.status).toBe(403);

      const adminMembership = await membershipOf(who.businessId, who.userId);
      const removed = await patchMember(mgr, adminMembership, { status: 'removed' });
      expect(removed.status).toBe(403);
      const rows = await platformRows<{ id: string; status: string; role_id: string }>(
        'select id, status, role_id from memberships where id = any($1::uuid[])',
        [[membershipId, adminMembership]],
      );
      expect(rows.find((row) => row.id === membershipId)?.role_id).toBe(role.id);
      expect(rows.find((row) => row.id === adminMembership)?.status).toBe('active');
    });
  });

  describe('şablon kopyası tekil indeksi (Müfettiş 12 notu)', () => {
    it('M12-1 kısmi tekil indeks: aynı şablonun ikinci kopyası 23505, özel rol serbest', async () => {
      const who = await admin();
      await expect(
        platformRows(
          `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id)
           select $1, $2, name, capability, is_business_admin, id from role_templates
            where code = 'seller_business_admin'`,
          [randomUUID(), who.businessId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        platformRows(
          `insert into roles (id, business_id, name, capability, is_business_admin,
                              source_template_id, is_custom)
           select $1, $2, name, capability, false, id, true from role_templates
            where code = 'seller_business_admin'`,
          [randomUUID(), who.businessId],
        ),
      ).resolves.toEqual([]);
    });
  });
});
