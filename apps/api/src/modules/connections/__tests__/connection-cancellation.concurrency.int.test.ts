// F2.15a eşzamanlılık (state-machines §2, SF-07; Mimar notu 5): gerçek PostgreSQL, çok bağlantılı
// havuz. Bağlantı satırı FOR UPDATE ile kilitlenir; iki tarafın aynı anda iptali ve iptal + engel
// yarışında tek etki: bir iptal, tek `connection.cancelled` olayı, tek bildirim seti.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  activeConnection,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
} from './fixtures';

// setup-env havuzu tek bağlantıya indirir; gerçek paralel işlem için açılır.
process.env.DB_POOL_MAX = '6';

describe('F2.15a bağlantı iptali eşzamanlılığı', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let region: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    region = await newRegion('İptal yarışı');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function headers(userId: string, businessId: string) {
    const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId };
  }

  async function effects(id: string) {
    const cancelled = await platformRows(
      `select 1 from outbox_events where type = 'connection.cancelled' and aggregate_id = $1`,
      [id],
    );
    const notices = await platformRows(
      `select 1 from outbox_events where type = 'connection.cancel_notice' and aggregate_id = $1`,
      [id],
    );
    return { cancelled: cancelled.length, notices: notices.length };
  }

  it('F2.15a-T8 iki taraf aynı anda iptal eder: yalnız biri 200, diğeri 409; tek olay, tek bildirim', async () => {
    for (let round = 0; round < 3; round++) {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      const id = await activeConnection(seller, buyer, new Date());
      const server = app.getHttpServer();
      const body = { reason: 'other', confirm: true };
      const responses = await Promise.all([
        request(server)
          .post(`/api/v1/connections/${id}/cancel`)
          .set(await headers(seller.admin.userId, seller.businessId))
          .send(body),
        request(server)
          .post(`/api/v1/connections/${id}/cancel`)
          .set(await headers(buyer.admin.userId, buyer.businessId))
          .send(body),
      ]);
      expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
      const loser = responses.find((res) => res.status === 409);
      expect((loser?.body as { code: string }).code).toBe('INVALID_STATE_TRANSITION');
      // Her taraf tek admin: tek bildirim (kazananın karşı tarafına).
      expect(await effects(id)).toEqual({ cancelled: 1, notices: 1 });
      const audits = await platformRows(
        `select 1 from audit_logs where action = 'connection.cancelled' and target_id = $1`,
        [id],
      );
      expect(audits).toHaveLength(1);
    }
  });

  it('F2.15a-T8 satıcı iptali + alıcı engeli yarışı: tek iptal, tek olay; engel her durumda yazılır', async () => {
    for (let round = 0; round < 3; round++) {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      const id = await activeConnection(seller, buyer, new Date());
      const server = app.getHttpServer();
      const [cancelled, blocked] = await Promise.all([
        request(server)
          .post(`/api/v1/connections/${id}/cancel`)
          .set(await headers(seller.admin.userId, seller.businessId))
          .send({ reason: 'other', confirm: true }),
        request(server)
          .post('/api/v1/blocks')
          .set(await headers(buyer.admin.userId, buyer.businessId))
          .send({ sellerId: seller.businessId }),
      ]);
      expect(blocked.status).toBe(201);
      const [row] = await platformRows<{ ended_by_side: string; end_reason: string }>(
        'select ended_by_side, end_reason from connections where id = $1',
        [id],
      );
      if (cancelled.status === 200) {
        expect(row).toEqual({ ended_by_side: 'seller', end_reason: 'other' });
      } else {
        expect(cancelled.status).toBe(409);
        expect(row).toEqual({ ended_by_side: 'buyer', end_reason: 'blocked' });
      }
      expect(await effects(id)).toEqual({ cancelled: 1, notices: 1 });
    }
  });
});
