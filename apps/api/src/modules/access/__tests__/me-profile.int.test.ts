// PATCH /api/v1/me (openapi; US-058 AC1: dil profilde saklanır; F1.13a). app_user + RLS (users U).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { queryAsOwner } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { seedI18n } from '../../i18n';

interface UserRow extends Record<string, unknown> {
  full_name: string;
  preferred_language: string | null;
  timezone: string | null;
}

describe('PATCH /me (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let tokens: TokenService;

  beforeAll(async () => {
    const owner = await connectAsMigrator();
    try {
      await seedI18n(owner);
    } finally {
      await owner.end();
    }
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    const keys = await redis.keys();
    if (keys.length > 0) await redis.client.del(...keys);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function newUser() {
    const id = randomUUID();
    await insertTestUser({ id, phone: randomTestPhone() });
    const signed = await tokens.signAccess({ userId: id, sessionId: randomUUID() });
    return { id, auth: { Authorization: `Bearer ${signed.token}` } };
  }

  async function row(id: string): Promise<UserRow | undefined> {
    const rows = await queryAsOwner<UserRow>(
      'select full_name, preferred_language, timezone from users where id = $1',
      [id],
    );
    return rows[0];
  }

  it('US-058 AC1: dil seçimi profilde saklanır ve /me ile döner', async () => {
    const user = await newUser();

    const patched = await http()
      .patch('/api/v1/me')
      .set(user.auth)
      .send({ preferredLanguage: 'ru' });

    expect(patched.status).toBe(200);
    expect((await row(user.id))?.preferred_language).toBe('ru');
    const me = await http().get('/api/v1/me').set(user.auth);
    expect((me.body as { preferredLanguage: string }).preferredLanguage).toBe('ru');
  });

  it('ad ve saat dilimi güncellenir; verilmeyen alan değişmez', async () => {
    const user = await newUser();
    await http().patch('/api/v1/me').set(user.auth).send({ preferredLanguage: 'tr' });

    const patched = await http()
      .patch('/api/v1/me')
      .set(user.auth)
      .send({ fullName: '  Yeni Ad ', timezone: 'Asia/Baku' });

    expect(patched.status).toBe(200);
    expect(await row(user.id)).toEqual({
      full_name: 'Yeni Ad',
      preferred_language: 'tr',
      timezone: 'Asia/Baku',
    });
  });

  it('US-058 AC4: pasif dil (en) ve geçersiz değerler → 422, satır değişmez', async () => {
    const user = await newUser();
    const before = await row(user.id);

    for (const body of [
      { preferredLanguage: 'en' },
      { preferredLanguage: 'xx' },
      { timezone: 'Mars/Olympus' },
      { fullName: '' },
      { phone: '+994501234567' },
    ]) {
      const response = await http().patch('/api/v1/me').set(user.auth).send(body);
      expect(response.status).toBe(422);
      expect((response.body as { code: string }).code).toBe('VALIDATION_FAILED');
    }
    expect(await row(user.id)).toEqual(before);
  });

  it('izolasyon: kullanıcı yalnızca kendi satırını değiştirir', async () => {
    const a = await newUser();
    const b = await newUser();
    const before = await row(b.id);

    await http().patch('/api/v1/me').set(a.auth).send({ preferredLanguage: 'ru', fullName: 'A' });

    expect(await row(b.id)).toEqual(before);
  });

  it('anahtarsız istek → 401', async () => {
    const response = await http().patch('/api/v1/me').send({ preferredLanguage: 'ru' });
    expect(response.status).toBe(401);
  });
});
