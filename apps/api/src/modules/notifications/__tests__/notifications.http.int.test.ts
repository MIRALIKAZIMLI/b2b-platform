// F1.11 uç noktaları (entegrasyon): /push-tokens, /notifications, /notifications/read,
// /notifications/preferences. `/me` ile aynı koruma (@Authenticated). Gerçek PostgreSQL (app_user).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { FixedClock } from '../../../core/clock';
import { withUserTx } from '../../../core/db';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { NotificationsRepository } from '../notifications.repository';
import { NOTIFICATION_TEMPLATES } from '../seed/notifications.seed';
import { expoToken, insertRecipient, runNotificationSeed } from './fixtures';

interface Page {
  readonly items: { id: string; title: string; readAt: string | null; data: unknown }[];
  readonly nextCursor: string | null;
}

describe('F1.11 bildirim uç noktaları (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let tokens: TokenService;
  const repo = new NotificationsRepository();
  const clock = new FixedClock(new Date('2026-10-30T09:00:00.000Z'));
  const ids = new UuidV7IdGenerator(clock);

  beforeAll(async () => {
    await runNotificationSeed();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function bearer(userId: string) {
    const signed = await tokens.signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}` };
  }

  /** Sırayla `count` bildirim yazar (UUIDv7 kimlikleri artan). */
  async function seedNotifications(userId: string, count: number): Promise<string[]> {
    const created: string[] = [];
    for (let index = 0; index < count; index += 1) {
      clock.advance(1000);
      const id = ids.next();
      await withUserTx({ userId }, (tx) =>
        repo.insert(tx, {
          id,
          userId,
          businessId: null,
          type: 'test',
          payload: { id: randomUUID(), params: {} },
          now: clock.now(),
        }),
      );
      created.push(id);
    }
    return created;
  }

  it('oturum olmadan dört uç 401', async () => {
    const responses = await Promise.all([
      http().post('/api/v1/push-tokens').send({ token: expoToken(), platform: 'ios' }),
      http().get('/api/v1/notifications'),
      http().post('/api/v1/notifications/read').send({ all: true }),
      http().put('/api/v1/notifications/preferences').send({ test: false }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });

  it('POST /push-tokens → 204; aynı token başka kullanıcıya taşınır', async () => {
    const a = await insertRecipient('az');
    const b = await insertRecipient('az');
    const token = expoToken();

    const first = await http()
      .post('/api/v1/push-tokens')
      .set(await bearer(a.id))
      .send({ token, platform: 'android' });
    const second = await http()
      .post('/api/v1/push-tokens')
      .set(await bearer(b.id))
      .send({ token, platform: 'ios' });

    expect([first.status, second.status]).toEqual([204, 204]);
    const tokensA = await withUserTx({ userId: a.id }, (tx) => repo.tokens(tx));
    const tokensB = await withUserTx({ userId: b.id }, (tx) => repo.tokens(tx));
    expect(tokensA).toEqual([]);
    expect(tokensB.map((row) => row.token)).toEqual([token]);
  });

  it('POST /push-tokens: Expo biçiminde olmayan token veya platform → 422', async () => {
    const a = await insertRecipient('az');
    const auth = await bearer(a.id);
    const badToken = await http()
      .post('/api/v1/push-tokens')
      .set(auth)
      .send({ token: 'abc', platform: 'ios' });
    const badPlatform = await http()
      .post('/api/v1/push-tokens')
      .set(auth)
      .send({ token: expoToken(), platform: 'web' });
    expect([badToken.status, badPlatform.status]).toEqual([422, 422]);
  });

  it('GET /notifications: en yeni önce, cursor ile sayfalama, metin kullanıcının dilinde', async () => {
    const a = await insertRecipient('tr');
    const created = await seedNotifications(a.id, 3);
    const auth = await bearer(a.id);

    const first = await http().get('/api/v1/notifications?limit=2').set(auth);
    const firstPage = first.body as Page;
    const second = await http()
      .get(`/api/v1/notifications?limit=2&cursor=${firstPage.nextCursor ?? ''}`)
      .set(auth);
    const secondPage = second.body as Page;

    expect(first.status).toBe(200);
    expect(firstPage.items.map((item) => item.id)).toEqual([created[2], created[1]]);
    expect(firstPage.items[0]?.title).toBe(NOTIFICATION_TEMPLATES.test?.tr.title);
    expect(secondPage.items.map((item) => item.id)).toEqual([created[0]]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('GET /notifications: başka kullanıcının bildirimi listede yok', async () => {
    const a = await insertRecipient('az');
    const b = await insertRecipient('az');
    await seedNotifications(b.id, 2);

    const response = await http()
      .get('/api/v1/notifications')
      .set(await bearer(a.id));
    expect((response.body as Page).items).toEqual([]);
  });

  it('POST /notifications/read: ids ve all; başkasının kimliği etkilenmez', async () => {
    const a = await insertRecipient('az');
    const b = await insertRecipient('az');
    const [a1, a2] = await seedNotifications(a.id, 2);
    const [b1] = await seedNotifications(b.id, 1);
    const authA = await bearer(a.id);

    const byIds = await http()
      .post('/api/v1/notifications/read')
      .set(authA)
      .send({ ids: [a1, b1] });
    expect(byIds.status).toBe(204);
    let page = (await http().get('/api/v1/notifications').set(authA)).body as Page;
    expect(page.items.find((item) => item.id === a1)?.readAt).not.toBeNull();
    expect(page.items.find((item) => item.id === a2)?.readAt).toBeNull();

    await http().post('/api/v1/notifications/read').set(authA).send({ all: true }).expect(204);
    page = (await http().get('/api/v1/notifications').set(authA)).body as Page;
    expect(page.items.every((item) => item.readAt !== null)).toBe(true);

    const pageB = (
      await http()
        .get('/api/v1/notifications')
        .set(await bearer(b.id))
    ).body as Page;
    expect(pageB.items[0]?.readAt).toBeNull();

    const empty = await http().post('/api/v1/notifications/read').set(authA).send({});
    expect(empty.status).toBe(422);
  });

  it('US-054 AC2: PUT /notifications/preferences → 200 güncel harita; bilinmeyen tür 422', async () => {
    const a = await insertRecipient('az');
    const auth = await bearer(a.id);

    const off = await http()
      .put('/api/v1/notifications/preferences')
      .set(auth)
      .send({ test: false });
    const unknown = await http()
      .put('/api/v1/notifications/preferences')
      .set(auth)
      .send({ 'orders.secret': true });

    expect(off.status).toBe(200);
    // F2.9: yanıt tüm türlerin güncel tercihidir; dokunulmayan tür varsayılan açık.
    expect(off.body).toEqual({
      test: false,
      role_template_version: true,
      connection_request: true,
      connection_accepted: true,
      connection_rejected: true,
    });
    expect(unknown.status).toBe(422);
    const stored = await withUserTx({ userId: a.id }, (tx) => repo.pushEnabled(tx, 'test'));
    expect(stored).toBe(false);
  });
});
