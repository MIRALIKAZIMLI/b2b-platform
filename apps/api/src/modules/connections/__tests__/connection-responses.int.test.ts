// F2.13a isteğe yanıt, geri çekme ve engel uçları (US-022 AC1–AC2, US-023 AC1–AC6, SF-03,
// state-machines §1–2, US-054). Gerçek PostgreSQL; uygulama bağlantısı RLS'e tabi app_user.
// Saat sabit: 2026-11-10 08:00Z (Bakü 12:00). Eşzamanlılık connection-responses.concurrency,
// bekçiler ve DEFINER çağıran kuralı connection-responses.isolation dosyalarında.
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
  insertConnection,
  insertRequest,
  type Member,
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

describe('F2.13a bağlantı isteğine yanıt API', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const clock = new FixedClock(NOW);
  let region: string;

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
    region = await newRegion('Cavab');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function auth(userId: string, businessId: string): Promise<Record<string, string>> {
    const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId };
  }

  const http = () => request(app.getHttpServer());
  const code = (body: unknown) => (body as { code: string }).code;

  async function send(seller: Seller, buyer: Buyer, body: Record<string, unknown> = {}) {
    return await http()
      .post('/api/v1/connection-requests')
      .set(await auth(seller.admin.userId, seller.businessId))
      .send({ buyerId: buyer.businessId, ...body });
  }

  async function pending(seller: Seller, buyer: Buyer, body: Record<string, unknown> = {}) {
    const res = await send(seller, buyer, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { id: string }).id;
  }

  async function incoming(buyer: Buyer, member: Member = buyer.admin) {
    return await http()
      .get('/api/v1/connection-requests/incoming')
      .set(await auth(member.userId, buyer.businessId));
  }

  async function act(
    buyer: Buyer,
    id: string,
    action: 'accept' | 'reject',
    body: unknown = { confirmDataSharing: true },
    member: Member = buyer.admin,
  ) {
    return await http()
      .post(`/api/v1/connection-requests/${id}/${action}`)
      .set(await auth(member.userId, buyer.businessId))
      .send(body as object);
  }

  async function withdraw(seller: Seller, id: string, member: Member = seller.admin) {
    return await http()
      .post(`/api/v1/connection-requests/${id}/withdraw`)
      .set(await auth(member.userId, seller.businessId))
      .send({});
  }

  async function block(buyer: Buyer, sellerId: string, member: Member = buyer.admin) {
    return await http()
      .post('/api/v1/blocks')
      .set(await auth(member.userId, buyer.businessId))
      .send({ sellerId });
  }

  async function requestStatus(id: string): Promise<string | undefined> {
    const [row] = await platformRows<{ status: string }>(
      'select status from connection_requests where id = $1',
      [id],
    );
    return row?.status;
  }

  async function eventUsers(type: string, aggregateId: string): Promise<string[]> {
    const rows = await platformRows<{ payload: { userId?: string } }>(
      'select payload from outbox_events where type = $1 and aggregate_id = $2',
      [type, aggregateId],
    );
    return rows.map((row) => row.payload.userId ?? '').sort();
  }

  it('US-023-AC1 gelen listede yalnız satıcı özeti, mesaj ve önerilen vade (ürün/fiyat yok)', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const otherBuyer = await newBuyer(region);
    await platformRows(
      'update seller_profiles set description = $2::jsonb where business_id = $1',
      [seller.businessId, JSON.stringify({ az: 'Topdan ərzaq', tr: 'Toptan gıda' })],
    );
    const id = await pending(seller, buyer, { message: 'Salam', proposedPaymentTermDays: 30 });
    await pending(seller, otherBuyer);

    const res = await incoming(buyer);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          id,
          sellerId: seller.businessId,
          buyerId: buyer.businessId,
          status: 'pending',
          message: 'Salam',
          proposedPaymentTermDays: 30,
          expiresAt: new Date(NOW.getTime() + 14 * DAY).toISOString(),
          createdAt: NOW.toISOString(),
          seller: {
            id: seller.businessId,
            name: `Toptan ${seller.businessId.slice(0, 8)}`,
            logoUrl: null,
            description: { az: 'Topdan ərzaq', tr: 'Toptan gıda' },
          },
        },
      ],
      nextCursor: null,
    });
  });

  it('US-023-AC1 süresi geçmiş, yanıtlanmış ve geri çekilmiş istekler listede yok; sayfalama', async () => {
    const buyer = await newBuyer(region);
    const sellers = await Promise.all([1, 2, 3, 4].map(() => newSeller(region)));
    const [s1, s2, s3, s4] = sellers as [Seller, Seller, Seller, Seller];
    await insertRequest({
      sellerId: s1.businessId,
      buyerId: buyer.businessId,
      sentByUserId: s1.admin.userId,
      status: 'pending',
      createdAt: new Date(NOW.getTime() - 15 * DAY),
      expiresAt: new Date(NOW.getTime() - DAY),
      sellerLocalDate: '2026-10-26',
    });
    await insertRequest({
      sellerId: s2.businessId,
      buyerId: buyer.businessId,
      sentByUserId: s2.admin.userId,
      status: 'withdrawn',
      createdAt: new Date(NOW.getTime() - DAY),
      sellerLocalDate: '2026-11-09',
    });
    const a = await pending(s3, buyer);
    const b = await pending(s4, buyer);

    const first = await http()
      .get('/api/v1/connection-requests/incoming?limit=1')
      .set(await auth(buyer.admin.userId, buyer.businessId));
    const page1 = first.body as { items: { id: string }[]; nextCursor: string | null };
    expect(page1.items.map((item) => item.id)).toEqual([b]);
    expect(page1.nextCursor).toBe(b);
    const second = await http()
      .get(`/api/v1/connection-requests/incoming?limit=1&cursor=${b}`)
      .set(await auth(buyer.admin.userId, buyer.businessId));
    expect((second.body as typeof page1).items.map((item) => item.id)).toEqual([a]);
    expect((second.body as typeof page1).nextCursor).toBeNull();
  });

  it('US-023-AC2 kabul: active bağlantı, istek accepted, önerilen vade, audit, satıcı tarafına bildirim', async () => {
    const seller = await newSeller(region);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    const secondAdmin = await addMember(seller.businessId, 'seller_business_admin');
    const buyer = await newBuyer(region);
    const signed = await http()
      .post('/api/v1/connection-requests')
      .set(await auth(rep.userId, seller.businessId))
      .send({ buyerId: buyer.businessId, proposedPaymentTermDays: 21 });
    expect(signed.status, JSON.stringify(signed.body)).toBe(201);
    const id = (signed.body as { id: string }).id;

    const res = await act(buyer, id, 'accept');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const connectionId = (res.body as { id: string }).id;
    expect(res.body).toEqual({
      id: connectionId,
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      counterpartyName: `Toptan ${seller.businessId.slice(0, 8)}`,
      status: 'active',
      terms: {
        priceListId: null,
        branchPricingEnabled: false,
        creditLimit: null,
        paymentTermDays: 21,
        salesRepMembershipId: null,
      },
      startedAt: NOW.toISOString(),
      endedAt: null,
      endedBySide: null,
    });
    const [row] = await platformRows<{
      status: string;
      responded_at: Date;
      responded_by_user_id: string;
    }>('select status, responded_at, responded_by_user_id from connection_requests where id = $1', [
      id,
    ]);
    expect(row).toEqual({
      status: 'accepted',
      responded_at: NOW,
      responded_by_user_id: buyer.admin.userId,
    });
    const [audit] = await platformRows<{ action: string; after: Record<string, unknown> }>(
      `select action, after from audit_logs where business_id = $1 and target_id = $2`,
      [buyer.businessId, connectionId],
    );
    expect(audit).toEqual({
      action: 'connection.accepted',
      after: {
        requestId: id,
        sellerId: seller.businessId,
        confirmDataSharing: true,
        paymentTermDays: 21,
      },
    });
    // US-054: isteği gönderen temsilci + satıcının iki admini; alıcının kendisi değil.
    expect(await eventUsers('connection.accepted', id)).toEqual(
      [rep.userId, seller.admin.userId, secondAdmin.userId].sort(),
    );
    // Gelen listeden kalkar; satıcı yeni istek gönderemez (aktif bağlantı).
    expect((await incoming(buyer)).body).toEqual({ items: [], nextCursor: null });
    expect(code((await send(seller, buyer)).body)).toBe('CONNECTION_ALREADY_ACTIVE');
  });

  it('US-023-AC2 önerilen vade yoksa bağlantı vadesi 0; onay gövdesi yoksa 422; tekrar kabul 409', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller, buyer);

    expect((await act(buyer, id, 'accept', {})).status).toBe(422);
    expect((await act(buyer, id, 'accept', { confirmDataSharing: false })).status).toBe(422);
    expect(await requestStatus(id)).toBe('pending');

    const res = await act(buyer, id, 'accept');
    expect(res.status).toBe(200);
    expect((res.body as { terms: { paymentTermDays: number } }).terms.paymentTermDays).toBe(0);
    const again = await act(buyer, id, 'accept');
    expect(again.status).toBe(409);
    expect(code(again.body)).toBe('INVALID_STATE_TRANSITION');
  });

  it('US-023-AC2 süresi geçmiş istek kabul edilemez ve reddedilemez (409 CONNECTION_REQUEST_EXPIRED)', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'pending',
      createdAt: new Date(NOW.getTime() - 14 * DAY),
      expiresAt: NOW,
      sellerLocalDate: '2026-10-27',
    });
    const res = await act(buyer, id, 'accept');
    expect(res.status).toBe(409);
    expect(code(res.body)).toBe('CONNECTION_REQUEST_EXPIRED');
    // Müfettiş 17 L1: red de aynı; bekleme süresi başlamaz.
    const rejected = await act(buyer, id, 'reject', {});
    expect(rejected.status).toBe(409);
    expect(code(rejected.body)).toBe('CONNECTION_REQUEST_EXPIRED');
    expect(await requestStatus(id)).toBe('pending');
  });

  it('US-023-AC3 red: rejected, bildirim, listeden kalkar; satıcı için bekleme süresi başlar', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller, buyer);

    const res = await act(buyer, id, 'reject', {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id, status: 'rejected' });
    expect(await eventUsers('connection.rejected', id)).toEqual([seller.admin.userId]);
    expect((await incoming(buyer)).body).toEqual({ items: [], nextCursor: null });

    const again = await send(seller, buyer);
    expect(again.status).toBe(409);
    expect(code(again.body)).toBe('CONNECTION_COOLDOWN_ACTIVE');
  });

  it('US-023-AC4 engel: bekleyen istek rejected, engel kaydı; satıcı yeni istek gönderemez', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller, buyer);

    const res = await block(buyer, seller.businessId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({
      sellerId: seller.businessId,
      sellerName: `Toptan ${seller.businessId.slice(0, 8)}`,
      logoUrl: null,
      createdAt: NOW.toISOString(),
    });
    expect(await requestStatus(id)).toBe('rejected');
    expect(await eventUsers('connection.rejected', id)).toEqual([seller.admin.userId]);
    const [audit] = await platformRows<{ action: string; after: Record<string, unknown> }>(
      `select action, after from audit_logs where business_id = $1 and action = 'block.created'`,
      [buyer.businessId],
    );
    expect(audit?.after).toEqual({ rejectedRequestId: id, cancelledConnectionId: null });

    const again = await send(seller, buyer);
    expect(code(again.body)).toBe('CONNECTION_BLOCKED');
    // Tekrar engel aynı satırı döner; ikinci audit yok.
    expect((await block(buyer, seller.businessId)).status).toBe(201);
    const audits = await platformRows(
      `select 1 from audit_logs where business_id = $1 and action = 'block.created'`,
      [buyer.businessId],
    );
    expect(audits).toHaveLength(1);
  });

  it('US-023-AC4 engel aktif bağlantıyı cancelled yapar (ended_by_side buyer, olay connection.cancelled)', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller, buyer);
    const accepted = await act(buyer, id, 'accept');
    const connectionId = (accepted.body as { id: string }).id;

    expect((await block(buyer, seller.businessId)).status).toBe(201);
    const [row] = await platformRows<{
      status: string;
      ended_at: Date;
      ended_by_side: string;
      end_reason: string;
      ended_by_user_id: string;
    }>(
      `select status, ended_at, ended_by_side, end_reason, ended_by_user_id
         from connections where id = $1`,
      [connectionId],
    );
    expect(row).toEqual({
      status: 'cancelled',
      ended_at: NOW,
      ended_by_side: 'buyer',
      end_reason: 'blocked',
      ended_by_user_id: buyer.admin.userId,
    });
    const events = await platformRows<{ payload: Record<string, string> }>(
      `select payload from outbox_events where type = 'connection.cancelled' and aggregate_id = $1`,
      [connectionId],
    );
    expect(events.map((event) => event.payload)).toEqual([
      {
        connectionId,
        sellerId: seller.businessId,
        buyerId: buyer.businessId,
        endedBySide: 'buyer',
      },
    ]);
  });

  it('US-023-AC4 ilişkisi olmayan satıcı engellenemez (404); satıcı engel ucunu kullanamaz (403)', async () => {
    const seller = await newSeller(region);
    const stranger = await newSeller(region);
    const buyer = await newBuyer(region);
    await pending(seller, buyer);

    const res = await block(buyer, stranger.businessId);
    expect(res.status).toBe(404);
    expect(code(res.body)).toBe('NOT_FOUND');
    const bySeller = await http()
      .post('/api/v1/blocks')
      .set(await auth(seller.admin.userId, seller.businessId))
      .send({ sellerId: stranger.businessId });
    expect(bySeller.status).toBe(403);
  });

  it('US-023-AC5 engel kaldırılınca listeden çıkar ve satıcı yeniden istek gönderebilir', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'withdrawn',
      createdAt: new Date(NOW.getTime() - 2 * DAY),
      sellerLocalDate: '2026-11-08',
    });
    expect((await block(buyer, seller.businessId)).status).toBe(201);
    const list = await http()
      .get('/api/v1/blocks')
      .set(await auth(buyer.admin.userId, buyer.businessId));
    expect((list.body as { items: { sellerId: string }[] }).items.map((i) => i.sellerId)).toEqual([
      seller.businessId,
    ]);
    expect(code((await send(seller, buyer)).body)).toBe('CONNECTION_BLOCKED');

    const removed = await http()
      .delete(`/api/v1/blocks/${seller.businessId}`)
      .set(await auth(buyer.admin.userId, buyer.businessId));
    expect(removed.status).toBe(204);
    const empty = await http()
      .get('/api/v1/blocks')
      .set(await auth(buyer.admin.userId, buyer.businessId));
    expect(empty.body).toEqual({ items: [] });
    // Yeniden silmek de 204 (idempotent).
    const twice = await http()
      .delete(`/api/v1/blocks/${seller.businessId}`)
      .set(await auth(buyer.admin.userId, buyer.businessId));
    expect(twice.status).toBe(204);
    expect((await send(seller, buyer)).status).toBe(201);
  });

  it('US-023-AC5 engelden kalan red bekleme süresine tabidir', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    await pending(seller, buyer);
    await block(buyer, seller.businessId);
    await http()
      .delete(`/api/v1/blocks/${seller.businessId}`)
      .set(await auth(buyer.admin.userId, buyer.businessId));
    expect(code((await send(seller, buyer)).body)).toBe('CONNECTION_COOLDOWN_ACTIVE');
  });

  it('US-023-AC6 satın alma sorumlusu gelen istekleri görür; kabul/red/engel 403', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const purchaser = await addMember(buyer.businessId, 'buyer_purchaser');
    const id = await pending(seller, buyer);

    const list = await incoming(buyer, purchaser);
    expect(list.status).toBe(200);
    expect((list.body as { items: { id: string }[] }).items.map((item) => item.id)).toEqual([id]);
    expect((await act(buyer, id, 'accept', undefined, purchaser)).status).toBe(403);
    expect((await act(buyer, id, 'reject', {}, purchaser)).status).toBe(403);
    expect((await block(buyer, seller.businessId, purchaser)).status).toBe(403);
    const blocks = await http()
      .get('/api/v1/blocks')
      .set(await auth(purchaser.userId, buyer.businessId));
    expect(blocks.status).toBe(403);
    expect(await requestStatus(id)).toBe('pending');
  });

  it('US-023 başka perakendecinin isteği 404; satıcı kabul edemez (403)', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const other = await newBuyer(region);
    const id = await pending(seller, buyer);

    const res = await act(other, id, 'accept');
    expect(res.status).toBe(404);
    expect((await act(other, id, 'reject', {})).status).toBe(404);
    const bySeller = await http()
      .post(`/api/v1/connection-requests/${id}/accept`)
      .set(await auth(seller.admin.userId, seller.businessId))
      .send({ confirmDataSharing: true });
    expect(bySeller.status).toBe(403);
    expect(await requestStatus(id)).toBe('pending');
  });

  it('US-022-AC1 geri çekme: withdrawn, gelen listeden kalkar, olay yok; tekrar 409', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller, buyer);

    const res = await withdraw(seller, id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id, status: 'withdrawn' });
    expect((await incoming(buyer)).body).toEqual({ items: [], nextCursor: null });
    const events = await platformRows(
      `select 1 from outbox_events where aggregate_id = $1 and type <> 'connection.request_created'`,
      [id],
    );
    expect(events).toHaveLength(0);
    const again = await withdraw(seller, id);
    expect(again.status).toBe(409);
    expect(code(again.body)).toBe('INVALID_STATE_TRANSITION');
    // Yanıtlanmış istek geri çekilemez; geri çekilen kabul edilemez.
    expect(code((await act(buyer, id, 'accept')).body)).toBe('INVALID_STATE_TRANSITION');
  });

  it('US-022-AC1 temsilci yalnız kendi isteğini geri çeker; başka satıcı ve alıcı çekemez', async () => {
    const seller = await newSeller(region);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    const otherSeller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller, buyer);

    expect((await withdraw(seller, id, rep)).status).toBe(404);
    expect((await withdraw(otherSeller, id)).status).toBe(404);
    const byBuyer = await http()
      .post(`/api/v1/connection-requests/${id}/withdraw`)
      .set(await auth(buyer.admin.userId, buyer.businessId))
      .send({});
    expect(byBuyer.status).toBe(403);
    expect(await requestStatus(id)).toBe('pending');

    const repRequest = await http()
      .post('/api/v1/connection-requests')
      .set(await auth(rep.userId, seller.businessId))
      .send({ buyerId: (await newBuyer(region)).businessId });
    const repId = (repRequest.body as { id: string }).id;
    expect((await withdraw(seller, repId, rep)).status).toBe(200);
  });

  it('US-022-AC2 geri çekmeden sonra bekleme yok, ama yeni istek kotadan yeniden düşer', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const id = await pending(seller, buyer);
    await withdraw(seller, id);

    expect((await send(seller, buyer)).status).toBe(201);
    const today = await platformRows(
      `select 1 from connection_requests where seller_id = $1 and seller_local_date = $2`,
      [seller.businessId, TODAY_BAKU],
    );
    expect(today).toHaveLength(2);
  });

  it('US-023-AC2 aynı çift için iptal edilmiş eski bağlantı varken kabul yeni satır açar (K6)', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const old = await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'accepted',
      createdAt: new Date(NOW.getTime() - 60 * DAY),
      respondedAt: new Date(NOW.getTime() - 59 * DAY),
      sellerLocalDate: '2026-09-11',
    });
    const oldConnection = await insertConnection({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      requestId: old,
      startedAt: new Date(NOW.getTime() - 59 * DAY),
      cancelled: { at: new Date(NOW.getTime() - 40 * DAY), by: 'seller' },
    });
    const id = await pending(seller, buyer);
    const res = await act(buyer, id, 'accept');
    expect(res.status).toBe(200);
    expect((res.body as { id: string }).id).not.toBe(oldConnection);
    const rows = await platformRows<{ status: string }>(
      'select status from connections where seller_id = $1 and buyer_id = $2 order by started_at',
      [seller.businessId, buyer.businessId],
    );
    expect(rows.map((row) => row.status)).toEqual(['cancelled', 'active']);
  });
});
