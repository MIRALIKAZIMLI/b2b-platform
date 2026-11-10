// F2.14a bağlantı listesi ve koşullar (US-024 AC1–AC3, SF-03 son adım). Gerçek PostgreSQL;
// uygulama bağlantısı RLS'e tabi app_user. Saat sabit: 2026-11-10 08:00Z. Bekçi tetikleyicisi
// (alıcı/bağlamsız koşul yazamaz) connection-terms.isolation dosyasında.
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
  activeConnection,
  addMember,
  type Buyer,
  cancelConnection,
  type Member,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
  type Seller,
  setTerms,
} from './fixtures';

const NOW = new Date('2026-11-10T08:00:00Z');
const EARLIER = new Date('2026-10-01T08:00:00Z');

interface ConnectionBody {
  id: string;
  counterpartyName: string | null;
  status: string;
  termsAssigned: boolean;
  terms: Record<string, unknown>;
  suggestedTerms?: Record<string, unknown> | null;
}

describe('F2.14a bağlantı koşulları API', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let region: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        { provide: Clock, useValue: new FixedClock(NOW) },
      ],
    });
    region = await newRegion('Şərtlər');
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

  async function list(member: Member, businessId: string, query = '') {
    const res = await http()
      .get(`/api/v1/connections${query}`)
      .set(await auth(member, businessId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as { items: ConnectionBody[]; nextCursor: string | null };
  }

  async function patch(member: Member, businessId: string, id: string, body: unknown) {
    return await http()
      .patch(`/api/v1/connections/${id}/terms`)
      .set(await auth(member, businessId))
      .send(body as object);
  }

  async function pair(proposed?: number): Promise<{ seller: Seller; buyer: Buyer; id: string }> {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    return { seller, buyer, id: await activeConnection(seller, buyer, NOW, proposed) };
  }

  it('US-024-AC1 yeni bağlantı koşulsuz listelenir: fiyat listesi null (varsayılan), vade 0, termsAssigned false', async () => {
    const { seller, buyer, id } = await pair(30);
    const sellerView = await list(seller.admin, seller.businessId);
    expect(sellerView.items).toEqual([
      expect.objectContaining({
        id,
        counterpartyName: `Market ${buyer.businessId.slice(0, 8)}`,
        status: 'active',
        termsAssigned: false,
        terms: {
          priceListId: null,
          branchPricingEnabled: false,
          creditLimit: null,
          paymentTermDays: 0,
          salesRepMembershipId: null,
        },
        // F2.14a K4: önerilen vade yalnız öneri (kullanıcı kararı B, bağlantıya yazılmaz).
        suggestedTerms: {
          source: 'request',
          creditLimit: null,
          paymentTermDays: 30,
          salesRepMembershipId: null,
        },
      }),
    ]);
    // Alıcı bakışı: karşı taraf satıcı; koşullardan yalnız limit ve vade, öneri yok (K5).
    const buyerView = await list(buyer.admin, buyer.businessId);
    expect(buyerView.items).toHaveLength(1);
    const item = buyerView.items[0];
    expect(item?.counterpartyName).toBe(`Toptan ${seller.businessId.slice(0, 8)}`);
    expect(item?.terms).toEqual({ creditLimit: null, paymentTermDays: 0 });
    expect(item).not.toHaveProperty('suggestedTerms');
  });

  it('US-024-AC2 satış müdürü limit, vade ve temsilci kaydeder; liste günceller, audit önce/sonra', async () => {
    const { seller, id } = await pair();
    const manager = await addMember(seller.businessId, 'seller_sales_manager');
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    const res = await patch(manager, seller.businessId, id, {
      creditLimit: '1500.5',
      paymentTermDays: 14,
      salesRepMembershipId: rep.membershipId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as ConnectionBody).termsAssigned).toBe(true);
    expect((res.body as ConnectionBody).terms).toEqual({
      priceListId: null,
      branchPricingEnabled: false,
      creditLimit: '1500.50',
      paymentTermDays: 14,
      salesRepMembershipId: rep.membershipId,
    });
    expect((res.body as ConnectionBody).suggestedTerms).toBeNull();

    // Kısmi güncelleme: yalnız vade değişir; limit null ile kaldırılır.
    const partial = await patch(manager, seller.businessId, id, { paymentTermDays: 30 });
    expect((partial.body as ConnectionBody).terms).toMatchObject({
      creditLimit: '1500.50',
      paymentTermDays: 30,
    });
    const cleared = await patch(manager, seller.businessId, id, { creditLimit: null });
    expect((cleared.body as ConnectionBody).terms).toMatchObject({ creditLimit: null });

    const [listed] = (await list(seller.admin, seller.businessId)).items;
    expect(listed).toMatchObject({ termsAssigned: true, suggestedTerms: null });
    expect(listed?.terms).toMatchObject({
      paymentTermDays: 30,
      salesRepMembershipId: rep.membershipId,
    });

    const audits = await platformRows<{ before: unknown; after: unknown; actor_user_id: string }>(
      `select before, after, actor_user_id from audit_logs
        where business_id = $1 and action = 'connection.terms_updated' and target_id = $2
        order by id`,
      [seller.businessId, id],
    );
    expect(audits[0]).toEqual({
      before: { creditLimit: null, paymentTermDays: 0, salesRepMembershipId: null },
      after: {
        creditLimit: '1500.50',
        paymentTermDays: 14,
        salesRepMembershipId: rep.membershipId,
      },
      actor_user_id: manager.userId,
    });
    expect(audits).toHaveLength(3);
    const [row] = await platformRows<{ terms_set_at: Date; terms_set_by_user_id: string }>(
      'select terms_set_at, terms_set_by_user_id from connections where id = $1',
      [id],
    );
    expect(row).toEqual({ terms_set_at: NOW, terms_set_by_user_id: manager.userId });
  });

  it('US-024-AC3 iptal edilip yeniden kurulan bağlantıda önceki dönemin koşulları öneri olur', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    const old = await activeConnection(seller, buyer, EARLIER, 10);
    await setTerms(seller, old, {
      creditLimit: '900.00',
      paymentTermDays: 45,
      salesRepMembershipId: rep.membershipId,
    });
    await cancelConnection(buyer.businessId, old, new Date('2026-10-20T08:00:00Z'));
    const current = await activeConnection(seller, buyer, NOW, 7);

    const items = (await list(seller.admin, seller.businessId, '?status=active')).items;
    expect(items.map((item) => item.id)).toEqual([current]);
    expect(items[0]?.suggestedTerms).toEqual({
      source: 'previous_connection',
      creditLimit: '900.00',
      paymentTermDays: 45,
      salesRepMembershipId: rep.membershipId,
    });
    // Önceki temsilci artık üye değilse öneride temsilci yok.
    await platformRows(`update memberships set status = 'removed' where id = $1`, [
      rep.membershipId,
    ]);
    const again = (await list(seller.admin, seller.businessId, '?status=active')).items;
    expect(again[0]?.suggestedTerms).toMatchObject({ salesRepMembershipId: null });
    // İptal edilmiş eski bağlantı durum süzgeciyle listelenir, önerisi yok.
    const cancelled = (await list(seller.admin, seller.businessId, '?status=cancelled')).items;
    expect(cancelled.map((item) => item.id)).toEqual([old]);
    expect(cancelled[0]).toMatchObject({
      status: 'cancelled',
      termsAssigned: true,
      suggestedTerms: null,
    });
  });

  it('F2.14a-T2 alıcı koşul değiştiremez (403 CAPABILITY_REQUIRED); satış temsilcisi (assigned) de değiştiremez', async () => {
    const { seller, buyer, id } = await pair();
    const buyerRes = await patch(buyer.admin, buyer.businessId, id, { paymentTermDays: 60 });
    expect(buyerRes.status).toBe(403);
    expect(code(buyerRes.body)).toBe('CAPABILITY_REQUIRED');
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    const repRes = await patch(rep, seller.businessId, id, { paymentTermDays: 60 });
    expect(repRes.status).toBe(403);
    const [row] = await platformRows<{ payment_term_days: number }>(
      'select payment_term_days from connections where id = $1',
      [id],
    );
    expect(row?.payment_term_days).toBe(0);
  });

  it('F2.14a-T3 iptal edilmiş bağlantının koşulu değişmez (409 INVALID_STATE_TRANSITION)', async () => {
    const { seller, buyer, id } = await pair();
    await cancelConnection(buyer.businessId, id, NOW);
    const res = await patch(seller.admin, seller.businessId, id, { paymentTermDays: 10 });
    expect(res.status).toBe(409);
    expect(code(res.body)).toBe('INVALID_STATE_TRANSITION');
  });

  it('F2.14a-T4 başka satıcının bağlantısı 404; başka işletmenin veya ayrılmış üyenin temsilciliği 422', async () => {
    const { seller, id } = await pair();
    const other = await newSeller(region);
    const foreign = await patch(other.admin, other.businessId, id, { paymentTermDays: 10 });
    expect(foreign.status).toBe(404);
    expect(code(foreign.body)).toBe('NOT_FOUND');

    const outsider = await addMember(other.businessId, 'seller_sales_rep', [region]);
    const res = await patch(seller.admin, seller.businessId, id, {
      salesRepMembershipId: outsider.membershipId,
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { salesRepMembershipId: ['invalid_sales_rep'] },
    });
    const removed = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    await platformRows(`update memberships set status = 'removed' where id = $1`, [
      removed.membershipId,
    ]);
    expect(
      (
        await patch(seller.admin, seller.businessId, id, {
          salesRepMembershipId: removed.membershipId,
        })
      ).status,
    ).toBe(422);
    expect(
      (await patch(seller.admin, seller.businessId, id, { salesRepMembershipId: randomUUID() }))
        .status,
    ).toBe(422);
  });

  it('F2.14a-T5 satış temsilcisi (assigned) yalnız kendisine atanmış bağlantıları görür', async () => {
    const seller = await newSeller(region);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    const mine = await activeConnection(seller, await newBuyer(region), NOW);
    await activeConnection(seller, await newBuyer(region), NOW);
    await setTerms(seller, mine, {
      creditLimit: null,
      paymentTermDays: 0,
      salesRepMembershipId: rep.membershipId,
    });
    expect((await list(rep, seller.businessId)).items.map((item) => item.id)).toEqual([mine]);
    expect((await list(seller.admin, seller.businessId)).items).toHaveLength(2);
    // Sayfalama: imleç bir sonraki sayfayı verir.
    const first = await list(seller.admin, seller.businessId, '?limit=1');
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(
      seller.admin,
      seller.businessId,
      `?limit=1&cursor=${first.nextCursor ?? ''}`,
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('F2.14a-T6 gövde doğrulaması: kredi limiti biçimi, fiyat listesi/şube fiyatı F3.6, boş gövde 422', async () => {
    const { seller, id } = await pair();
    const bodies: unknown[] = [
      { creditLimit: '-1' },
      { creditLimit: '1.234' },
      { creditLimit: '1234567890123' },
      { creditLimit: 100 },
      { paymentTermDays: 181 },
      { paymentTermDays: 1.5 },
      { priceListId: randomUUID() },
      { branchPricingEnabled: true },
      { status: 'cancelled' },
      {},
    ];
    for (const body of bodies) {
      const res = await patch(seller.admin, seller.businessId, id, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(code(res.body)).toBe('VALIDATION_FAILED');
    }
    // Sınır değerleri kabul edilir; F3.6'ya kadar null/false açıkça gönderilebilir.
    const ok = await patch(seller.admin, seller.businessId, id, {
      creditLimit: '999999999999.99',
      paymentTermDays: 180,
      priceListId: null,
      branchPricingEnabled: false,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((ok.body as ConnectionBody).terms).toMatchObject({ creditLimit: '999999999999.99' });
  });

  it('F2.14a-T7 PATCH Idempotency-Key önbelleğine girmez (yalnız POST); aynı gövde iki kez aynı sonucu verir', async () => {
    const { seller, id } = await pair();
    const headers = {
      ...(await auth(seller.admin, seller.businessId)),
      'Idempotency-Key': randomUUID(),
    };
    const first = await http()
      .patch(`/api/v1/connections/${id}/terms`)
      .set(headers)
      .send({ paymentTermDays: 5 });
    const second = await http()
      .patch(`/api/v1/connections/${id}/terms`)
      .set(headers)
      .send({ paymentTermDays: 6 });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((second.body as ConnectionBody).terms).toMatchObject({ paymentTermDays: 6 });
    const stored = await platformRows<{ n: number }>(
      `select count(*)::int as n from idempotency_keys where endpoint like 'PATCH%'`,
    );
    expect(stored[0]?.n).toBe(0);
  });

  it('F2.14b-T1 temsilci seçenekleri: satıcının aktif üyeleri, yalnız kimlik ve ad; temsilci ve alıcı 403', async () => {
    const seller = await newSeller(region);
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    const removed = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    await platformRows(`update memberships set status = 'removed' where id = $1`, [
      removed.membershipId,
    ]);
    const other = await newSeller(region);
    const res = await http()
      .get('/api/v1/connections/sales-reps')
      .set(await auth(seller.admin, seller.businessId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const items = (res.body as { items: { membershipId: string; fullName: string }[] }).items;
    expect(items.map((item) => item.membershipId).sort()).toEqual(
      [seller.admin.membershipId, rep.membershipId].sort(),
    );
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(['fullName', 'membershipId']);
    expect(items.map((item) => item.membershipId)).not.toContain(other.admin.membershipId);
    const repRes = await http()
      .get('/api/v1/connections/sales-reps')
      .set(await auth(rep, seller.businessId));
    expect(repRes.status).toBe(403);
    const buyer = await newBuyer(region);
    const buyerRes = await http()
      .get('/api/v1/connections/sales-reps')
      .set(await auth(buyer.admin, buyer.businessId));
    expect(buyerRes.status).toBe(403);
  });
});
