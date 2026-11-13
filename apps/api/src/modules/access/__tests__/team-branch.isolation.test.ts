// F2.5 D1 (Müfettiş 21): ekip uçları başka işletmenin şubesini kabul etmez. Perakendeci A'nın
// admini, B'nin şube kimliğiyle davet edemez ve üyesini o şubeye bağlayamaz (RLS → şube görünmez →
// 404); satırlar değişmez. Uygulama bağlantısı app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  addMemberFromTemplate,
  newRegion,
  newTestBusiness,
  platformRows,
  runTeamSeeds,
} from './team-fixtures';

interface Who {
  readonly businessId: string;
  readonly auth: Record<string, string>;
}

describe('F2.5 izolasyon: ekip uçları ve başka işletmenin şubesi', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let a: Who;
  let b: Who;
  let bBranchId: string;
  let aStaffMembershipId: string;
  let aBranchId: string;
  let staffRoleId: string;
  let staffTitleId: string;

  const http = () => request(app.getHttpServer());

  async function open(): Promise<Who> {
    const business = await newTestBusiness('buyer');
    const signed = await app
      .get(TokenService)
      .signAccess({ userId: business.adminUserId, sessionId: randomUUID() });
    return {
      businessId: business.businessId,
      auth: { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': business.businessId },
    };
  }

  async function branchOf(who: Who, name: string): Promise<string> {
    const res = await http()
      .post('/api/v1/branches')
      .set(who.auth)
      .send({ name, regionId: await newRegion(name), addressLine: `${name} ünvanı` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { id: string }).id;
  }

  beforeAll(async () => {
    await runTeamSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    a = await open();
    b = await open();
    aBranchId = await branchOf(a, 'A şubesi');
    bBranchId = await branchOf(b, 'B şubesi');
    const userId = await addMemberFromTemplate(a.businessId, 'buyer_branch_staff');
    const [row] = await platformRows<{ id: string; role_id: string; job_title_id: string }>(
      'select id, role_id, job_title_id from memberships where business_id = $1 and user_id = $2',
      [a.businessId, userId],
    );
    if (row === undefined) throw new Error('üyelik yok');
    aStaffMembershipId = row.id;
    staffRoleId = row.role_id;
    staffTitleId = row.job_title_id;
    const placed = await http()
      .patch(`/api/v1/team/members/${aStaffMembershipId}`)
      .set(a.auth)
      .send({ branchId: aBranchId });
    expect(placed.status, JSON.stringify(placed.body)).toBe(200);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F2.5-ISO-D1 A, B'nin şubesiyle davet edemez (404) ve davet yazılmaz", async () => {
    const phone = randomTestPhone();
    const res = await http().post('/api/v1/team/invitations').set(a.auth).send({
      phone,
      fullName: 'Sızma',
      roleId: staffRoleId,
      jobTitleId: staffTitleId,
      branchId: bBranchId,
    });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', details: { branchId: ['not_found'] } });
    const rows = await platformRows('select id from invitations where branch_id = $1', [bBranchId]);
    expect(rows).toHaveLength(0);
  });

  it("F2.5-ISO-D1 A, üyesini B'nin şubesine bağlayamaz (404) ve üyelik değişmez", async () => {
    const res = await http()
      .patch(`/api/v1/team/members/${aStaffMembershipId}`)
      .set(a.auth)
      .send({ branchId: bBranchId });
    expect(res.status).toBe(404);
    const [row] = await platformRows<{ branch_id: string }>(
      'select branch_id from memberships where id = $1',
      [aStaffMembershipId],
    );
    expect(row?.branch_id).toBe(aBranchId);
    // Bileşik FK de ikinci savunma: B'nin şubesi A'nın üyeliğine yazılamaz.
    await expect(
      platformRows('update memberships set branch_id = $1 where id = $2', [
        bBranchId,
        aStaffMembershipId,
      ]),
    ).rejects.toThrow();
  });
});
