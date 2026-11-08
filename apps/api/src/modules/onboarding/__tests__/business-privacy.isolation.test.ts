// F2.10: görünürlük ayarlarında kiracı izolasyonu (`GET|PUT /api/v1/business/privacy`).
// İşletmeler kayıt ucuyla açılır (F2.3a); uygulama bağlantısı RLS'e tabi app_user.
import { DEFAULT_PRIVACY } from '@b2b/shared';
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
}

describe('F2.10 görünürlük ayarları izolasyonu', () => {
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
      const response = await api.register(
        await api.pendingToken(randomTestPhone()),
        await registerBody(),
      );
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const json = response.body as { businessId: string; accessToken: string };
      return { businessId: json.businessId, accessToken: json.accessToken };
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
      .get('/api/v1/business/privacy')
      .set('Authorization', `Bearer ${who.accessToken}`);
    return businessId === undefined ? req : req.set('X-Business-Id', businessId);
  };

  const put = (who: Registered, body: object, businessId?: string) => {
    const req = api
      .http()
      .put('/api/v1/business/privacy')
      .set('Authorization', `Bearer ${who.accessToken}`);
    return (businessId === undefined ? req : req.set('X-Business-Id', businessId)).send(body);
  };

  it("F2.10-ISO perakendeci B, A'nın ayarlarını okuyamaz ve değiştiremez (403); A değişmez", async () => {
    expect((await get(b, a.businessId)).status).toBe(403);
    const response = await put(b, { ...DEFAULT_PRIVACY, showVoen: true }, a.businessId);
    expect(response.status).toBe(403);
    expect((await get(a, a.businessId)).body).toEqual(DEFAULT_PRIVACY);
  });

  it('F2.10-ISO B kendi ayarını değiştirir; A etkilenmez', async () => {
    const next = { ...DEFAULT_PRIVACY, listedInDirectory: false, showAddress: true };
    const response = await put(b, next, b.businessId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(next);
    expect((await get(a, a.businessId)).body).toEqual(DEFAULT_PRIVACY);
  });

  it('F2.10-ISO X-Business-Id olmadan 422, oturumsuz 401', async () => {
    expect((await get(a)).status).toBe(422);
    expect((await put(a, DEFAULT_PRIVACY)).status).toBe(422);
    expect(
      (await api.http().get('/api/v1/business/privacy').set('X-Business-Id', a.businessId)).status,
    ).toBe(401);
  });
});
