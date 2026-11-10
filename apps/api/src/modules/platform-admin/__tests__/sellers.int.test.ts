// F2.1a entegrasyon: admin toptancı açma, aktivasyon daveti, yeniden gönderim, yetki, doğrulama,
// tek işlem ve SMS hatası (US-009). Bağlantı RLS'e tabi app_user; Redis gerçek (önekli istemci).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, LogCapture } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { Clock, FixedClock } from '../../../core/clock';
import { SmsSender } from '../../../core/ports/sms-sender';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { InvitationService } from '../../access';
import { PlanService } from '../../billing';
import {
  AdminHttp,
  auditRows,
  platformQuery,
  platformUser,
  rowCounts,
  runSeeds,
  sellerBody,
  testRefs,
  userWithPhone,
} from './fixtures';

const DAY_MS = 24 * 60 * 60 * 1000;

interface CreatedJson {
  readonly businessId: string;
  readonly invitationExpiresAt: string;
  readonly activationSmsSent: boolean;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

describe('F2.1a admin toptancı açma (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: AdminHttp;
  let admin: string;
  const logs = new LogCapture();
  const clock = new FixedClock(new Date('2026-11-02T08:00:00.000Z'));

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '', LOG_LEVEL: 'trace' },
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: REDIS_CLIENT, useValue: redis.client },
      ],
      logStream: logs,
    });
    api = new AdminHttp(app);
    admin = await platformUser('operations');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // OTP yeniden gönderim aralığı (60 sn) testleri etkilemesin.
    clock.advance(10 * 60 * 1000);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function create(body: object, userId = admin) {
    return await api
      .http()
      .post('/api/v1/admin/sellers')
      .set(await api.bearer(userId))
      .send(body);
  }

  async function resend(businessId: string, userId = admin) {
    return await api
      .http()
      .post(`/api/v1/admin/sellers/${businessId}/activation`)
      .set(await api.bearer(userId));
  }

  async function accept(accessToken: string, token: string) {
    return await api
      .http()
      .post('/api/v1/team/invitations/accept')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ token });
  }

  it('F2.1a-AC1 admin geçerli verilerle toptancı açar: işletme, yetenek, abonelik, profil, bölgeler, rol, 7 günlük davet, SMS, audit', async () => {
    const body = await sellerBody();
    const response = await create(body);

    expect(response.status).toBe(201);
    const json = response.body as CreatedJson;
    expect(json.activationSmsSent).toBe(true);
    expect(json.invitationExpiresAt).toBe(
      new Date(clock.now().getTime() + 7 * DAY_MS).toISOString(),
    );
    expect(Object.keys(json).sort()).toEqual([
      'activationSmsSent',
      'businessId',
      'invitationExpiresAt',
    ]);

    const [business] = await platformQuery<Record<string, unknown>>(sql`
      select created_via, status, legal_type, voen, default_language, currency_code, timezone
        from businesses where id = ${json.businessId}`);
    expect(business).toEqual({
      created_via: 'admin',
      status: 'active',
      legal_type: 'legal_entity',
      voen: body.voen,
      default_language: 'az',
      currency_code: 'AZN',
      timezone: 'Asia/Baku',
    });
    const capabilities = await platformQuery(sql`
      select capability, status, approved_by from business_capabilities
       where business_id = ${json.businessId}`);
    expect(capabilities).toEqual([
      { capability: 'seller', status: 'approved', approved_by: admin },
    ]);
    const subscriptions = await platformQuery(sql`
      select s.status, p.code, s.current_period_start::text as start, s.current_period_end::text as "end"
        from subscriptions s join plans p on p.id = s.plan_id where s.business_id = ${json.businessId}`);
    expect(subscriptions).toEqual([
      { status: 'active', code: 'pilot', start: '2026-11-02', end: '2026-12-01' },
    ]);
    const profiles = await platformQuery(sql`
      select stock_mode from seller_profiles where business_id = ${json.businessId}`);
    expect(profiles).toEqual([{ stock_mode: 'availability' }]);
    const areas = await platformQuery<{ region_id: string }>(sql`
      select region_id from service_areas where seller_id = ${json.businessId} order by region_id`);
    expect(areas.map((row) => row.region_id)).toEqual([...body.serviceAreaRegionIds].sort());
    const roles = await platformQuery(sql`
      select r.is_business_admin, t.code from roles r join role_templates t on t.id = r.source_template_id
       where r.business_id = ${json.businessId} order by t.code`);
    // F2.7c (Mimar kararı A): admin dışında yeteneğin tüm şablonları da rol olarak açılır.
    expect(roles).toEqual([
      { is_business_admin: false, code: 'seller_accountant' },
      { is_business_admin: true, code: 'seller_business_admin' },
      { is_business_admin: false, code: 'seller_courier' },
      { is_business_admin: false, code: 'seller_sales_manager' },
      { is_business_admin: false, code: 'seller_sales_rep' },
      { is_business_admin: false, code: 'seller_warehouse' },
    ]);
    const invitations = await platformQuery<{
      phone_e164: string;
      token_hash: string;
      accepted_at: null;
    }>(sql`
      select i.phone_e164, i.token_hash, i.accepted_at, j.code as job_title, i.created_by
        from invitations i join job_titles j on j.id = i.job_title_id
       where i.business_id = ${json.businessId}`);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({
      phone_e164: body.ownerPhone,
      accepted_at: null,
      job_title: 'seller_business_admin',
      created_by: admin,
    });
    const users = await platformQuery(sql`
      select full_name from users where phone_e164 = ${body.ownerPhone}`);
    expect(users).toEqual([{ full_name: body.ownerName }]);

    const token = await api.lastActivationToken(body.ownerPhone);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitations[0]?.token_hash).not.toContain(token);
    const outbox = await api.http().get('/api/v1/dev/sms-outbox').query({ phone: body.ownerPhone });
    const smsBody =
      (outbox.body as { items: { body: string }[] }).items.find((item) => item.body.includes(token))
        ?.body ?? '';
    expect(smsBody).toContain(`http://localhost:3000/az/activate?token=${token}`);
    expect(smsBody).toContain('7');

    const audit = await auditRows(json.businessId);
    expect(audit.map((row) => [row.action, row.actor_type])).toEqual([
      ['seller.created', 'platform'],
    ]);
    expect(audit[0]?.after).toMatchObject({
      voen: body.voen,
      planId: body.planId,
      owner: { phoneE164: '***', fullName: '***' },
    });
  });

  it('F2.1a-AC1 var olan kullanıcı yeniden oluşturulmaz, adı değişmez (S3)', async () => {
    const existing = await userWithPhone();
    const response = await create(
      await sellerBody({ ownerPhone: existing.phone, ownerName: 'Başka Ad' }),
    );
    expect(response.status).toBe(201);
    const users = await platformQuery(sql`
      select id, full_name from users where phone_e164 = ${existing.phone}`);
    expect(users).toEqual([{ id: existing.id, full_name: 'Test Kullanıcı' }]);
  });

  it('F2.1a-AC3 7 gün + 1 sn sonra kabul 404; yeniden gönderim eskiyi geçersiz kılar, yenisi çalışır; aktif admin varken 409', async () => {
    const body = await sellerBody();
    const created = (await create(body)).body as CreatedJson;
    const oldToken = await api.lastActivationToken(body.ownerPhone);

    clock.advance(7 * DAY_MS + 1000);
    const accessToken = await api.loginWithOtp(body.ownerPhone);
    const expired = await accept(accessToken, oldToken);
    expect(expired.status).toBe(404);
    expect((expired.body as ErrorJson).code).toBe('NOT_FOUND');

    const list = await api
      .http()
      .get('/api/v1/admin/sellers')
      .set(await api.bearer(admin))
      .query({ limit: 100 });
    const item = (list.body as { items: { id: string; activation: string }[] }).items.find(
      (row) => row.id === created.businessId,
    );
    expect(item?.activation).toBe('expired');

    const resent = await resend(created.businessId);
    expect(resent.status).toBe(200);
    expect(resent.body).toEqual({
      invitationExpiresAt: new Date(clock.now().getTime() + 7 * DAY_MS).toISOString(),
      activationSmsSent: true,
    });
    const newToken = await api.lastActivationToken(body.ownerPhone);
    expect(newToken).not.toBe(oldToken);
    expect((await accept(accessToken, oldToken)).status).toBe(404);

    // Açık daveti olan işletmede yeniden gönderim önceki açık daveti kapatır.
    const again = await resend(created.businessId);
    expect(again.status).toBe(200);
    const latest = await api.lastActivationToken(body.ownerPhone);
    expect((await accept(accessToken, newToken)).status).toBe(404);

    const ok = await accept(accessToken, latest);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ businessId: created.businessId });

    const conflict = await resend(created.businessId);
    expect(conflict.status).toBe(409);
    expect((conflict.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');

    const audit = await auditRows(created.businessId);
    expect(audit.map((row) => row.action)).toEqual([
      'seller.created',
      'seller.activation_resent',
      'seller.activation_resent',
    ]);
  });

  it('F2.1a-AC3 bilinmeyen işletmeye yeniden gönderim 404', async () => {
    const response = await resend('0190f0a0-0000-7000-8000-000000000000');
    expect(response.status).toBe(404);
  });

  it('F2.1a-AC4 aynı VÖEN ile ikinci toptancı 409; perakendecide kayıtlı VÖEN de 409; satır eklenmez', async () => {
    const first = await sellerBody();
    expect((await create(first)).status).toBe(201);

    const second = await sellerBody({ voen: first.voen });
    const duplicate = await create(second);
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as ErrorJson).code).toBe('VOEN_ALREADY_REGISTERED');
    expect(await rowCounts(first.voen, second.ownerPhone)).toEqual({
      businesses: 1,
      capabilities: 1,
      users: 0,
      invitations: 0,
    });

    // Perakendeci (buyer) işletmesi aynı VÖEN ile (S7 = A).
    const buyerVoen = (await sellerBody()).voen;
    const r = await testRefs();
    await platformQuery(sql`
      with b as (
        insert into businesses (id, legal_name, voen, region_id, timezone, created_via)
        values (${randomUUID()}, 'Perakende MMC', ${buyerVoen}, ${r.cityId}, 'Asia/Baku',
                'self_signup')
        returning id)
      insert into business_capabilities (business_id, capability, status)
      select id, 'buyer', 'approved' from b returning business_id`);
    const asBuyer = await sellerBody({ voen: buyerVoen });
    const rejected = await create(asBuyer);
    expect(rejected.status).toBe(409);
    expect((rejected.body as ErrorJson).code).toBe('VOEN_ALREADY_REGISTERED');
    expect(await rowCounts(buyerVoen, asBuyer.ownerPhone)).toEqual({
      businesses: 1,
      capabilities: 1,
      users: 0,
      invitations: 0,
    });
  });

  it('F2.1a-AC4 eşzamanlı aynı VÖEN: biri 201, diğeri 409 (benzersiz indeks)', async () => {
    const first = await sellerBody();
    const second = await sellerBody({ voen: first.voen });
    const statuses = (await Promise.all([create(first), create(second)])).map((r) => r.status);
    expect(statuses.sort()).toEqual([201, 409]);
  });

  it('F2.1a-AC5 abonelik adımında yapay hata → hiçbir tabloda satır kalmaz, SMS gitmez', async () => {
    vi.spyOn(app.get(PlanService), 'startFirstSubscriptionTx').mockRejectedValueOnce(
      new Error('yapay hata'),
    );
    const body = await sellerBody();
    const response = await create(body);
    expect(response.status).toBe(500);
    expect(await rowCounts(body.voen, body.ownerPhone)).toEqual({
      businesses: 0,
      capabilities: 0,
      users: 0,
      invitations: 0,
    });
    expect(await api.activationSmsCount(body.ownerPhone)).toBe(0);
  });

  it('F2.1a-AC5 davet adımında yapay hata → kullanıcı, rol, abonelik dahil hiçbir satır kalmaz', async () => {
    vi.spyOn(app.get(InvitationService), 'createTx').mockRejectedValueOnce(new Error('yapay hata'));
    const body = await sellerBody();
    const response = await create(body);
    expect(response.status).toBe(500);
    expect(await rowCounts(body.voen, body.ownerPhone)).toEqual({
      businesses: 0,
      capabilities: 0,
      users: 0,
      invitations: 0,
    });
    const leftovers = await platformQuery(sql`
      select (select count(*)::int from subscriptions s
                where not exists (select 1 from businesses b where b.id = s.business_id)) as subs`);
    expect(leftovers).toEqual([{ subs: 0 }]);
    expect(await api.activationSmsCount(body.ownerPhone)).toBe(0);
  });

  it('F2.1a-AC6 platform rolü olmayan, support ve content 403; super_admin ve operations izinli', async () => {
    const body = await sellerBody();
    for (const role of [null, 'support', 'content'] as const) {
      const userId = await platformUser(role);
      for (const call of [
        () => create(body, userId),
        async () =>
          api
            .http()
            .get('/api/v1/admin/sellers')
            .set(await api.bearer(userId)),
        async () =>
          api
            .http()
            .get('/api/v1/admin/plans')
            .set(await api.bearer(userId)),
        () => resend('0190f0a0-0000-7000-8000-000000000000', userId),
      ]) {
        const response = await call();
        expect(response.status, String(role)).toBe(403);
      }
    }
    expect(await rowCounts(body.voen, body.ownerPhone)).toMatchObject({ businesses: 0 });

    const superAdmin = await platformUser('super_admin');
    expect((await create(await sellerBody(), superAdmin)).status).toBe(201);
    const plans = await api
      .http()
      .get('/api/v1/admin/plans')
      .set(await api.bearer(superAdmin));
    expect(plans.status).toBe(200);
    const codes = (plans.body as { items: { code: string; price: string }[] }).items;
    expect(codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pilot', price: '0.00' }),
        expect.objectContaining({ code: 'buyer_free' }),
      ]),
    );
  });

  it('F2.1a-AC6 JWT olmadan 401', async () => {
    const response = await api.http().post('/api/v1/admin/sellers').send({});
    expect(response.status).toBe(401);
  });

  it('F2.1a-AC7 başka telefon, kullanılmış ve uydurma token 404; token log ve audit’te yok; telefon logda açık değil', async () => {
    const body = await sellerBody();
    const created = (await create(body)).body as CreatedJson;
    const token = await api.lastActivationToken(body.ownerPhone);

    const stranger = await userWithPhone();
    const strangerToken = await api.loginWithOtp(stranger.phone);
    expect((await accept(strangerToken, token)).status).toBe(404);

    const ownerToken = await api.loginWithOtp(body.ownerPhone);
    expect((await accept(ownerToken, 'uydurma-token')).status).toBe(404);
    // Son karakter kesin farklı (Müfettiş M1: sabit "A" 1/64 ihtimalle aynı olurdu).
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(tampered).not.toBe(token);
    expect((await accept(ownerToken, tampered)).status).toBe(404);
    expect((await accept(ownerToken, token)).status).toBe(200);
    const reused = await accept(ownerToken, token);
    expect(reused.status).toBe(404);
    expect((reused.body as ErrorJson).code).toBe('NOT_FOUND');
    // Başkası da artık kullanamaz; üyelik tek.
    expect((await accept(strangerToken, token)).status).toBe(404);
    const memberships = await platformQuery(sql`
      select u.phone_e164 from memberships m join users u on u.id = m.user_id
       where m.business_id = ${created.businessId}`);
    expect(memberships).toEqual([{ phone_e164: body.ownerPhone }]);

    const text = logs.text();
    expect(text).not.toContain(token);
    expect(text).not.toContain(body.ownerPhone);
    const auditText = JSON.stringify([
      ...(await auditRows(created.businessId)),
      ...(await platformQuery<{ id: string }>(sql`
        select id from invitations where business_id = ${created.businessId}`).then((rows) =>
        Promise.all(rows.map((row) => auditRows(row.id))),
      )),
    ]);
    expect(auditText).toContain('invitation.accepted');
    expect(auditText).not.toContain(token);
    expect(auditText).not.toContain(body.ownerPhone);
  });

  it('F2.1a-AC9 buyer planı, olmayan bölge, pasif para birimi, geçersiz saat dilimi, geçersiz VÖEN → 422 alan adıyla', async () => {
    const r = await testRefs();
    const cases: [Record<string, unknown>, string][] = [
      [{ planId: r.buyerPlanId }, 'planId'],
      [{ regionId: '0190f0a0-0000-7000-8000-000000000001' }, 'regionId'],
      [{ serviceAreaRegionIds: ['0190f0a0-0000-7000-8000-000000000002'] }, 'serviceAreaRegionIds'],
      [{ currency: r.inactiveCurrency }, 'currency'],
      [{ timezone: 'Mars/Olympus' }, 'timezone'],
      [{ voen: '1234567893' }, 'voen'],
      [{ ownerPhone: '+99412' }, 'ownerPhone'],
      // applicationId F2.2'de desteklendi (seller-applications.int.test.ts: olmayan başvuru 404).
      [{ applicationId: 'not-a-uuid' }, 'applicationId'],
    ];
    for (const [override, field] of cases) {
      const body = await sellerBody(override);
      const response = await create(body);
      expect(response.status, field).toBe(422);
      const json = response.body as ErrorJson;
      expect(json.code, field).toBe('VALIDATION_FAILED');
      expect(Object.keys(json.details ?? {}), field).toContain(field);
      expect(await rowCounts(body.voen, body.ownerPhone), field).toMatchObject({ businesses: 0 });
    }
  });

  it('F2.1a-AC10 SMS gönderilemezse işletme oluşur, activationSmsSent false; yeniden gönderim çalışır', async () => {
    vi.spyOn(app.get(SmsSender), 'send').mockRejectedValueOnce(new Error('sağlayıcı kapalı'));
    const body = await sellerBody();
    const response = await create(body);
    expect(response.status).toBe(201);
    const json = response.body as CreatedJson;
    expect(json.activationSmsSent).toBe(false);
    expect(await rowCounts(body.voen, body.ownerPhone)).toEqual({
      businesses: 1,
      capabilities: 1,
      users: 1,
      invitations: 1,
    });
    expect(await api.activationSmsCount(body.ownerPhone)).toBe(0);

    const resent = await resend(json.businessId);
    expect(resent.status).toBe(200);
    expect((resent.body as { activationSmsSent: boolean }).activationSmsSent).toBe(true);
    const token = await api.lastActivationToken(body.ownerPhone);
    const accessToken = await api.loginWithOtp(body.ownerPhone);
    expect((await accept(accessToken, token)).status).toBe(200);
  });

  it('F2.1a liste: sayfalama imleci ve aktivasyon durumu', async () => {
    // Liste `createdAt desc`; diğer test dosyaları gerçek saatle toptancı açtığından ilk sayfa
    // bu testin toptancısı olmayabilir. İmleçle `b`'ye kadar ilerlenir, sonraki sayfa `a` olmalı.
    const a = (await create(await sellerBody())).body as CreatedJson;
    const b = (await create(await sellerBody())).body as CreatedJson;
    interface Page {
      items: { id: string; activation: string }[];
      nextCursor: string | null;
    }
    const page = async (cursor: string | null): Promise<Page> => {
      const response = await api
        .http()
        .get('/api/v1/admin/sellers')
        .set(await api.bearer(admin))
        .query(cursor === null ? { limit: 1 } : { limit: 1, cursor });
      expect(response.status).toBe(200);
      return response.body as Page;
    };
    let current = await page(null);
    for (let step = 0; step < 500 && current.items[0]?.id !== b.businessId; step += 1) {
      expect(current.nextCursor).not.toBeNull();
      current = await page(current.nextCursor);
    }
    expect(current.items).toEqual([
      expect.objectContaining({ id: b.businessId, activation: 'pending' }),
    ]);
    const next = await page(current.nextCursor);
    expect(next.items.map((item) => item.id)).toEqual([a.businessId]);
  });
});
