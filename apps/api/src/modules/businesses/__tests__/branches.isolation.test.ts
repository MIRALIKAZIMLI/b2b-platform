// F2.5 kiracı izolasyonu: perakendeci B, A'nın şubelerini okuyamaz ve değiştiremez; kendi
// bağlamında A'nın şube kimliği 404. Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { newRegion, newTestBusiness, platformRows, runSetupSeeds } from './seller-fixtures';

interface Who {
  readonly businessId: string;
  readonly token: string;
}

describe('F2.5 izolasyon: şubeler', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let a: Who;
  let b: Who;
  let aBranchId: string;

  const http = () => request(app.getHttpServer());
  const headers = (who: Who, businessId: string) => ({
    Authorization: `Bearer ${who.token}`,
    'X-Business-Id': businessId,
  });

  beforeAll(async () => {
    await runSetupSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    const open = async (): Promise<Who> => {
      const business = await newTestBusiness({ capability: 'buyer' });
      const signed = await app
        .get(TokenService)
        .signAccess({ userId: business.adminUserId, sessionId: randomUUID() });
      return { businessId: business.businessId, token: signed.token };
    };
    a = await open();
    b = await open();
    const regionId = await newRegion('F2.5 izolasyon');
    const created = await http()
      .post('/api/v1/branches')
      .set(headers(a, a.businessId))
      .send({ name: 'A şubesi', regionId, addressLine: 'A ünvanı' });
    expect(created.status).toBe(201);
    aBranchId = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F2.5-ISO B, X-Business-Id = A ile A'nın şube uçlarına erişemez (üyelik yok → 403)", async () => {
    const calls = [
      http().get('/api/v1/branches').set(headers(b, a.businessId)),
      http().get(`/api/v1/branches/${aBranchId}`).set(headers(b, a.businessId)),
      http().post('/api/v1/branches').set(headers(b, a.businessId)).send({ name: 'Sızma' }),
      http()
        .patch(`/api/v1/branches/${aBranchId}`)
        .set(headers(b, a.businessId))
        .send({ name: 'Sızma' }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
  });

  it("F2.5-ISO B kendi bağlamında A'nın şubesini göremez ve değiştiremez (404)", async () => {
    const listed = await http().get('/api/v1/branches').set(headers(b, b.businessId));
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).map((row) => row.id)).not.toContain(aBranchId);
    const one = await http().get(`/api/v1/branches/${aBranchId}`).set(headers(b, b.businessId));
    expect(one.status).toBe(404);
    const patched = await http()
      .patch(`/api/v1/branches/${aBranchId}`)
      .set(headers(b, b.businessId))
      .send({ status: 'inactive', name: 'Sızma' });
    expect(patched.status).toBe(404);
    const [row] = await platformRows<{ name: string; status: string }>(
      'select name, status from branches where id = $1',
      [aBranchId],
    );
    expect(row).toEqual({ name: 'A şubesi', status: 'active' });
  });
});
