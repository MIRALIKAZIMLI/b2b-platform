// F2.18 platform admininin perakendeci yönetimi (US-015 AC1–AC2, US-016 AC1–AC3; kullanıcı
// kararları D1 = A, D2 = A). Gerçek PostgreSQL; uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator, connectAsSuperuser } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { Clock, FixedClock } from '../../../core/clock';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  activeConnection,
  addMember,
  type Buyer,
  businessRows,
  insertBlock,
  insertRequest,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
} from './buyer-fixtures';
import { AdminHttp, platformUser, randomVoen } from './fixtures';

const NOW = new Date('2026-11-13T08:00:00Z');
const TODAY = '2026-11-13';

interface BuyerJson {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string | null;
  readonly legalType: string | null;
  readonly status: string;
  readonly verifiedAt: string | null;
}

describe('F2.18 admin perakendeci yönetimi (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: AdminHttp;
  let operations: string;
  let support: string;
  let region: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: Clock, useValue: new FixedClock(NOW) },
        { provide: REDIS_CLIENT, useValue: redis.client },
      ],
    });
    api = new AdminHttp(app);
    operations = await platformUser('operations');
    support = await platformUser('support');
    region = await newRegion('Moderasiya');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const code = (body: unknown) => (body as { code: string }).code;

  async function get(path: string, userId = operations) {
    return await api
      .http()
      .get(path)
      .set(await api.bearer(userId));
  }

  async function post(path: string, body: unknown, userId = operations) {
    return await api
      .http()
      .post(path)
      .set(await api.bearer(userId))
      .send(body as object);
  }

  async function buyerWithVoen(): Promise<Buyer & { voen: string }> {
    const buyer = await newBuyer(region);
    const voen = randomVoen(2);
    await platformRows('update businesses set voen = $2 where id = $1', [buyer.businessId, voen]);
    return { ...buyer, voen };
  }

  async function memberAuth(userId: string, businessId: string) {
    return { ...(await api.bearer(userId)), 'X-Business-Id': businessId };
  }

  async function events(type: string, aggregateId: string) {
    return await platformRows<{ payload: Record<string, string> }>(
      `select payload from outbox_events where type = $1 and aggregate_id = $2
        order by payload->>'userId'`,
      [type, aggregateId],
    );
  }

  async function audit(action: string, targetId: string) {
    return await platformRows<{ actor_type: string; after: Record<string, unknown> }>(
      `select actor_type, after from audit_logs where action = $1 and target_id = $2`,
      [action, targetId],
    );
  }

  async function businessRow(id: string) {
    const [row] = await platformRows<{
      status: string;
      voen: string | null;
      legal_type: string | null;
      verified_at: Date | null;
      verified_by: string | null;
    }>('select status, voen, legal_type, verified_at, verified_by from businesses where id = $1', [
      id,
    ]);
    return row;
  }

  describe('US-015 moderasyon', () => {
    it('US-015 AC1 kuyrukta VÖEN girilmiş, doğrulanmamış perakendeci; kayıt ünvan, VÖEN, hukuki tip döner', async () => {
      const pending = await buyerWithVoen();
      const noVoen = await newBuyer(region);
      const list = await get('/api/v1/admin/buyers?filter=voen_pending&limit=100');
      expect(list.status).toBe(200);
      const ids = (list.body as { items: BuyerJson[] }).items.map((item) => item.id);
      expect(ids).toContain(pending.businessId);
      expect(ids).not.toContain(noVoen.businessId);

      const detail = await get(`/api/v1/admin/buyers/${pending.businessId}`);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        id: pending.businessId,
        legalName: expect.any(String) as string,
        voen: pending.voen,
        legalType: 'individual_entrepreneur',
        status: 'active',
        verifiedAt: null,
      });
    });

    it('US-015 AC1 toptancı ve olmayan kayıt 404; destek okur ama yazamaz; platform rolü yoksa 403', async () => {
      const seller = await newSeller(region);
      expect((await get(`/api/v1/admin/buyers/${seller.businessId}`)).status).toBe(404);
      expect((await get(`/api/v1/admin/buyers/${randomUUID()}`)).status).toBe(404);

      const buyer = await buyerWithVoen();
      expect((await get(`/api/v1/admin/buyers/${buyer.businessId}`, support)).status).toBe(200);
      const denied = await post(
        `/api/v1/admin/buyers/${buyer.businessId}/verify`,
        { decision: 'verify' },
        support,
      );
      expect(denied.status).toBe(403);
      const nobody = await platformUser(null);
      expect((await get('/api/v1/admin/buyers', nobody)).status).toBe(403);
      // İşletme üyesi de platform ucuna giremez.
      const asMember = await api
        .http()
        .get('/api/v1/admin/buyers')
        .set(await memberAuth(buyer.admin.userId, buyer.businessId));
      expect(asMember.status).toBe(403);
    });

    it('US-015 AC2 doğrula: verified_at ve verified_by yazılır, audit ve dizin olayı; ikinci kez 409', async () => {
      const buyer = await buyerWithVoen();
      const res = await post(`/api/v1/admin/buyers/${buyer.businessId}/verify`, {
        decision: 'verify',
      });
      expect(res.status).toBe(200);
      expect((res.body as BuyerJson).verifiedAt).toBe(NOW.toISOString());
      const row = await businessRow(buyer.businessId);
      expect(row?.verified_by).toBe(operations);
      expect(await audit('business.voen_verified', buyer.businessId)).toEqual([
        { actor_type: 'platform', after: { voen: buyer.voen, verified: true } },
      ]);
      expect(await events('buyer.profile_changed', buyer.businessId)).toHaveLength(1);

      const again = await post(`/api/v1/admin/buyers/${buyer.businessId}/verify`, {
        decision: 'verify',
      });
      expect(again.status).toBe(409);
      expect(code(again.body)).toBe('INVALID_STATE_TRANSITION');
    });

    it('US-015 AC2 reddet: VÖEN ve hukuki tip temizlenir, her aktif admine gerekçe kodlu bildirim olayı', async () => {
      const buyer = await buyerWithVoen();
      const second = await addMember(buyer.businessId, 'buyer_business_admin');
      const res = await post(`/api/v1/admin/buyers/${buyer.businessId}/verify`, {
        decision: 'reject',
        reason: 'name_mismatch',
        note: 'Vergi sistemindəki ad fərqlidir',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ voen: null, legalType: null, verifiedAt: null });
      expect(await businessRow(buyer.businessId)).toMatchObject({ voen: null, legal_type: null });

      const notified = await events('buyer.voen_rejected', buyer.businessId);
      expect(notified.map((event) => event.payload.userId).sort()).toEqual(
        [buyer.admin.userId, second.userId].sort(),
      );
      for (const event of notified) {
        expect(event.payload).toEqual({
          businessId: buyer.businessId,
          userId: event.payload.userId,
          reason: 'name_mismatch',
        });
      }
      // Admin notu yalnız audit'te (Mimar notu 5: kişisel veri yok).
      expect(await audit('business.voen_rejected', buyer.businessId)).toEqual([
        {
          actor_type: 'platform',
          after: { voen: null, reason: 'name_mismatch', note: 'Vergi sistemindəki ad fərqlidir' },
        },
      ]);
      // VÖEN yoksa yeniden karar verilemez.
      const again = await post(`/api/v1/admin/buyers/${buyer.businessId}/verify`, {
        decision: 'verify',
      });
      expect(code(again.body)).toBe('VOEN_REQUIRED');
    });

    it('US-015 AC2 gerekçe kodu listede olmalı, not 3–500 karakter', async () => {
      const buyer = await buyerWithVoen();
      const path = `/api/v1/admin/buyers/${buyer.businessId}/verify`;
      for (const body of [
        { decision: 'reject' },
        { decision: 'reject', reason: '<script>serbest</script>' },
        { decision: 'reject', reason: 'other', note: 'ab' },
        { decision: 'reject', reason: 'other', note: 'x'.repeat(501) },
        { decision: 'approve' },
      ]) {
        const res = await post(path, body);
        expect(res.status, JSON.stringify(body)).toBe(422);
      }
      expect((await businessRow(buyer.businessId))?.voen).toBe(buyer.voen);
    });
  });

  describe('US-016 askıya alma', () => {
    it('US-016 AC1 askıdaki perakendecinin uçları 403, dizin olayı yazılır, bağlantı ve istekler değişmez', async () => {
      const seller = await newSeller(region);
      const other = await newSeller(region);
      const buyer = await newBuyer(region);
      const connectionId = await activeConnection(seller, buyer, NOW);
      const requestId = await insertRequest({
        sellerId: other.businessId,
        buyerId: buyer.businessId,
        sentByUserId: other.admin.userId,
        status: 'pending',
        createdAt: NOW,
        sellerLocalDate: TODAY,
      });
      const path = `/api/v1/admin/businesses/${buyer.businessId}/status`;
      const res = await post(path, { action: 'suspend', reason: 'Şikayət araşdırılır' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: buyer.businessId, outcome: 'updated', status: 'suspended' });

      const blocked = await api
        .http()
        .get('/api/v1/business')
        .set(await memberAuth(buyer.admin.userId, buyer.businessId));
      expect(blocked.status).toBe(403);
      expect(code(blocked.body)).toBe('BUSINESS_SUSPENDED');
      expect(await events('buyer.profile_changed', buyer.businessId)).toHaveLength(1);
      const [connection] = await platformRows<{ status: string }>(
        'select status from connections where id = $1',
        [connectionId],
      );
      expect(connection?.status).toBe('active');
      const [request] = await platformRows<{ status: string }>(
        'select status from connection_requests where id = $1',
        [requestId],
      );
      expect(request?.status).toBe('pending');
      expect(await audit('business.suspended', buyer.businessId)).toEqual([
        {
          actor_type: 'platform',
          after: { status: 'suspended', reason: 'Şikayət araşdırılır' },
        },
      ]);
      const list = await get('/api/v1/admin/buyers?filter=suspended&limit=100');
      expect((list.body as { items: BuyerJson[] }).items.map((item) => item.id)).toContain(
        buyer.businessId,
      );

      expect((await post(path, { action: 'suspend', reason: 'yenə' })).status).toBe(409);
      const lifted = await post(path, { action: 'unsuspend', reason: 'Araşdırma bitdi' });
      expect(lifted.body).toMatchObject({ status: 'active' });
      const back = await api
        .http()
        .get('/api/v1/business')
        .set(await memberAuth(buyer.admin.userId, buyer.businessId));
      expect(back.status).toBe(200);
    });

    it('V2 (Mimar notu 4) askıya alınan toptancının bağlantıları ve istekleri değişmez; toptancı silinemez', async () => {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      const other = await newBuyer(region);
      const connectionId = await activeConnection(seller, buyer, NOW);
      const requestId = await insertRequest({
        sellerId: seller.businessId,
        buyerId: other.businessId,
        sentByUserId: seller.admin.userId,
        status: 'pending',
        createdAt: NOW,
        sellerLocalDate: TODAY,
      });
      const path = `/api/v1/admin/businesses/${seller.businessId}/status`;
      expect((await post(path, { action: 'suspend', reason: 'Ödəniş gecikir' })).status).toBe(200);
      const [connection] = await platformRows<{ status: string }>(
        'select status from connections where id = $1',
        [connectionId],
      );
      const [request] = await platformRows<{ status: string }>(
        'select status from connection_requests where id = $1',
        [requestId],
      );
      expect([connection?.status, request?.status]).toEqual(['active', 'pending']);
      const archive = await post(path, { action: 'archive', reason: 'Sil' });
      expect(archive.status).toBe(422);
    });

    it('US-016 gerekçe zorunlu (3–500); bilinmeyen işletme 404', async () => {
      const buyer = await newBuyer(region);
      const path = `/api/v1/admin/businesses/${buyer.businessId}/status`;
      expect((await post(path, { action: 'suspend' })).status).toBe(422);
      expect((await post(path, { action: 'suspend', reason: 'ab' })).status).toBe(422);
      expect((await post(path, { action: 'freeze', reason: 'abc' })).status).toBe(422);
      const missing = await post(`/api/v1/admin/businesses/${randomUUID()}/status`, {
        action: 'suspend',
        reason: 'abc',
      });
      expect(missing.status).toBe(404);
    });
  });

  describe('US-016 sil (arşiv / kalıcı silme)', () => {
    it('US-016 AC2 geçmişli perakendeci arşivlenir: person_data silinir, bağlantı platformca kapanır, istek kaydı korunur', async () => {
      const seller = await newSeller(region);
      const sellerAdmin2 = await addMember(seller.businessId, 'seller_business_admin');
      const other = await newSeller(region);
      const buyer = await newBuyer(region);
      await platformRows(
        `insert into person_data (id, business_id, contact_name, personal_phone, email)
         values ($1, $2, 'Leyla Əliyeva', '+994501234567', 'leyla@example.az')`,
        [randomUUID(), buyer.businessId],
      );
      const connectionId = await activeConnection(seller, buyer, NOW);
      const requestId = await insertRequest({
        sellerId: other.businessId,
        buyerId: buyer.businessId,
        sentByUserId: other.admin.userId,
        status: 'pending',
        createdAt: NOW,
        sellerLocalDate: TODAY,
      });

      const res = await post(`/api/v1/admin/businesses/${buyer.businessId}/status`, {
        action: 'archive',
        reason: 'Mükərrər hesab',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: buyer.businessId, outcome: 'archived', status: 'archived' });

      expect((await businessRow(buyer.businessId))?.status).toBe('archived');
      expect(
        await platformRows('select 1 from person_data where business_id = $1', [buyer.businessId]),
      ).toEqual([]);
      const [connection] = await platformRows<Record<string, unknown>>(
        `select status, ended_by_side, end_reason, ended_by_user_id, ended_at
           from connections where id = $1`,
        [connectionId],
      );
      expect(connection).toEqual({
        status: 'cancelled',
        ended_by_side: 'platform',
        end_reason: 'business_archived',
        ended_by_user_id: operations,
        ended_at: NOW,
      });
      const [request] = await platformRows<{ status: string }>(
        'select status from connection_requests where id = $1',
        [requestId],
      );
      expect(request?.status).toBe('pending');

      expect(await events('connection.cancelled', connectionId)).toEqual([
        {
          payload: {
            connectionId,
            sellerId: seller.businessId,
            buyerId: buyer.businessId,
            endedBySide: 'platform',
          },
        },
      ]);
      const notices = await events('connection.cancel_notice', connectionId);
      expect(notices.map((n) => n.payload.userId).sort()).toEqual(
        [seller.admin.userId, sellerAdmin2.userId].sort(),
      );
      const [archived] = await audit('business.archived', buyer.businessId);
      expect(archived?.after).toEqual({
        status: 'archived',
        reason: 'Mükərrər hesab',
        personDataDeleted: true,
        invitationsClosed: 0,
        connectionsClosed: 1,
      });
      expect(JSON.stringify(archived)).not.toContain('994501234567');

      // Arşivli kayıt listede ve ayrıntıda yok; ikinci "sil" 404.
      expect((await get(`/api/v1/admin/buyers/${buyer.businessId}`)).status).toBe(404);
      const again = await post(`/api/v1/admin/businesses/${buyer.businessId}/status`, {
        action: 'archive',
        reason: 'yenə',
      });
      expect(again.status).toBe(404);
    });

    it('Mimar notu 2: arşivli perakendeci bekleyen isteği kabul edemez; toptancı ona yeni istek gönderemez', async () => {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      const requestId = await insertRequest({
        sellerId: seller.businessId,
        buyerId: buyer.businessId,
        sentByUserId: seller.admin.userId,
        status: 'pending',
        createdAt: NOW,
        sellerLocalDate: TODAY,
      });
      const res = await post(`/api/v1/admin/businesses/${buyer.businessId}/status`, {
        action: 'archive',
        reason: 'Saxta hesab',
      });
      expect(res.body).toMatchObject({ outcome: 'archived' });

      const accept = await api
        .http()
        .post(`/api/v1/connection-requests/${requestId}/accept`)
        .set(await memberAuth(buyer.admin.userId, buyer.businessId))
        .send({ confirmDataSharing: true });
      expect(accept.status).toBe(403);
      expect(code(accept.body)).toBe('BUSINESS_SUSPENDED');

      const other = await newSeller(region);
      const send = await api
        .http()
        .post('/api/v1/connection-requests')
        .set(await memberAuth(other.admin.userId, other.businessId))
        .send({ buyerId: buyer.businessId });
      expect(send.status).toBe(404);
    });

    it('US-016 AC3 geçmişsiz perakendeci kalıcı silinir; audit kalır, bildirim ve son işletme izi temizlenir', async () => {
      const buyer = await newBuyer(region);
      const id = buyer.businessId;
      await platformRows(
        `insert into person_data (id, business_id, contact_name) values ($1, $2, 'Rauf')`,
        [randomUUID(), id],
      );
      await platformRows('update users set last_business_id = $2 where id = $1', [
        buyer.admin.userId,
        id,
      ]);
      const superuser = await connectAsSuperuser();
      try {
        await superuser.query(
          `insert into notifications (id, user_id, business_id, type, payload)
           values ($1, $2, $3, 'test', '{"id": "x", "params": {}}'::jsonb)`,
          [randomUUID(), buyer.admin.userId, id],
        );
      } finally {
        await superuser.end();
      }

      const res = await post(`/api/v1/admin/businesses/${id}/status`, {
        action: 'archive',
        reason: 'Test hesabı',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id, outcome: 'deleted', status: null });

      for (const table of [
        'businesses where id',
        'business_capabilities where business_id',
        'buyer_profiles where business_id',
        'business_privacy where business_id',
        'person_data where business_id',
        'memberships where business_id',
        'roles where business_id',
      ]) {
        expect(await platformRows(`select 1 from ${table} = $1`, [id]), table).toEqual([]);
      }
      const [user] = await platformRows<{ last_business_id: string | null }>(
        'select last_business_id from users where id = $1',
        [buyer.admin.userId],
      );
      expect(user?.last_business_id).toBeNull();
      const check = await connectAsSuperuser();
      try {
        const left = await check.query('select 1 from notifications where business_id = $1', [id]);
        expect(left.rowCount).toBe(0);
      } finally {
        await check.end();
      }
      const [purged] = await audit('business.purged', id);
      expect(purged?.after).toEqual({ status: null, reason: 'Test hesabı', files: 0 });
      expect(await events('buyer.profile_changed', id)).toHaveLength(1);
    });

    it('US-016 AC3 D1 = A: yalnız engel kaydı olan perakendeci de geçmişlidir (arşivlenir)', async () => {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      await insertBlock(buyer.businessId, seller.businessId, buyer.admin.userId);
      const res = await post(`/api/v1/admin/businesses/${buyer.businessId}/status`, {
        action: 'archive',
        reason: 'Sil',
      });
      expect(res.body).toMatchObject({ outcome: 'archived' });
    });

    it('Mimar notu 1: silme sırasında commit edilen yeni istek kalıcı silmeyi arşive çevirir', async () => {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      const racer = await connectAsMigrator();
      try {
        await racer.query('begin');
        await racer.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
        await racer.query(
          `insert into connection_requests
             (id, seller_id, buyer_id, sent_by_user_id, status, expires_at, seller_local_date)
           values ($1, $2, $3, $4, 'pending', $5::timestamptz + interval '14 days', $6)`,
          [randomUUID(), seller.businessId, buyer.businessId, seller.admin.userId, NOW, TODAY],
        );
        const pending = post(`/api/v1/admin/businesses/${buyer.businessId}/status`, {
          action: 'archive',
          reason: 'Yarış',
        }).then((res) => res);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await racer.query('commit');
        const res = await pending;
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ outcome: 'archived' });
      } finally {
        await racer.end();
      }
      expect((await businessRow(buyer.businessId))?.status).toBe('archived');
    });
  });

  describe('veritabanı savunması', () => {
    it('business_purge ve business_close_archived_connections yalnız platform bağlamında (42501)', async () => {
      const buyer = await newBuyer(region);
      await expect(
        businessRows(buyer.businessId, 'select * from business_purge($1)', [buyer.businessId]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        businessRows(
          buyer.businessId,
          'select * from business_close_archived_connections($1, now())',
          [buyer.businessId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      // Platform bağlamı olsa da app.user_id yoksa reddedilir.
      await expect(
        platformRows('select * from business_purge($1)', [buyer.businessId]),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('connections_guard: taraf bağlantıyı `platform` adına kapatamaz; aktif alıcının bağlantısı platformca kapanmaz', async () => {
      const seller = await newSeller(region);
      const buyer = await newBuyer(region);
      const connectionId = await activeConnection(seller, buyer, NOW);
      await expect(
        businessRows(
          buyer.businessId,
          `update connections set status = 'cancelled', ended_at = now(), ended_by_side = 'platform',
                  end_reason = 'business_archived', ended_by_user_id = $2 where id = $1`,
          [connectionId, buyer.admin.userId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      const client = await connectAsMigrator();
      try {
        await client.query('begin');
        await client.query("select set_config('app.is_platform', 'true', true)");
        await client.query("select set_config('app.user_id', $1, true)", [operations]);
        await expect(
          client.query('select * from business_close_archived_connections($1, now())', [
            buyer.businessId,
          ]),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
        await client.end();
      }
    });
  });
});
