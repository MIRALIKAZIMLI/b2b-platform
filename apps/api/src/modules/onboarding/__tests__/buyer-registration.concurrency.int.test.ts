// F2.3a-R13 eşzamanlılık: gerçek PostgreSQL'de aynı telefonla paralel kayıt. Ortak test ayarı
// havuzu tek bağlantıya indirir (setup-env); bu dosya gerçek paralellik için havuzu büyütür, böylece
// ikinci işlem `users_phone_e164_uq` satırında ilk işlemi gerçekten bekler.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { idempotencyKey, rowsForPhone, RegistrationHttp, registerBody, runSeeds } from './fixtures';

process.env.DB_POOL_MAX = '6';

interface RegisteredJson {
  readonly businessId: string;
  readonly accessToken?: string;
}

describe('F2.3a-R13 eşzamanlı kayıt (gerçek PostgreSQL, çok bağlantılı havuz)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: RegistrationHttp;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    api = new RegistrationHttp(app);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F2.3a-R13 eşzamanlı iki istek (aynı anahtar) → ikisi de aynı 201, tek işletme ve tek kullanıcı', async () => {
    const phone = randomTestPhone();
    const key = idempotencyKey();
    const body = await registerBody();
    const token = await api.pendingToken(phone);
    const responses = await Promise.all(
      [0, 1, 2].map(() => api.register(token, body, { 'Idempotency-Key': key })),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const ids = new Set(responses.map((response) => (response.body as RegisteredJson).businessId));
    expect(ids.size).toBe(1);
    // Oturum yalnızca kaydı gerçekten yapan istekte açılır.
    expect(
      responses.filter((response) => (response.body as RegisteredJson).accessToken !== undefined),
    ).toHaveLength(1);
    expect(await rowsForPhone(phone, String(body.legalName))).toEqual({
      users: 1,
      businesses: 1,
      memberships: 1,
      subscriptions: 1,
      idempotency: 1,
    });
  });

  it('F2.3a-R13 eşzamanlı iki istek (anahtarsız) → biri 201, diğeri 409 PHONE_ALREADY_REGISTERED', async () => {
    const phone = randomTestPhone();
    const body = await registerBody();
    const token = await api.pendingToken(phone);
    const responses = await Promise.all([0, 1].map(() => api.register(token, body)));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await rowsForPhone(phone, String(body.legalName))).toMatchObject({
      users: 1,
      businesses: 1,
    });
  });
});
