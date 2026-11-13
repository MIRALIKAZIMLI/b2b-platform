// F2.5 S1 (kullanıcı kararı 2026-11-13, Müfettiş 13 N1): işletme admini olmayan ekip yöneticisi
// üyeyi yalnız kendi şubesine bağlar; başka şubedeki üyeyi değiştiremez / çıkaramaz. Diğer
// şubeleri yalnız işletme admini yönetir. Uygulama bağlantısı RLS'e tabi app_user.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  addMemberFromTemplate,
  newRegion,
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

/** buyer_branch_admin izinleri + team.manage (admin olmayan şube yöneticisi). */
const MANAGER_PERMS = [
  { code: 'team.manage', scope: 'all' },
  { code: 'catalog.browse', scope: 'branch' },
  { code: 'cart.edit', scope: 'branch' },
  { code: 'cart.submit', scope: 'branch' },
  { code: 'cart.approve', scope: 'branch' },
  { code: 'orders.view', scope: 'branch' },
  { code: 'orders.cancel_own', scope: 'branch' },
  { code: 'orders.confirm_delivery', scope: 'branch' },
];

describe('F2.5 S1 şube kapsamı: yönetici yalnız kendi şubesi', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TeamHttp;
  let admin: Who;
  let manager: Who;
  let branchX: string;
  let branchY: string;
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

  async function branch(name: string): Promise<string> {
    const res = await http()
      .post('/api/v1/branches')
      .set(admin.auth)
      .send({ name, regionId: await newRegion(name), addressLine: `${name} küç. 1` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { id: string }).id;
  }

  /** Şube çalışanı (buyer_branch_staff) admin eliyle verilen şubede. */
  async function staffIn(branchId: string): Promise<string> {
    const userId = await addMemberFromTemplate(admin.businessId, 'buyer_branch_staff');
    const id = await membershipOf(userId);
    const res = await patchMember(admin, id, { branchId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return id;
  }

  beforeAll(async () => {
    await runTeamSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TeamHttp(app);
    const business = await newTestBusiness('buyer');
    admin = await as(business.adminUserId, business.businessId);
    branchX = await branch('Şube X');
    branchY = await branch('Şube Y');

    const template = await one<{ id: string }>(
      "select id from role_templates where code = 'buyer_branch_admin'",
      [],
    );
    const created = await http()
      .post('/api/v1/team/roles')
      .set(admin.auth)
      .send({
        templateId: template.id,
        name: { az: 'Filial meneceri' },
        permissions: MANAGER_PERMS,
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const managerUserId = await addMemberFromTemplate(admin.businessId, 'buyer_branch_staff');
    const assigned = await patchMember(admin, await membershipOf(managerUserId), {
      roleId: (created.body as { id: string }).id,
      branchId: branchX,
    });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    manager = await as(managerUserId, admin.businessId);

    staffRoleId = (
      await one<{ id: string }>(
        `select r.id from roles r join role_templates t on t.id = r.source_template_id
          where r.business_id = $1 and t.code = 'buyer_branch_staff' and not r.is_custom`,
        [admin.businessId],
      )
    ).id;
    staffTitleId = (
      await one<{ id: string }>("select id from job_titles where code = 'buyer_branch_staff'", [])
    ).id;
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const invite = (who: Who, branchId: string) =>
    http().post('/api/v1/team/invitations').set(who.auth).send({
      phone: randomTestPhone(),
      fullName: 'Yeni işçi',
      jobTitleId: staffTitleId,
      roleId: staffRoleId,
      branchId,
    });

  it('F2.5-S1 admin olmayan yönetici başka şubeye davet edemez 403; kendi şubesine edebilir', async () => {
    const other = await invite(manager, branchY);
    expect(other.status).toBe(403);
    expect(other.body as ErrorJson).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { branchId: ['beyond_actor'] },
    });
    const own = await invite(manager, branchX);
    expect(own.status, JSON.stringify(own.body)).toBe(201);
  });

  it('F2.5-S1 admin olmayan yönetici üyeyi başka şubeye taşıyamaz 403', async () => {
    const id = await staffIn(branchX);
    const moved = await patchMember(manager, id, { branchId: branchY });
    expect(moved.status).toBe(403);
    const row = await one<{ branch_id: string }>(
      'select branch_id from memberships where id = $1',
      [id],
    );
    expect(row.branch_id).toBe(branchX);
  });

  it('F2.5-S1 admin olmayan yönetici başka şubedeki üyeyi değiştiremez ve çıkaramaz 403', async () => {
    const id = await staffIn(branchY);
    const pulled = await patchMember(manager, id, { branchId: branchX });
    expect(pulled.status).toBe(403);
    const removed = await patchMember(manager, id, { status: 'removed' });
    expect(removed.status).toBe(403);
    const row = await one<{ branch_id: string; status: string }>(
      'select branch_id, status from memberships where id = $1',
      [id],
    );
    expect(row).toEqual({ branch_id: branchY, status: 'active' });
  });

  it('F2.5-S1 işletme admini her şubeye atar ve davet eder', async () => {
    const id = await staffIn(branchX);
    const moved = await patchMember(admin, id, { branchId: branchY });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const invited = await invite(admin, branchY);
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
  });
});
