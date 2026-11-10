// F2.15a bağlantı iptali (US-025 AC1, AC5, AC6; SF-07; state-machines §2). Gerçek PostgreSQL;
// uygulama bağlantısı RLS'e tabi app_user. Saat sabit. `ConnectionCancelledHandler` kancası
// sahte bir uygulamayla (sayaç + yapay hata) değiştirilir.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { Clock, FixedClock } from '../../../core/clock';
import type { Tx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  CONNECTION_CANCELLED_HANDLERS,
  type ConnectionCancelledEvent,
  type ConnectionCancelledHandler,
} from '../connection-cancelled.handler';
import {
  activeConnection,
  addMember,
  type Buyer,
  type Member,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
  type Seller,
} from './fixtures';

const NOW = new Date('2026-11-10T08:00:00Z');

/** Sahte kanca: çağrıları kaydeder; `failNext` ile bir kez hata verir; `orders` döner. */
class FakeHandler implements ConnectionCancelledHandler {
  calls: { event: ConnectionCancelledEvent; status: string | undefined }[] = [];
  failNext = false;
  orders = 0;

  async onConnectionCancelled(tx: Tx, event: ConnectionCancelledEvent) {
    // Aynı işlemde mi: bağlantı bu işlemde zaten `cancelled` görünmeli.
    const result = await tx.execute<{ status: string }>(
      sql`select status from connections where id = ${event.connectionId}`,
    );
    this.calls.push({ event, status: result.rows[0]?.status });
    if (this.failNext) {
      this.failNext = false;
      throw new Error('yapay kanca hatası');
    }
    return { cancelledOrders: this.orders };
  }
}

