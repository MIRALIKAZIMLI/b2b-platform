// F2.12a bağlantı isteği uçları (US-021 AC1–AC7, US-022 AC2, test-strategy §3.2, Mimar K1–K6).
// Gerçek PostgreSQL; uygulama bağlantısı RLS'e tabi app_user. Saat sabit: 2026-11-10 08:00Z
// (Bakü 12:00). Eşzamanlılık connection-requests.concurrency.int.test.ts'te, kiracı izolasyonu
// connections.isolation.test.ts'te.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { Clock, FixedClock } from '../../../core/clock';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  addMember,
  type Buyer,
  insertBlock,
  insertConnection,
  insertRequest,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
  type Seller,
} from './fixtures';

const NOW = new Date('2026-11-10T08:00:00Z');
const TODAY_BAKU = '2026-11-10';
const DAY = 24 * 60 * 60 * 1000;

describe('F2.12a bağlantı isteği API', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const clock = new FixedClock(NOW);
  let city: string;
  let district: string;
  let otherCity: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        { provide: Clock, useValue: clock },
      ],
    });
    city = await newRegion('Şəhər');
    district = await newRegion('Rayon', city);
    otherCity = await newRegion('Uzaq şəhər');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function auth(userId: string, businessId: string): Promise<Record<string, string>> {
    const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId };
  }

  async function send(
    seller: Seller,
    body: Record<string, unknown>,
    userId: string = seller.admin.userId,
  ) {
    return await request(app.getHttpServer())
      .post('/api/v1/connection-requests')
      .set(await auth(userId, seller.businessId))
      .send(body);
  }

  async function setQuotaOverride(sellerId: string, value: number | null): Promise<void> {
    await platformRows(
      `insert into entitlement_overrides (business_id, key, value)
       values ($1, 'connection_requests.daily', $2::jsonb)`,
      [sellerId, JSON.stringify(value)],
    );
  }

  const code = (body: unknown) => (body as { code: string }).code;
  const details = (body: unknown) => (body as { details: Record<string, unknown> }).details;

  it('US-021-AC1 pending istek, expires_at = +14 gün, yerel gün, adminlere bildirim olayı', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    const secondAdmin = await addMember(buyer.businessId, 'buyer_business_admin');
    await addMember(buyer.businessId, 'buyer_purchaser');

    const res = await send(seller, {
      buyerId: buyer.businessId,
      message: '  Salam, əməkdaşlıq təklif edirik.  ',
      proposedPaymentTermDays: 15,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = (res.body as { id: string }).id;
    expect(res.body).toEqual({
      id,
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      status: 'pending',
      message: 'Salam, əməkdaşlıq təklif edirik.',
      proposedPaymentTermDays: 15,
      expiresAt: new Date(NOW.getTime() + 14 * DAY).toISOString(),
      createdAt: NOW.toISOString(),
    });
    const [row] = await platformRows<{ seller_local_date: string; sent_by_user_id: string }>(
      `select seller_local_date::text, sent_by_user_id from connection_requests where id = $1`,
      [id],
    );
    expect(row).toEqual({ seller_local_date: TODAY_BAKU, sent_by_user_id: seller.admin.userId });

    const events = await platformRows<{ payload: { userId: string }; business_ids: string[] }>(
      `select payload, business_ids from outbox_events
        where type = 'connection.request_created' and aggregate_id = $1`,
      [id],
    );
    expect(events.map((e) => e.payload.userId).sort()).toEqual(
      [buyer.admin.userId, secondAdmin.userId].sort(),
    );
    expect(events[0]?.business_ids.sort()).toEqual([seller.businessId, buyer.businessId].sort());
  });

  it('US-021-AC2 aynı çiftte bekleyen istek → 409 CONNECTION_REQUEST_ALREADY_PENDING', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    expect((await send(seller, { buyerId: buyer.businessId })).status).toBe(201);
    const second = await send(seller, { buyerId: buyer.businessId });
    expect(second.status).toBe(409);
    expect(code(second.body)).toBe('CONNECTION_REQUEST_ALREADY_PENDING');
  });

  it('F2.12a-M2 Idempotency-Key: aynı anahtar + gövde → aynı 201, tek satır; farklı gövde → 409', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    const key = `conn-${randomUUID()}`;
    const post = async (body: Record<string, unknown>) =>
      await request(app.getHttpServer())
        .post('/api/v1/connection-requests')
        .set({ ...(await auth(seller.admin.userId, seller.businessId)), 'Idempotency-Key': key })
        .send(body);
    const first = await post({ buyerId: buyer.businessId, message: 'Salam' });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const retry = await post({ buyerId: buyer.businessId, message: 'Salam' });
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    const rows = await platformRows(
      'select 1 from connection_requests where seller_id = $1 and buyer_id = $2',
      [seller.businessId, buyer.businessId],
    );
    expect(rows).toHaveLength(1);
    const changed = await post({ buyerId: buyer.businessId, message: 'Başqa' });
    expect(changed.status).toBe(409);
    expect(code(changed.body)).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('US-021-AC3 aktif bağlantı → 409 CONNECTION_ALREADY_ACTIVE', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    const requestId = await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'accepted',
      createdAt: new Date(NOW.getTime() - 5 * DAY),
      respondedAt: new Date(NOW.getTime() - 4 * DAY),
      sellerLocalDate: '2026-11-05',
    });
    await insertConnection({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      requestId,
      startedAt: new Date(NOW.getTime() - 4 * DAY),
    });
    const res = await send(seller, { buyerId: buyer.businessId });
    expect(res.status).toBe(409);
    expect(code(res.body)).toBe('CONNECTION_ALREADY_ACTIVE');
  });

  it('US-021-AC4 perakendeci engellemiş → 409 CONNECTION_BLOCKED', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    await insertBlock(buyer.businessId, seller.businessId, buyer.admin.userId);
    const res = await send(seller, { buyerId: buyer.businessId });
    expect(res.status).toBe(409);
    expect(code(res.body)).toBe('CONNECTION_BLOCKED');
  });

  it('US-021-AC5 30 gün içinde red → 409 + bekleme bitişi; perakendeci iptali de', async () => {
    const seller = await newSeller(city);
    const rejectedBuyer = await newBuyer(district);
    const rejectedAt = new Date(NOW.getTime() - 10 * DAY);
    await insertRequest({
      sellerId: seller.businessId,
      buyerId: rejectedBuyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'rejected',
      createdAt: new Date(rejectedAt.getTime() - DAY),
      respondedAt: rejectedAt,
      sellerLocalDate: '2026-10-30',
    });
    const res = await send(seller, { buyerId: rejectedBuyer.businessId });
    expect(res.status).toBe(409);
    expect(code(res.body)).toBe('CONNECTION_COOLDOWN_ACTIVE');
    expect(details(res.body)).toEqual({
      cooldownUntil: new Date(rejectedAt.getTime() + 30 * DAY).toISOString(),
    });

    const cancelBuyer = await newBuyer(district);
    await cancelledConnection(seller, cancelBuyer, 'buyer', 3);
    const afterCancel = await send(seller, { buyerId: cancelBuyer.businessId });
    expect(afterCancel.status).toBe(409);
    expect(code(afterCancel.body)).toBe('CONNECTION_COOLDOWN_ACTIVE');
  });

  it('§3.2 bekleme ayarı işletme → plan → platform: işletme kapsamı 7 gün', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    // Platform 30 gün; satıcıya özel 7 gün. 10 gün önceki ret artık engel değil.
    await platformRows(
      `select settings_put('business', $1, 'connection.cooldown_after_reject_days', '7'::jsonb)`,
      [seller.businessId],
    );
    await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'rejected',
      createdAt: new Date(NOW.getTime() - 11 * DAY),
      respondedAt: new Date(NOW.getTime() - 10 * DAY),
      sellerLocalDate: '2026-10-30',
    });
    expect((await send(seller, { buyerId: buyer.businessId })).status).toBe(201);
  });

  it('US-021-AC6 kota dolu → 429, retryAfter ve Retry-After = Bakü gece yarısına kalan', async () => {
    const seller = await newSeller(city);
    await setQuotaOverride(seller.businessId, 2);
    for (let i = 0; i < 2; i++) {
      const buyer = await newBuyer(district);
      expect((await send(seller, { buyerId: buyer.businessId })).status).toBe(201);
    }
    const third = await newBuyer(district);
    const res = await send(seller, { buyerId: third.businessId });
    expect(res.status).toBe(429);
    expect(code(res.body)).toBe('CONNECTION_DAILY_QUOTA_EXCEEDED');
    // 08:00Z = Bakü 12:00 → 12 saat.
    expect(details(res.body)).toEqual({ retryAfter: 12 * 3600 });
    expect(res.headers['retry-after']).toBe(String(12 * 3600));
  });

  it('K1 etkin kota ayar ile plan hakkının küçüğü: işletme ayarı 1, hak sınırsız', async () => {
    const seller = await newSeller(city);
    await platformRows(
      `select settings_put('business', $1, 'connection.daily_request_quota', '1'::jsonb)`,
      [seller.businessId],
    );
    expect((await send(seller, { buyerId: (await newBuyer(district)).businessId })).status).toBe(
      201,
    );
    const res = await send(seller, { buyerId: (await newBuyer(district)).businessId });
    expect(res.status).toBe(429);
  });

  it('US-022-AC2 geri çekilen istek de bugünkü kotaya sayılır', async () => {
    const seller = await newSeller(city);
    await setQuotaOverride(seller.businessId, 1);
    const buyer = await newBuyer(district);
    await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'withdrawn',
      createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      sellerLocalDate: TODAY_BAKU,
    });
    const res = await send(seller, { buyerId: buyer.businessId });
    expect(res.status).toBe(429);
    // Dünkü istek bugünkü kotaya girmez.
    const other = await newSeller(city);
    await setQuotaOverride(other.businessId, 1);
    await insertRequest({
      sellerId: other.businessId,
      buyerId: buyer.businessId,
      sentByUserId: other.admin.userId,
      status: 'withdrawn',
      createdAt: new Date(NOW.getTime() - DAY),
      sellerLocalDate: '2026-11-09',
    });
    expect((await send(other, { buyerId: buyer.businessId })).status).toBe(201);
  });

  it('US-021-AC7 toptancının kendi iptalinden sonra bekleme yok', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    await cancelledConnection(seller, buyer, 'seller', 1);
    expect((await send(seller, { buyerId: buyer.businessId })).status).toBe(201);
  });

  it('K3 hedef: yok, kendisi, buyer yeteneği olmayan, askıdaki işletme → 404; dizinde gizli → 201', async () => {
    const seller = await newSeller(city);
    const notFound = async (buyerId: string) => {
      const res = await send(seller, { buyerId });
      expect(res.status, buyerId).toBe(404);
      expect(code(res.body)).toBe('NOT_FOUND');
    };
    await notFound(randomUUID());
    await notFound(seller.businessId);
    await notFound((await newSeller(city)).businessId);
    const suspended = await newBuyer(district);
    await platformRows(`update businesses set status = 'suspended' where id = $1`, [
      suspended.businessId,
    ]);
    await notFound(suspended.businessId);

    const hidden = await newBuyer(district, false);
    expect((await send(seller, { buyerId: hidden.businessId })).status).toBe(201);
  });

  it('K2 temsilci yalnız atandığı bölgedeki perakendeciye gönderir (ilçe şehir atamasıyla kapsanır)', async () => {
    const seller = await newSeller(city);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [city]);
    const inside = await newBuyer(district);
    const outside = await newBuyer(otherCity);
    expect((await send(seller, { buyerId: inside.businessId }, rep.userId)).status).toBe(201);
    const res = await send(seller, { buyerId: outside.businessId }, rep.userId);
    expect(res.status).toBe(404);
  });

  it('K4 salt-okunur abonelik → 403 SUBSCRIPTION_READ_ONLY; izinsiz rol → 403', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    await platformRows(`update subscriptions set status = 'read_only' where business_id = $1`, [
      seller.businessId,
    ]);
    const res = await send(seller, { buyerId: buyer.businessId });
    expect(res.status).toBe(403);
    expect(code(res.body)).toBe('SUBSCRIPTION_READ_ONLY');

    const other = await newSeller(city);
    const warehouse = await addMember(other.businessId, 'seller_warehouse');
    const denied = await send(other, { buyerId: buyer.businessId }, warehouse.userId);
    expect(denied.status).toBe(403);
    // Perakendeci isteği gönderemez (yetenek).
    const asBuyer = await request(app.getHttpServer())
      .post('/api/v1/connection-requests')
      .set(await auth(buyer.admin.userId, buyer.businessId))
      .send({ buyerId: seller.businessId });
    expect(asBuyer.status).toBe(403);
  });

  it('F2.12a gövde doğrulaması: mesaj > 500, vade > 180, bilinmeyen alan → 422', async () => {
    const seller = await newSeller(city);
    const buyer = await newBuyer(district);
    for (const body of [
      { buyerId: buyer.businessId, message: 'a'.repeat(501) },
      { buyerId: buyer.businessId, proposedPaymentTermDays: 181 },
      { buyerId: buyer.businessId, sellerId: randomUUID() },
      { buyerId: 'x' },
    ]) {
      expect((await send(seller, body)).status, JSON.stringify(body)).toBe(422);
    }
  });

  it('F2.12a gönderilenler: yeniden eskiye, ünvanla, imleç ve durum süzgeci; temsilci yalnız kendininkini', async () => {
    const seller = await newSeller(city);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [city]);
    const buyers: Buyer[] = [];
    for (let i = 0; i < 3; i++) buyers.push(await newBuyer(district));
    for (const buyer of buyers.slice(0, 2)) {
      expect((await send(seller, { buyerId: buyer.businessId })).status).toBe(201);
    }
    const third = buyers[2];
    if (third === undefined) throw new Error('perakendeci yok');
    expect((await send(seller, { buyerId: third.businessId }, rep.userId)).status).toBe(201);

    const list = async (query: Record<string, string>, userId = seller.admin.userId) =>
      await request(app.getHttpServer())
        .get('/api/v1/connection-requests/outgoing')
        .query(query)
        .set(await auth(userId, seller.businessId));

    const first = await list({ limit: '2' });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const page = first.body as {
      items: { buyerId: string; buyerName: string | null; status: string }[];
      nextCursor: string | null;
    };
    expect(page.items.map((i) => i.buyerId)).toEqual([third.businessId, buyers[1]?.businessId]);
    expect(page.items[0]?.buyerName).toBe(`Market ${third.businessId.slice(0, 8)}`);
    const second = await list({ limit: '2', cursor: page.nextCursor ?? '' });
    expect((second.body as typeof page).items.map((i) => i.buyerId)).toEqual([
      buyers[0]?.businessId,
    ]);
    expect((second.body as typeof page).nextCursor).toBeNull();

    expect(((await list({ status: 'rejected' })).body as typeof page).items).toEqual([]);
    const repView = (await list({}, rep.userId)).body as typeof page;
    expect(repView.items.map((i) => i.buyerId)).toEqual([third.businessId]);
    expect((await list({ limit: '51' })).status).toBe(422);
  });

  async function cancelledConnection(
    seller: Seller,
    buyer: Buyer,
    by: 'seller' | 'buyer',
    daysAgo: number,
  ): Promise<void> {
    const requestId = await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'accepted',
      createdAt: new Date(NOW.getTime() - (daysAgo + 10) * DAY),
      respondedAt: new Date(NOW.getTime() - (daysAgo + 9) * DAY),
      sellerLocalDate: '2026-10-01',
    });
    await insertConnection({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      requestId,
      startedAt: new Date(NOW.getTime() - (daysAgo + 9) * DAY),
      cancelled: { at: new Date(NOW.getTime() - daysAgo * DAY), by },
    });
  }
});
