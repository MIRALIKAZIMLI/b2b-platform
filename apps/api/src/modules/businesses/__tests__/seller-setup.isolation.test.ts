// F2.6 kiracı izolasyonu: toptancı B, A'nın depolarını, satıcı profilini ve hizmet bölgelerini
// okuyamaz ve değiştiremez. Uygulama bağlantısı RLS'e tabi app_user.
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

describe('F2.6 izolasyon: depolar, satıcı profili, hizmet bölgeleri', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let a: Who;
  let b: Who;
  let aWarehouseId: string;
  let aRegionId: string;

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
      const business = await newTestBusiness({ maxWarehouses: null });
      const signed = await app
        .get(TokenService)
        .signAccess({ userId: business.adminUserId, sessionId: randomUUID() });
      return { businessId: business.businessId, token: signed.token };
    };
    a = await open();
    b = await open();
    const created = await http()
      .post('/api/v1/warehouses')
      .set(headers(a, a.businessId))
      .send({ name: 'A deposu' });
    expect(created.status).toBe(201);
    aWarehouseId = (created.body as { id: string }).id;
    aRegionId = await newRegion('A hizmet bölgesi');
    await http()
      .put('/api/v1/business/service-areas')
      .set(headers(a, a.businessId))
      .send({ regionIds: [aRegionId] });
    await http()
      .patch('/api/v1/business/seller-profile')
      .set(headers(a, a.businessId))
      .send({ minOrderAmount: '99.00' });
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it("F2.6-ISO B, X-Business-Id = A ile A'nın uçlarına erişemez (üyelik yok → 403)", async () => {
    const calls = [
      http().get('/api/v1/warehouses').set(headers(b, a.businessId)),
      http().post('/api/v1/warehouses').set(headers(b, a.businessId)).send({ name: 'Sızma' }),
      http()
        .patch(`/api/v1/warehouses/${aWarehouseId}`)
        .set(headers(b, a.businessId))
        .send({ name: 'Sızma' }),
      http().get('/api/v1/business/seller-profile').set(headers(b, a.businessId)),
      http()
        .patch('/api/v1/business/seller-profile')
        .set(headers(b, a.businessId))
        .send({ minOrderAmount: '1.00' }),
      http().get('/api/v1/business/service-areas').set(headers(b, a.businessId)),
      http()
        .put('/api/v1/business/service-areas')
        .set(headers(b, a.businessId))
        .send({ regionIds: [] }),
    ];
    for (const [index, response] of (await Promise.all(calls)).entries()) {
      expect(response.status, `çağrı ${String(index)}`).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('A deposu');
    }
  });

  it("F2.6-ISO B kendi bağlamında A'nın deposunu göremez, güncelleyemez (404)", async () => {
    const list = await http().get('/api/v1/warehouses').set(headers(b, b.businessId));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const patch = await http()
      .patch(`/api/v1/warehouses/${aWarehouseId}`)
      .set(headers(b, b.businessId))
      .send({ name: 'B değiştirdi', isDefault: true });
    expect(patch.status).toBe(404);
    expect(
      (await http().get('/api/v1/business/seller-profile').set(headers(b, b.businessId))).body,
    ).toMatchObject({ minOrderAmount: null, defaultWarehouseId: null });
    expect(
      (await http().get('/api/v1/business/service-areas').set(headers(b, b.businessId))).body,
    ).toEqual({ regionIds: [] });
  });

  it('F2.6-ISO B kendi verisini değiştirir; A değişmez', async () => {
    await http()
      .put('/api/v1/business/service-areas')
      .set(headers(b, b.businessId))
      .send({ regionIds: [] });
    await http()
      .patch('/api/v1/business/seller-profile')
      .set(headers(b, b.businessId))
      .send({ minOrderAmount: '5.00' });
    const [warehouse] = await platformRows<{ name: string; is_default: boolean }>(
      'select name, is_default from warehouses where id = $1',
      [aWarehouseId],
    );
    expect(warehouse).toEqual({ name: 'A deposu', is_default: true });
    const [profile] = await platformRows<{ min_order_amount: string }>(
      'select min_order_amount from seller_profiles where business_id = $1',
      [a.businessId],
    );
    expect(profile?.min_order_amount).toBe('99.00');
    const areas = await platformRows<{ region_id: string }>(
      'select region_id from service_areas where seller_id = $1',
      [a.businessId],
    );
    expect(areas.map((row) => row.region_id)).toEqual([aRegionId]);
  });

  it('F2.6-ISO oturumsuz 401, X-Business-Id olmadan 422', async () => {
    expect((await http().get('/api/v1/warehouses').set('X-Business-Id', a.businessId)).status).toBe(
      401,
    );
    expect(
      (await http().get('/api/v1/warehouses').set('Authorization', `Bearer ${a.token}`)).status,
    ).toBe(422);
  });
});
