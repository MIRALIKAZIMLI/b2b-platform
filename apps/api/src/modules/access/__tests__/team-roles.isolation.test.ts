// F2.8 kiracı izolasyonu (US-014 AC1 "yalnızca o işletmede"): işletme B, A'nın özel rolünü
// listede görmez, düzenleyemez ve kendi üyesine atayamaz; A'nın bağlamıyla istek atamaz.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  addMemberFromTemplate,
  newTestBusiness,
  platformRows,
  runTeamSeeds,
} from './team-fixtures';

interface Who {
  readonly businessId: string;
  readonly userId: string;
  readonly token: string;
}

describe('F2.8 izolasyon: özel roller', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let a: Who;
  let b: Who;
  let aRoleId: string;
  let bMembershipId: string;

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
    const [template] = await platformRows<{ id: string }>(
      "select id from role_templates where code = 'seller_sales_manager'",
    );
    const created = await http()
      .post('/api/v1/team/roles')
      .set(headers(a, a.businessId))
      .send({
        templateId: template?.id,
        name: { az: 'A özəl' },
        permissions: [{ code: 'catalog.view', scope: 'all' }],
      });
    expect(created.status).toBe(201);
    aRoleId = (created.body as { id: string }).id;
    const bUser = await addMemberFromTemplate(b.businessId, 'seller_sales_rep');
    const [row] = await platformRows<{ id: string }>(
      'select id from memberships where business_id = $1 and user_id = $2',
      [b.businessId, bUser],
    );
    bMembershipId = row?.id ?? '';
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('US-014-AC1 başka işletme özel rolü göremez, düzenleyemez ve atayamaz', async () => {
    const list = await http().get('/api/v1/team/roles').set(headers(b, b.businessId));
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).some((role) => role.id === aRoleId)).toBe(false);

    const patched = await http()
      .patch(`/api/v1/team/roles/${aRoleId}`)
      .set(headers(b, b.businessId))
      .send({ name: { az: 'Ele keçirildi' } });
    expect(patched.status).toBe(404);

    const assigned = await http()
      .patch(`/api/v1/team/members/${bMembershipId}`)
      .set(headers(b, b.businessId))
      .send({ roleId: aRoleId });
    expect(assigned.status).toBe(404);

    const [row] = await platformRows<{ name: Record<string, string> }>(
      'select name from roles where id = $1',
      [aRoleId],
    );
    expect(row?.name).toEqual({ az: 'A özəl' });
  });

  it('US-014-AC1 A’nın bağlamıyla (üye olunmayan işletme) rol uçları 403', async () => {
    const asA = headers(b, a.businessId);
    expect((await http().get('/api/v1/team/roles').set(asA)).status).toBe(403);
    expect((await http().get('/api/v1/team/role-templates').set(asA)).status).toBe(403);
    const patched = await http()
      .patch(`/api/v1/team/roles/${aRoleId}`)
      .set(asA)
      .send({ name: { az: 'X' } });
    expect(patched.status).toBe(403);
  });
});
