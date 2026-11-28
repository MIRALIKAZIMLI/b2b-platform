// F2.7a kiracı izolasyonu: işletme B'nin admini A'nın ekibini, davetlerini ve rollerini göremez,
// değiştiremez; kendi bağlamıyla A'nın kimliklerini kullanması 404. `users_member_select` yalnız
// bağlamdaki işletmenin üyelerinin kullanıcı satırını açar. Uygulama bağlantısı app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  addMemberFromTemplate,
  newTestBusiness,
  platformRows,
  roleFromTemplate,
  runTeamSeeds,
} from './team-fixtures';

interface Who {
  readonly businessId: string;
  readonly userId: string;
  readonly token: string;
}

describe('F2.7a izolasyon: ekip, davetler, roller', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let a: Who;
  let b: Who;
  let aMemberUserId: string;
  let aMembershipId: string;
  let aInvitationId: string;
  let aRoleId: string;
  let aJobTitleId: string;

  const http = () => request(app.getHttpServer());
  const headers = (who: Who, businessId: string) => ({
    Authorization: `Bearer ${who.token}`,
    'X-Business-Id': businessId,
  });

  beforeAll(async () => {
    await runTeamSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    const open = async (): Promise<Who> => {
      const business = await newTestBusiness();
      const signed = await app
        .get(TokenService)
        .signAccess({ userId: business.adminUserId, sessionId: randomUUID() });
      return { businessId: business.businessId, userId: business.adminUserId, token: signed.token };
    };
    a = await open();
    b = await open();
    aMemberUserId = await addMemberFromTemplate(a.businessId, 'seller_sales_manager');
    const [membership] = await platformRows<{ id: string; role_id: string; job_title_id: string }>(
      'select id, role_id, job_title_id from memberships where user_id = $1 and business_id = $2',
      [aMemberUserId, a.businessId],
    );
    aMembershipId = membership?.id ?? '';
    aRoleId = membership?.role_id ?? '';
    aJobTitleId = membership?.job_title_id ?? '';
    const invited = await http()
      .post('/api/v1/team/invitations')
      .set(headers(a, a.businessId))
      .send({
        phone: randomTestPhone(),
        fullName: 'A daveti',
        roleId: aRoleId,
        jobTitleId: aJobTitleId,
      });
    expect(invited.status).toBe(201);
    aInvitationId = (invited.body as { invitationId: string }).invitationId;
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F2.7-ISO B, X-Business-Id = A ile A'nın /team uçlarına erişemez (üyelik yok → 403)", async () => {
    const calls = [
      http().get('/api/v1/team/members').set(headers(b, a.businessId)),
      http()
        .patch(`/api/v1/team/members/${aMembershipId}`)
        .set(headers(b, a.businessId))
        .send({ status: 'removed' }),
      http().get('/api/v1/team/invitations').set(headers(b, a.businessId)),
      http().post('/api/v1/team/invitations').set(headers(b, a.businessId)).send({
        phone: randomTestPhone(),
        fullName: 'X',
        roleId: aRoleId,
        jobTitleId: aJobTitleId,
      }),
      http().post(`/api/v1/team/invitations/${aInvitationId}/revoke`).set(headers(b, a.businessId)),
      http().get('/api/v1/team/roles').set(headers(b, a.businessId)),
      http().get('/api/v1/team/job-titles').set(headers(b, a.businessId)),
      http().get('/api/v1/team/scope-options').set(headers(b, a.businessId)),
    ];
    for (const response of await Promise.all(calls)) expect(response.status).toBe(403);
  });

  it("F2.7-ISO B kendi bağlamında A'nın kimliklerini kullanırsa 404; A'nın verisi görünmez", async () => {
    const own = headers(b, b.businessId);
    const patch = await http()
      .patch(`/api/v1/team/members/${aMembershipId}`)
      .set(own)
      .send({ status: 'removed' });
    expect(patch.status).toBe(404);
    const revoke = await http().post(`/api/v1/team/invitations/${aInvitationId}/revoke`).set(own);
    expect(revoke.status).toBe(404);
    const invite = await http()
      .post('/api/v1/team/invitations')
      .set(own)
      .send({ phone: randomTestPhone(), fullName: 'X', roleId: aRoleId, jobTitleId: aJobTitleId });
    expect(invite.status).toBe(404);

    const members = (await http().get('/api/v1/team/members').set(own)).body as {
      userId: string;
    }[];
    expect(members.map((m) => m.userId)).toEqual([b.userId]);
    expect((await http().get('/api/v1/team/invitations').set(own)).body).toEqual([]);
    const roles = (await http().get('/api/v1/team/roles').set(own)).body as { id: string }[];
    expect(roles.map((r) => r.id)).not.toContain(aRoleId);

    // A'nın üyeliği ve daveti değişmedi.
    const [row] = await platformRows<{ status: string }>(
      'select status from memberships where id = $1',
      [aMembershipId],
    );
    expect(row?.status).toBe('active');
    expect(
      (
        (await http().get('/api/v1/team/invitations').set(headers(a, a.businessId))).body as {
          id: string;
        }[]
      ).map((i) => i.id),
    ).toEqual([aInvitationId]);
  });

  it('F2.7-ISO users_member_select: B bağlamında A üyesinin kullanıcı satırı görünmez', async () => {
    const client = await connectAsAppUser();
    try {
      await client.query('begin');
      await client.query("select set_config('app.business_id', $1, true)", [b.businessId]);
      await client.query("select set_config('app.user_id', $1, true)", [b.userId]);
      const foreign = await client.query('select id from users where id = $1', [aMemberUserId]);
      expect(foreign.rows).toHaveLength(0);
      const visible = await client.query<{ id: string }>('select id from users');
      expect(visible.rows.map((r) => r.id)).toEqual([b.userId]);
      await client.query("select set_config('app.business_id', $1, true)", [a.businessId]);
      const ownBusiness = await client.query('select id from users where id = $1', [aMemberUserId]);
      // Üye olmadığı işletmenin bağlamını kendisi kursa da memberships RLS aynı işletmeyle sınırlı;
      // uygulama bu bağlamı yalnız üyelik doğrulandıktan sonra kurar (AccessGuard).
      expect(ownBusiness.rows).toHaveLength(1);
    } finally {
      await client.query('rollback');
      await client.end();
    }
  });
  it('F2.7-ISO elle yazılan SQL bekçisi (T6): politikalar, roller ve FK yerinde', async () => {
    const policies = await platformRows<{ policyname: string; roles: string; cmd: string }>(
      `select policyname, array_to_string(roles, ',') as roles, cmd from pg_policies
        where policyname in ('users_member_select', 'users_definer_insert_invited',
                             'memberships_definer_update')`,
    );
    const byName = new Map(policies.map((p) => [p.policyname, p]));
    expect(byName.get('users_member_select')).toMatchObject({ roles: 'public', cmd: 'SELECT' });
    expect(byName.get('users_definer_insert_invited')).toMatchObject({
      roles: 'migrator',
      cmd: 'INSERT',
    });
    expect(byName.get('memberships_definer_update')).toMatchObject({
      roles: 'migrator',
      cmd: 'UPDATE',
    });
    const fk = await platformRows(
      `select 1 from pg_constraint where conname = 'users_last_business_id_businesses_id_fk'
          and contype = 'f'`,
    );
    expect(fk).toHaveLength(1);
  });

  it("F3.11e-ISO B'nin scope-options listesinde A'nın deposu yok; A'nın deposuna davet 404", async () => {
    const aWarehouse = randomUUID();
    await platformRows(
      "insert into warehouses (id, business_id, name, status) values ($1, $2, 'A anbarı', 'active')",
      [aWarehouse, a.businessId],
    );
    const own = headers(b, b.businessId);
    const options = await http().get('/api/v1/team/scope-options').set(own);
    expect(options.status).toBe(200);
    const ids = (options.body as { warehouses: { id: string }[] }).warehouses.map((w) => w.id);
    expect(ids).not.toContain(aWarehouse);
    const { roleId, jobTitleId } = await roleFromTemplate(b.businessId, 'seller_warehouse');
    const invite = await http().post('/api/v1/team/invitations').set(own).send({
      phone: randomTestPhone(),
      fullName: 'X',
      roleId,
      jobTitleId,
      warehouseId: aWarehouse,
    });
    expect(invite.status, JSON.stringify(invite.body)).toBe(404);
    expect((invite.body as { details?: unknown }).details).toMatchObject({
      warehouseId: ['not_found'],
    });
  });
});