describe('F2.15a bağlantı iptali API', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let region: string;
  const handler = new FakeHandler();
  const second = new FakeHandler();

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        { provide: Clock, useValue: new FixedClock(NOW) },
        { provide: CONNECTION_CANCELLED_HANDLERS, useValue: [handler, second] },
      ],
    });
    region = await newRegion('Ləğv');
  });

  beforeEach(() => {
    for (const fake of [handler, second]) {
      fake.calls = [];
      fake.failNext = false;
      fake.orders = 0;
    }
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function auth(member: Member, businessId: string): Promise<Record<string, string>> {
    const signed = await app
      .get(TokenService)
      .signAccess({ userId: member.userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId };
  }

  const http = () => request(app.getHttpServer());
  const code = (body: unknown) => (body as { code: string }).code;

  async function cancel(member: Member, businessId: string, id: string, body: unknown) {
    return await http()
      .post(`/api/v1/connections/${id}/cancel`)
      .set(await auth(member, businessId))
      .send(body as object);
  }

  async function pair(): Promise<{ seller: Seller; buyer: Buyer; id: string }> {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    return { seller, buyer, id: await activeConnection(seller, buyer, NOW) };
  }

  async function row(id: string) {
    const [found] = await platformRows<{
      status: string;
      ended_at: Date | null;
      ended_by_side: string | null;
      end_reason: string | null;
      ended_by_user_id: string | null;
    }>(
      `select status, ended_at, ended_by_side, end_reason, ended_by_user_id
         from connections where id = $1`,
      [id],
    );
    return found;
  }

  async function events(id: string) {
    return await platformRows<{ type: string; payload: Record<string, string> }>(
      `select type, payload from outbox_events
        where aggregate_id = $1 and type in ('connection.cancelled', 'connection.cancel_notice')
        order by type, payload->>'userId'`,
      [id],
    );
  }

  async function audits(id: string) {
    return await platformRows<{ business_id: string; after: Record<string, unknown> }>(
      `select business_id, after from audit_logs
        where action = 'connection.cancelled' and target_id = $1`,
      [id],
    );
  }

  it('US-025-AC1 satıcı iptali: cancelled, ended_* alanları, audit (not yalnız audit), olay + karşı tarafın her adminine bildirim', async () => {
    const { seller, buyer, id } = await pair();
    const secondAdmin = await addMember(buyer.businessId, 'buyer_business_admin');
    await addMember(buyer.businessId, 'buyer_purchaser');
    handler.orders = 2;
    second.orders = 1;

    const res = await cancel(seller.admin, seller.businessId, id, {
      reason: 'payment_issue',
      note: '  Ödəniş gecikir.  ',
      confirm: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // US-025 AC3 sayısı kancaların toplamı (F4.5'e kadar gerçek kanca yok).
    expect(res.body).toEqual({ cancelledOrders: 3 });

    expect(await row(id)).toEqual({
      status: 'cancelled',
      ended_at: NOW,
      ended_by_side: 'seller',
      end_reason: 'payment_issue',
      ended_by_user_id: seller.admin.userId,
    });
    // Kanca aynı işlemde (bağlantıyı zaten cancelled görür), iki kanca sırayla.
    expect(handler.calls).toEqual([
      {
        event: {
          connectionId: id,
          sellerId: seller.businessId,
          buyerId: buyer.businessId,
          endedBySide: 'seller',
          endedAt: NOW,
          endedByUserId: seller.admin.userId,
        },
        status: 'cancelled',
      },
    ]);
    expect(second.calls).toHaveLength(1);

    const written = await events(id);
    expect(written.filter((event) => event.type === 'connection.cancelled')).toEqual([
      {
        type: 'connection.cancelled',
        payload: {
          connectionId: id,
          sellerId: seller.businessId,
          buyerId: buyer.businessId,
          endedBySide: 'seller',
        },
      },
    ]);
    const notices = written.filter((event) => event.type === 'connection.cancel_notice');
    expect(notices.map((event) => event.payload.userId).sort()).toEqual(
      [buyer.admin.userId, secondAdmin.userId].sort(),
    );
    for (const notice of notices) {
      expect(notice.payload).toEqual({
        connectionId: id,
        businessId: buyer.businessId,
        userId: notice.payload.userId,
      });
    }

    expect(await audits(id)).toEqual([
      {
        business_id: seller.businessId,
        after: {
          status: 'cancelled',
          endedBySide: 'seller',
          endReason: 'payment_issue',
          note: 'Ödəniş gecikir.',
          cancelledOrders: 3,
        },
      },
    ]);
  });

  it('US-025-AC1 alıcı iptali: ended_by_side buyer, bildirim satıcının adminlerine', async () => {
    const { seller, buyer, id } = await pair();
    await addMember(seller.businessId, 'seller_sales_rep');
    const res = await cancel(buyer.admin, buyer.businessId, id, {
      reason: 'quality_issue',
      confirm: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ cancelledOrders: 0 });
    expect(await row(id)).toMatchObject({
      status: 'cancelled',
      ended_by_side: 'buyer',
      end_reason: 'quality_issue',
      ended_by_user_id: buyer.admin.userId,
    });
    const notices = (await events(id)).filter((event) => event.type === 'connection.cancel_notice');
    // Yalnız işletme admini (satış temsilcisi değil).
    expect(notices.map((event) => event.payload)).toEqual([
      { connectionId: id, businessId: seller.businessId, userId: seller.admin.userId },
    ]);
  });

  it('US-025-AC1 satış müdürü iptal edebilir; temsilci ve satın almacı (connections.cancel yok) 403', async () => {
    const { seller, buyer, id } = await pair();
    const rep = await addMember(seller.businessId, 'seller_sales_rep');
    const purchaser = await addMember(buyer.businessId, 'buyer_purchaser');
    const body = { reason: 'other', confirm: true };
    expect((await cancel(rep, seller.businessId, id, body)).status).toBe(403);
    expect((await cancel(purchaser, buyer.businessId, id, body)).status).toBe(403);
    expect((await row(id))?.status).toBe('active');

    const manager = await addMember(seller.businessId, 'seller_sales_manager');
    expect((await cancel(manager, seller.businessId, id, body)).status).toBe(200);
  });

  it('US-025-AC5 iptal edilmiş bağlantı salt okunur: ikinci iptal 409, koşul 409, listede cancelled', async () => {
    const { seller, buyer, id } = await pair();
    const body = { reason: 'no_longer_working', confirm: true };
    expect((await cancel(buyer.admin, buyer.businessId, id, body)).status).toBe(200);

    const again = await cancel(seller.admin, seller.businessId, id, body);
    expect(again.status).toBe(409);
    expect(code(again.body)).toBe('INVALID_STATE_TRANSITION');

    const terms = await http()
      .patch(`/api/v1/connections/${id}/terms`)
      .set(await auth(seller.admin, seller.businessId))
      .send({ paymentTermDays: 10 });
    expect(terms.status).toBe(409);

    for (const [member, businessId] of [
      [seller.admin, seller.businessId],
      [buyer.admin, buyer.businessId],
    ] as const) {
      const list = await http()
        .get('/api/v1/connections?status=cancelled')
        .set(await auth(member, businessId));
      expect(list.status).toBe(200);
      expect((list.body as { items: { id: string; status: string }[] }).items).toEqual([
        expect.objectContaining({ id, status: 'cancelled', endedBySide: 'buyer' }),
      ]);
    }
    // Tek olay, tek audit (ikinci iptal hiçbir şey yazmadı).
    expect((await events(id)).filter((e) => e.type === 'connection.cancelled')).toHaveLength(1);
    expect(await audits(id)).toHaveLength(1);
  });

  it('US-025-AC6 alıcı yeniden bağlanamaz: istek gönderme alıcıya 403; satır yeniden active olmaz', async () => {
    const { seller, buyer, id } = await pair();
    expect(
      (await cancel(buyer.admin, buyer.businessId, id, { reason: 'other', confirm: true })).status,
    ).toBe(200);
    const res = await http()
      .post('/api/v1/connection-requests')
      .set(await auth(buyer.admin, buyer.businessId))
      .send({ buyerId: buyer.businessId });
    expect(res.status).toBe(403);
    // Karşı taraf gerekçeyi görmez (K2 = A, kullanıcı 2026-11-10): görünümde endReason yok.
    const list = await http()
      .get('/api/v1/connections?status=cancelled')
      .set(await auth(seller.admin, seller.businessId));
    const [item] = (list.body as { items: Record<string, unknown>[] }).items;
    expect(item).not.toHaveProperty('endReason');
    expect(JSON.stringify(list.body)).not.toContain('"other"');
  });

  it('F2.15a-T1 bekleme: alıcı iptalinden sonra satıcının isteği 409 COOLDOWN; satıcı iptalinde bekleme yok', async () => {
    const byBuyer = await pair();
    await cancel(byBuyer.buyer.admin, byBuyer.buyer.businessId, byBuyer.id, {
      reason: 'other',
      confirm: true,
    });
    const blocked = await http()
      .post('/api/v1/connection-requests')
      .set(await auth(byBuyer.seller.admin, byBuyer.seller.businessId))
      .send({ buyerId: byBuyer.buyer.businessId });
    expect(blocked.status).toBe(409);
    expect(code(blocked.body)).toBe('CONNECTION_COOLDOWN_ACTIVE');
    expect((blocked.body as { details: { cooldownUntil: string } }).details.cooldownUntil).toBe(
      new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );

    const bySeller = await pair();
    await cancel(bySeller.seller.admin, bySeller.seller.businessId, bySeller.id, {
      reason: 'other',
      confirm: true,
    });
    const allowed = await http()
      .post('/api/v1/connection-requests')
      .set(await auth(bySeller.seller.admin, bySeller.seller.businessId))
      .send({ buyerId: bySeller.buyer.businessId });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
  });

  it('F2.15a-T2 confirm yok/false → 422 CONFIRMATION_REQUIRED; geçersiz gövde 422; bağlantı active kalır', async () => {
    const { seller, id } = await pair();
    for (const body of [{ reason: 'other' }, { reason: 'other', confirm: false }, {}, null]) {
      const res = await cancel(seller.admin, seller.businessId, id, body);
      expect(res.status).toBe(422);
      expect(code(res.body)).toBe('CONFIRMATION_REQUIRED');
    }
    for (const body of [
      { confirm: true },
      { reason: 'blocked', confirm: true },
      { reason: 'other', note: 'x'.repeat(501), confirm: true },
      { reason: 'other', confirm: true, endedBySide: 'buyer' },
    ]) {
      const res = await cancel(seller.admin, seller.businessId, id, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(code(res.body)).toBe('VALIDATION_FAILED');
    }
    const bad = await cancel(seller.admin, seller.businessId, 'yok', {
      reason: 'other',
      confirm: true,
    });
    expect(bad.status).toBe(422);
    expect((await row(id))?.status).toBe('active');
    expect(handler.calls).toHaveLength(0);
  });

  it('F2.15a-T3 kanca hata verirse iptal geri alınır: bağlantı active, olay ve audit yok', async () => {
    const { seller, id } = await pair();
    second.failNext = true;
    const res = await cancel(seller.admin, seller.businessId, id, {
      reason: 'other',
      confirm: true,
    });
    expect(res.status).toBe(500);
    expect(await row(id)).toMatchObject({ status: 'active', ended_at: null, end_reason: null });
    expect(await events(id)).toEqual([]);
    expect(await audits(id)).toEqual([]);
    // Yeniden denemede geçer.
    expect(
      (await cancel(seller.admin, seller.businessId, id, { reason: 'other', confirm: true }))
        .status,
    ).toBe(200);
  });

  it('F2.15a-T4 başka çiftin bağlantısı 404 (iki yön)', async () => {
    const { id } = await pair();
    const otherSeller = await newSeller(region);
    const otherBuyer = await newBuyer(region);
    const body = { reason: 'other', confirm: true };
    for (const [member, businessId] of [
      [otherSeller.admin, otherSeller.businessId],
      [otherBuyer.admin, otherBuyer.businessId],
    ] as const) {
      const res = await cancel(member, businessId, id, body);
      expect(res.status).toBe(404);
    }
    expect(
      (await cancel(otherSeller.admin, otherSeller.businessId, randomUUID(), body)).status,
    ).toBe(404);
    expect((await row(id))?.status).toBe('active');
  });

  it('F2.15a-T7 engel de iptal yolundan: kanca + bildirim; blocked bilgisi karşı tarafa sızmaz (Mimar notu 3)', async () => {
    const { seller, buyer, id } = await pair();
    const res = await http()
      .post('/api/v1/blocks')
      .set(await auth(buyer.admin, buyer.businessId))
      .send({ sellerId: seller.businessId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await row(id)).toMatchObject({ status: 'cancelled', end_reason: 'blocked' });
    expect(handler.calls.map((call) => call.event.connectionId)).toEqual([id]);

    const notices = (await events(id)).filter((event) => event.type === 'connection.cancel_notice');
    expect(notices.map((event) => event.payload)).toEqual([
      { connectionId: id, businessId: seller.businessId, userId: seller.admin.userId },
    ]);
    // Bildirim yükü normal iptalle aynı (gerekçe ve iptal eden yok); türe dönüşümü
    // notification-types.test (F2.15a-T7) sınar.
    expect(JSON.stringify(notices)).not.toContain('blocked');
    // Satıcının görünümü: kim iptal etti (buyer), neden yok.
    const list = await http()
      .get('/api/v1/connections?status=cancelled')
      .set(await auth(seller.admin, seller.businessId));
    expect(JSON.stringify(list.body)).not.toContain('blocked');
    expect((list.body as { items: unknown[] }).items).toEqual([
      expect.objectContaining({ id, status: 'cancelled', endedBySide: 'buyer' }),
    ]);
  });
});
