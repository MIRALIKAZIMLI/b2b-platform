// F3.11e (kullanıcı kararı 2026-11-28, S1 = A, S2 = B): işletme admini olmayan ekip yöneticisi
// kendi deposuna bağlıysa çalışanı yalnız o depoya bağlar; başka depodaki üyeyi değiştiremez /
// çıkaramaz, başka deponun davetini geri çekemez. Depoya bağlı olmayan (izinleri tüm işletmede
// geçerli) yönetici tüm depoları yönetir. `GET /team/scope-options` aynı kuralla süzer.
// Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  addMemberFromTemplate,
  newTestBusiness,
  platformRows,
  runTeamSeeds,
  TeamHttp,
} from './team-fixtures';

interface Who {
  readonly userId: string;
  readonly businessId: string;
  readonly auth: Record<string, string>;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

interface Options {
  readonly branches: { id: string; name: string }[];
  readonly warehouses: { id: string; name: string }[];
}

/** seller_warehouse izinleri (depo kapsamlı) + team.manage: kendi deposuna bağlı yönetici. */
const WAREHOUSE_MANAGER_PERMS = [
  { code: 'team.manage', scope: 'all' },
  { code: 'catalog.view', scope: 'all' },
  { code: 'inventory.view', scope: 'warehouse' },
  { code: 'inventory.manage', scope: 'warehouse' },
  { code: 'orders.prepare', scope: 'warehouse' },
  { code: 'delivery.view', scope: 'warehouse' },
  { code: 'delivery.assign', scope: 'warehouse' },
  { code: 'reports.view', scope: 'warehouse' },
];

/** Aynı izinler tüm işletmede (`all`): depoya bağlı olmayan yönetici (S2 = B). */
const OPERATIONS_MANAGER_PERMS = WAREHOUSE_MANAGER_PERMS.map((item) => ({
  code: item.code,
  scope: 'all',
}));

describe('F3.11e depo kapsamı: yönetici yalnız kendi deposu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TeamHttp;
  let admin: Who;
  let manager: Who;
  let operations: Who;
  let warehouseX: string;
  let warehouseY: string;
  let warehouseOff: string;
  let staffRoleId: string;
  let staffTitleId: string;

  const http = () => h.http();

  async function as(userId: string, businessId: string): Promise<Who> {
    const bearer = await h.bearer(userId);
    return { userId, businessId, auth: { ...bearer, 'X-Business-Id': businessId } };
  }

  async function one<Row extends Record<string, unknown>>(text: string, params: unknown[]) {
    const [row] = await platformRows<Row>(text, params);
    if (row === undefined) throw new Error(`satır yok: ${text}`);
    return row;
  }

  const membershipOf = async (userId: string) =>
    (
      await one<{ id: string }>(
        'select id from memberships where business_id = $1 and user_id = $2',
        [admin.businessId, userId],
      )
    ).id;

  const patchMember = (who: Who, id: string, body: object) =>
    http().patch(`/api/v1/team/members/${id}`).set(who.auth).send(body);

  async function warehouse(name: string, status = 'active'): Promise<string> {
    const id = randomUUID();
    await platformRows(
      'insert into warehouses (id, business_id, name, status) values ($1, $2, $3, $4)',
      [id, admin.businessId, name, status],
    );
    return id;
  }

  /** Depo sorumlusu (seller_warehouse) admin eliyle verilen depoda. */
  async function staffIn(warehouseId: string): Promise<string> {
    const userId = await addMemberFromTemplate(admin.businessId, 'seller_warehouse');
    const id = await membershipOf(userId);
    const res = await patchMember(admin, id, { warehouseId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return id;
  }

  async function customRole(name: string, permissions: object[]): Promise<string> {
    const template = await one<{ id: string }>(
      "select id from role_templates where code = 'seller_warehouse'",
      [],
    );
    const created = await http()
      .post('/api/v1/team/roles')
      .set(admin.auth)
      .send({ templateId: template.id, name: { az: name }, permissions });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return (created.body as { id: string }).id;
  }

  beforeAll(async () => {
    await runTeamSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TeamHttp(app);
    const business = await newTestBusiness('seller');
    admin = await as(business.adminUserId, business.businessId);
    warehouseX = await warehouse('Anbar X');
    warehouseY = await warehouse('Anbar Y');
    warehouseOff = await warehouse('Anbar passiv', 'inactive');

    const managerRole = await customRole('Anbar meneceri', WAREHOUSE_MANAGER_PERMS);
    const managerUserId = await addMemberFromTemplate(admin.businessId, 'seller_warehouse');
    const assigned = await patchMember(admin, await membershipOf(managerUserId), {
      roleId: managerRole,
      warehouseId: warehouseX,
    });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    manager = await as(managerUserId, admin.businessId);

    const operationsRole = await customRole('Əməliyyat meneceri', OPERATIONS_MANAGER_PERMS);
    const operationsUserId = await addMemberFromTemplate(admin.businessId, 'seller_warehouse');
    const moved = await patchMember(admin, await membershipOf(operationsUserId), {
      roleId: operationsRole,
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect((moved.body as { warehouseId: string | null }).warehouseId).toBeNull();
    operations = await as(operationsUserId, admin.businessId);

    staffRoleId = (
      await one<{ id: string }>(
        `select r.id from roles r join role_templates t on t.id = r.source_template_id
          where r.business_id = $1 and t.code = 'seller_warehouse' and not r.is_custom`,
        [admin.businessId],
      )
    ).id;
    staffTitleId = (
      await one<{ id: string }>("select id from job_titles where code = 'seller_warehouse'", [])
    ).id;
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const invite = (who: Who, warehouseId: string) =>
    http().post('/api/v1/team/invitations').set(who.auth).send({
      phone: randomTestPhone(),
      fullName: 'Yeni anbar işçisi',
      jobTitleId: staffTitleId,
      roleId: staffRoleId,
      warehouseId,
    });

  it('F3.11e-S1a admin olmayan yönetici başka depoya davet edemez 403; kendi deposuna edebilir', async () => {
    const other = await invite(manager, warehouseY);
    expect(other.status).toBe(403);
    expect(other.body as ErrorJson).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { warehouseId: ['beyond_actor'] },
    });
    const own = await invite(manager, warehouseX);
    expect(own.status, JSON.stringify(own.body)).toBe(201);
  });

  it('F3.11e-S1b admin olmayan yönetici üyeyi başka depoya taşıyamaz 403', async () => {
    const id = await staffIn(warehouseX);
    const moved = await patchMember(manager, id, { warehouseId: warehouseY });
    expect(moved.status).toBe(403);
    expect((moved.body as ErrorJson).details).toMatchObject({ warehouseId: ['beyond_actor'] });
    const row = await one<{ warehouse_id: string }>(
      'select warehouse_id from memberships where id = $1',
      [id],
    );
    expect(row.warehouse_id).toBe(warehouseX);
  });

  it('F3.11e-S1c admin olmayan yönetici başka depodaki üyeyi değiştiremez ve çıkaramaz 403', async () => {
    const id = await staffIn(warehouseY);
    const pulled = await patchMember(manager, id, { warehouseId: warehouseX });
    expect(pulled.status).toBe(403);
    const removed = await patchMember(manager, id, { status: 'removed' });
    expect(removed.status).toBe(403);
    const row = await one<{ warehouse_id: string; status: string }>(
      'select warehouse_id, status from memberships where id = $1',
      [id],
    );
    expect(row).toEqual({ warehouse_id: warehouseY, status: 'active' });

    const own = await staffIn(warehouseX);
    const ownRemoved = await patchMember(manager, own, { status: 'removed' });
    expect(ownRemoved.status, JSON.stringify(ownRemoved.body)).toBe(200);
  });

  it('F3.11e-S1d admin olmayan yönetici başka deponun davetini geri çekemez 403; kendi deposununkini çeker', async () => {
    const other = await invite(admin, warehouseY);
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    const otherId = (other.body as { invitationId: string }).invitationId;
    const denied = await http()
      .post(`/api/v1/team/invitations/${otherId}/revoke`)
      .set(manager.auth);
    expect(denied.status).toBe(403);
    expect((denied.body as ErrorJson).details).toMatchObject({ warehouseId: ['beyond_actor'] });
    const still = await one<{ open: boolean }>(
      'select expires_at > now() as open from invitations where id = $1',
      [otherId],
    );
    expect(still.open).toBe(true);

    const own = await invite(manager, warehouseX);
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    const ownId = (own.body as { invitationId: string }).invitationId;
    const revoked = await http().post(`/api/v1/team/invitations/${ownId}/revoke`).set(manager.auth);
    expect(revoked.status).toBe(204);
  });

  it('F3.11e-S2 depoya bağlı olmayan yönetici her depoya davet eder, taşır, çıkarır ve daveti geri çeker', async () => {
    const invited = await invite(operations, warehouseY);
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
    const fromAdmin = await invite(admin, warehouseX);
    const revoked = await http()
      .post(
        `/api/v1/team/invitations/${(fromAdmin.body as { invitationId: string }).invitationId}/revoke`,
      )
      .set(operations.auth);
    expect(revoked.status).toBe(204);
    const id = await staffIn(warehouseX);
    const moved = await patchMember(operations, id, { warehouseId: warehouseY });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const removed = await patchMember(operations, id, { status: 'removed' });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
  });

  it('F3.11e-ADM işletme admini her depoya atar ve davet eder', async () => {
    const id = await staffIn(warehouseX);
    const moved = await patchMember(admin, id, { warehouseId: warehouseY });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const invited = await invite(admin, warehouseY);
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
  });

  it('F3.11e-OPT scope-options: admin ve bağsız yönetici tüm aktif depolar, depo yöneticisi yalnız kendi deposu; izinsiz 403', async () => {
    const all = await http().get('/api/v1/team/scope-options').set(admin.auth);
    expect(all.status).toBe(200);
    const body = all.body as Options;
    expect(body.branches).toEqual([]);
    expect(body.warehouses).toEqual([
      { id: warehouseX, name: 'Anbar X' },
      { id: warehouseY, name: 'Anbar Y' },
    ]);
    expect(body.warehouses.map((w) => w.id)).not.toContain(warehouseOff);

    const ops = await http().get('/api/v1/team/scope-options').set(operations.auth);
    expect((ops.body as Options).warehouses.map((w) => w.id)).toEqual([warehouseX, warehouseY]);

    const own = await http().get('/api/v1/team/scope-options').set(manager.auth);
    expect(own.status).toBe(200);
    expect(own.body as Options).toEqual({
      branches: [],
      warehouses: [{ id: warehouseX, name: 'Anbar X' }],
    });

    const staff = await as(
      await addMemberFromTemplate(admin.businessId, 'seller_warehouse'),
      admin.businessId,
    );
    const denied = await http().get('/api/v1/team/scope-options').set(staff.auth);
    expect(denied.status).toBe(403);
  });
});
