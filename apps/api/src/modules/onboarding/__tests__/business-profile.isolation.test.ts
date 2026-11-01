// F2.3b / F2.4: aktif işletmenin profili (`GET /api/v1/business`, US-005 AC2 doluluk kartı) ve kiracı
// izolasyonu. İşletmeler kayıt ucuyla açılır (F2.3a; bu yüzden onboarding testlerinde); uygulama
// bağlantısı RLS'e tabi app_user.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { RegistrationHttp, registerBody, runSeeds } from './fixtures';

interface Registered {
  readonly businessId: string;
  readonly accessToken: string;
  readonly legalName: string;
}

describe('F2.3b işletme profili (GET /api/v1/business)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: RegistrationHttp;
  let a: Registered;
  let b: Registered;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    api = new RegistrationHttp(app);
    const register = async (): Promise<Registered> => {
      const body = await registerBody();
      const response = await api.register(await api.pendingToken(randomTestPhone()), body);
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const json = response.body as { businessId: string; accessToken: string };
      return {
        businessId: json.businessId,
        accessToken: json.accessToken,
        legalName: String(body.legalName),
      };
    };
    a = await register();
    b = await register();
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const get = (who: Registered, businessId?: string) => {
    const req = api
      .http()
      .get('/api/v1/business')
      .set('Authorization', `Bearer ${who.accessToken}`);
    return businessId === undefined ? req : req.set('X-Business-Id', businessId);
  };

  it('US-005-AC2 yeni perakendeci kendi profilini doluluk yüzdesiyle okur', async () => {
    const response = await get(a, a.businessId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: a.businessId,
      legalName: a.legalName,
      voen: null,
      verified: false,
      status: 'active',
      profileCompleteness: 40,
      logoUrl: null,
    });
  });

  it('F2.3b-ISO perakendeci B, A işletmesinin profilini okuyamaz (üyelik yok → 403)', async () => {
    const response = await get(b, a.businessId);
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain(a.legalName);
  });

  it('F2.3b-ISO X-Business-Id olmadan 422, oturumsuz 401', async () => {
    expect((await get(a)).status).toBe(422);
    expect(
      (await api.http().get('/api/v1/business').set('X-Business-Id', a.businessId)).status,
    ).toBe(401);
  });

  const patch = (who: Registered, body: object, businessId?: string) => {
    const req = api
      .http()
      .patch('/api/v1/business')
      .set('Authorization', `Bearer ${who.accessToken}`);
    return (businessId === undefined ? req : req.set('X-Business-Id', businessId)).send(body);
  };

  it("F2.4-ISO perakendeci B, A işletmesinin profilini/VÖEN'ini değiştiremez (403); A değişmez", async () => {
    const response = await patch(
      b,
      { legalName: 'B tarafından', voen: '9876543211' },
      a.businessId,
    );
    expect(response.status).toBe(403);
    const own = await get(a, a.businessId);
    expect(own.body).toMatchObject({ legalName: a.legalName, voen: null });
  });

  it('F2.4-ISO B kendi işletmesini günceller; A etkilenmez', async () => {
    const response = await patch(b, { legalName: 'B Yeni Ünvan' }, b.businessId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: b.businessId, legalName: 'B Yeni Ünvan' });
    expect((await get(a, a.businessId)).body).toMatchObject({ legalName: a.legalName });
  });

  it('F2.4-ISO X-Business-Id olmadan 422, oturumsuz 401', async () => {
    expect((await patch(a, { legalName: 'X' })).status).toBe(422);
    expect(
      (
        await api
          .http()
          .patch('/api/v1/business')
          .set('X-Business-Id', a.businessId)
          .send({ legalName: 'X' })
      ).status,
    ).toBe(401);
  });
});
