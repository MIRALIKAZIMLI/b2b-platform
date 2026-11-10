// F2.13a eşzamanlılık (state-machines §1, SF-03; Müfettiş 17 M1 istek + engel yarışı): gerçek PostgreSQL, çok bağlantılı havuz. İstek
// satırı FOR UPDATE ile kilitlenir; aynı isteğe eşzamanlı kabul + geri çekme / kabul + red
// yarışında yalnız biri geçer, diğeri 409 INVALID_STATE_TRANSITION alır; en fazla bir bağlantı.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { insertRequest, newBuyer, newRegion, newSeller, platformRows, runSeeds } from './fixtures';

// setup-env havuzu tek bağlantıya indirir; gerçek paralel işlem için açılır.
process.env.DB_POOL_MAX = '6';

describe('F2.13a bağlantı yanıtı eşzamanlılığı', () => {
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
    region = await newRegion('Yarış');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function headers(userId: string, businessId: string) {
    const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId };
  }

  it('state-machines §1 eşzamanlı kabul + geri çekme + red: yalnız biri 200, en fazla bir bağlantı', async () => {
    for (let round = 0; round < 3; round++) {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      const id = await insertRequest({
        sellerId: seller.businessId,
        buyerId: buyer.businessId,
        sentByUserId: seller.admin.userId,
        status: 'pending',
        createdAt: new Date(),
        sellerLocalDate: '2026-11-10',
      });
      const buyerHeaders = await headers(buyer.admin.userId, buyer.businessId);
      const sellerHeaders = await headers(seller.admin.userId, seller.businessId);
      const server = app.getHttpServer();
      const responses = await Promise.all([
        request(server)
          .post(`/api/v1/connection-requests/${id}/accept`)
          .set(buyerHeaders)
          .send({ confirmDataSharing: true }),
        request(server)
          .post(`/api/v1/connection-requests/${id}/withdraw`)
          .set(sellerHeaders)
          .send({}),
        request(server).post(`/api/v1/connection-requests/${id}/reject`).set(buyerHeaders).send({}),
        request(server)
          .post(`/api/v1/connection-requests/${id}/accept`)
          .set(buyerHeaders)
          .send({ confirmDataSharing: true }),
      ]);
      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 409, 409, 409]);
      for (const res of responses.filter((r) => r.status === 409)) {
        expect((res.body as { code: string }).code).toBe('INVALID_STATE_TRANSITION');
      }
      const connections = await platformRows('select 1 from connections where request_id = $1', [
        id,
      ]);
      const [row] = await platformRows<{ status: string }>(
        'select status from connection_requests where id = $1',
        [id],
      );
      expect(connections).toHaveLength(row?.status === 'accepted' ? 1 : 0);
    }
  });

  it('Müfettiş 17 M1 eşzamanlı istek + engel: engel varken pending istek kalmaz', async () => {
    for (let round = 0; round < 5; round++) {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      // Engel için ilişki: önceden geri çekilmiş bir istek (bekleme süresi yok).
      await insertRequest({
        sellerId: seller.businessId,
        buyerId: buyer.businessId,
        sentByUserId: seller.admin.userId,
        status: 'withdrawn',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        sellerLocalDate: '2026-11-08',
      });
      const server = app.getHttpServer();
      const [sent, blocked] = await Promise.all([
        request(server)
          .post('/api/v1/connection-requests')
          .set(await headers(seller.admin.userId, seller.businessId))
          .send({ buyerId: buyer.businessId }),
        request(server)
          .post('/api/v1/blocks')
          .set(await headers(buyer.admin.userId, buyer.businessId))
          .send({ sellerId: seller.businessId }),
      ]);
      expect(blocked.status).toBe(201);
      if (sent.status === 201) {
        // İstek önce geçtiyse engel onu reddetmiş olmalı.
        const id = (sent.body as { id: string }).id;
        const [row] = await platformRows<{ status: string }>(
          'select status from connection_requests where id = $1',
          [id],
        );
        expect(row?.status).toBe('rejected');
      } else {
        expect(sent.status).toBe(409);
        expect((sent.body as { code: string }).code).toBe('CONNECTION_BLOCKED');
      }
      const pending = await platformRows(
        `select 1 from connection_requests
          where seller_id = $1 and buyer_id = $2 and status = 'pending'`,
        [seller.businessId, buyer.businessId],
      );
      expect(pending).toHaveLength(0);
    }
  });
});
