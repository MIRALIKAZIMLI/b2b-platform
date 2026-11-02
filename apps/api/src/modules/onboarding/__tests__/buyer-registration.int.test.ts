// F2.3a entegrasyon: kimliksiz perakendeci kaydı (US-005 AC1, AC3, AC4; SF-02; NFR-63),
// tek işlem (R15), telefon kapsamlı idempotens (R12/R13), kayıt anahtarı, IP hız sınırı,
// faaliyet türü listesi. Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { AuditService } from '../../../core/audit';
import { Clock, FixedClock } from '../../../core/clock';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { seedBusinesses } from '../../businesses';
import { TokenService } from '../../identity';
import {
  count,
  rowsForPhone,
  idempotencyKey,
  platformRows,
  RegistrationHttp,
  registerBody,
  runSeeds,
  testRefs,
} from './fixtures';

interface RegisteredJson {
  readonly businessId: string;
  readonly profileCompleteness: number;
  readonly accessToken?: string;
  readonly expiresIn?: number;
  readonly refreshToken?: string;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

const HOUR_MS = 60 * 60 * 1000;

describe('F2.3a perakendeci kaydı (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: RegistrationHttp;
  const clock = new FixedClock(new Date('2026-11-03T08:00:00.000Z'));

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: REDIS_CLIENT, useValue: redis.client },
      ],
    });
    api = new RegistrationHttp(app);
  });

  afterEach(() => {
    // IP hız sınırı penceresi (1 saat) testleri etkilemesin; kayıt anahtarı her testte yeniden imzalanır.
    clock.advance(2 * HOUR_MS);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function registered(
    phone = randomTestPhone(),
    overrides: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) {
    const body = await registerBody(overrides);
    const response = await api.register(await api.pendingToken(phone), body, headers);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return { phone, body, json: response.body as RegisteredJson, response };
  }

  it('US-005-AC1 OTP doğrulanmış telefon + zorunlu alanlar + onay → işletme, buyer yeteneği, varsayılan şube ve admin üyeliği oluşur', async () => {
    const { phone, body, json } = await registered();
    const refs = await testRefs();

    expect(json.profileCompleteness).toBe(40);
    expect(typeof json.accessToken).toBe('string');
    expect(typeof json.refreshToken).toBe('string');

    const [business] = await platformRows<Record<string, unknown>>(
      `select legal_name, region_id, status, created_via, voen, verified_at, currency_code,
              timezone, default_language, data_consent_version, data_consent_at,
              profile_completeness
         from businesses where id = $1`,
      [json.businessId],
    );
    expect(business).toEqual({
      legal_name: body.legalName,
      region_id: refs.regionId,
      status: 'active',
      created_via: 'self_signup',
      voen: null,
      verified_at: null,
      currency_code: 'AZN',
      timezone: 'Asia/Baku',
      default_language: 'az',
      data_consent_version: 'v1',
      data_consent_at: clock.now(),
      profile_completeness: 40,
    });
    const capabilities = await platformRows(
      `select capability, status, approved_by from business_capabilities where business_id = $1`,
      [json.businessId],
    );
    expect(capabilities).toEqual([{ capability: 'buyer', status: 'approved', approved_by: null }]);
    const [profile] = await platformRows(
      `select activity_type_id, listed_in_directory from buyer_profiles where business_id = $1`,
      [json.businessId],
    );
    expect(profile).toEqual({ activity_type_id: refs.activityTypeId, listed_in_directory: true });
    const [privacy] = await platformRows<Record<string, boolean>>(
      `select show_logo, show_address, show_business_phone, show_voen, show_contact_name,
              show_personal_contact
         from business_privacy where business_id = $1`,
      [json.businessId],
    );
    expect(Object.values(privacy ?? {})).toEqual([false, false, false, false, false, false]);
    const [person] = await platformRows(
      `select contact_name, personal_phone from person_data where business_id = $1`,
      [json.businessId],
    );
    expect(person).toEqual({ contact_name: body.fullName, personal_phone: null });
    const branches = await platformRows(
      `select name, region_id, address_line, approval_rule, status from branches where business_id = $1`,
      [json.businessId],
    );
    expect(branches).toEqual([
      {
        name: 'Əsas filial',
        region_id: refs.regionId,
        address_line: null,
        approval_rule: 'every_order',
        status: 'active',
      },
    ]);

    const [user] = await platformRows<{ id: string }>(
      `select id, full_name, preferred_language, status from users where phone_e164 = $1`,
      [phone],
    );
    expect(user).toMatchObject({
      full_name: body.fullName,
      preferred_language: 'az',
      status: 'active',
    });
    const memberships = await platformRows(
      `select m.status, r.is_business_admin, r.capability
         from memberships m join roles r on r.id = m.role_id
        where m.user_id = $1 and m.business_id = $2`,
      [user?.id, json.businessId],
    );
    expect(memberships).toEqual([
      { status: 'active', is_business_admin: true, capability: 'buyer' },
    ]);
    // F2.7c: yeteneğin tüm rol şablonları işletmeye kopyalanır (ekip daveti için).
    const roleCodes = await platformRows<{ code: string }>(
      `select t.code from roles r join role_templates t on t.id = r.source_template_id
        where r.business_id = $1 order by t.code`,
      [json.businessId],
    );
    expect(roleCodes.map((row) => row.code)).toEqual([
      'buyer_accountant',
      'buyer_branch_admin',
      'buyer_branch_staff',
      'buyer_business_admin',
      'buyer_purchaser',
    ]);

    const subscriptions = await platformRows(
      `select p.code, s.status, s.current_period_start::text as start,
              s.current_period_end::text as end
         from subscriptions s join plans p on p.id = s.plan_id where s.business_id = $1`,
      [json.businessId],
    );
    expect(subscriptions).toEqual([
      { code: 'buyer_free', status: 'active', start: '2026-11-03', end: '2026-12-02' },
    ]);

    const events = await platformRows(
      `select type, payload from outbox_events where aggregate_id = $1`,
      [json.businessId],
    );
    expect(events).toEqual([
      {
        type: 'buyer.registered',
        payload: { businessId: json.businessId, regionId: refs.regionId },
      },
    ]);
    const audits = await platformRows<{ action: string; actor_user_id: string }>(
      `select action, actor_user_id from audit_logs where target_id = $1`,
      [json.businessId],
    );
    expect(audits).toEqual([{ action: 'buyer.registered', actor_user_id: user?.id }]);

    // Oturum açıldı: erişim anahtarıyla yeni işletme üyeliği görünür (ikinci OTP gerekmez, K6).
    const me = await api
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${json.accessToken ?? ''}`);
    expect(me.status).toBe(200);
    const meBody = me.body as { memberships: { businessId: string }[] };
    expect(meBody.memberships.map((item) => item.businessId)).toEqual([json.businessId]);
  });

  it('F2.3a-K6 web istemcide yenileme anahtarı gövdede değil httpOnly cookie’de', async () => {
    const { json, response } = await registered(randomTestPhone(), {}, { 'X-Client': 'web' });
    expect(json.refreshToken).toBeUndefined();
    expect(String(response.headers['set-cookie'])).toContain('b2b_rt=');
  });

  it.each(['fullName', 'legalName', 'activityTypeId', 'regionId', 'consentVersion'])(
    'US-005-AC3 zorunlu alan boş (%s) → 422, alan işaretlenir, kayıt yok',
    async (field) => {
      const phone = randomTestPhone();
      const body = await registerBody({ [field]: field.endsWith('Id') ? undefined : '  ' });
      const response = await api.register(await api.pendingToken(phone), body);
      expect(response.status).toBe(422);
      const error = response.body as ErrorJson;
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(error.details ?? {})).toContain(field);
      expect(
        await count(`select count(*)::int as n from users where phone_e164 = $1`, [phone]),
      ).toBe(0);
    },
  );

  it('US-005-AC3 bilinmeyen bölge, pasif faaliyet türü, pasif dil, eski onay sürümü → 422 ve hiçbir satır yok', async () => {
    const refs = await testRefs();
    const cases: [Record<string, unknown>, string, string][] = [
      [{ regionId: randomUUID() }, 'regionId', 'not_found'],
      [{ activityTypeId: refs.inactiveActivityTypeId }, 'activityTypeId', 'not_found'],
      [{ preferredLanguage: 'en' }, 'preferredLanguage', 'not_found'],
      [{ consentVersion: 'v0' }, 'consentVersion', 'outdated'],
    ];
    for (const [overrides, field, reason] of cases) {
      const phone = randomTestPhone();
      const body = await registerBody(overrides);
      const response = await api.register(await api.pendingToken(phone), body);
      expect(response.status, field).toBe(422);
      expect((response.body as ErrorJson).details).toEqual({ [field]: [reason] });
      expect(await rowsForPhone(phone, String(body.legalName))).toEqual({
        users: 0,
        businesses: 0,
        memberships: 0,
        subscriptions: 0,
        idempotency: 0,
      });
    }
  });

  it('US-005-AC4 telefon zaten kayıtlı → 409 PHONE_ALREADY_REGISTERED, yeni işletme yok', async () => {
    const phone = randomTestPhone();
    await insertTestUser({ id: randomUUID(), phone });
    const body = await registerBody();
    const response = await api.register(await api.pendingToken(phone), body);
    expect(response.status).toBe(409);
    expect((response.body as ErrorJson).code).toBe('PHONE_ALREADY_REGISTERED');
    expect(
      await count(`select count(*)::int as n from businesses where legal_name = $1`, [
        body.legalName,
      ]),
    ).toBe(0);
  });

  it('F2.3a-K5 kayıt anahtarı yok, bozuk, erişim anahtarı veya TOTP ön oturumu → 401', async () => {
    const body = await registerBody();
    const tokens = app.get(TokenService);
    const access = await tokens.signAccess({ userId: randomUUID(), sessionId: randomUUID() });
    const totp = await tokens.signPendingTotp(randomUUID());
    for (const token of [undefined, 'bozuk.anahtar.x', access.token, totp]) {
      const response = await api.register(token, body);
      expect(response.status).toBe(401);
      expect((response.body as ErrorJson).code).toBe('UNAUTHENTICATED');
    }
    expect(
      await count(`select count(*)::int as n from businesses where legal_name = $1`, [
        body.legalName,
      ]),
    ).toBe(0);
  });

  it('F2.3a-R13 aynı Idempotency-Key ile tekrar → aynı 201 gövdesi (oturumsuz), tek işletme', async () => {
    const key = idempotencyKey();
    const { phone, body, json } = await registered(
      randomTestPhone(),
      {},
      { 'Idempotency-Key': key },
    );
    const replay = await api.register(await api.pendingToken(phone), body, {
      'Idempotency-Key': key,
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({
      businessId: json.businessId,
      profileCompleteness: json.profileCompleteness,
    });
    expect(await rowsForPhone(phone, String(body.legalName))).toEqual({
      users: 1,
      businesses: 1,
      memberships: 1,
      subscriptions: 1,
      idempotency: 1,
    });
  });

  it('F2.3a-R13 aynı anahtar farklı gövde → 409 IDEMPOTENCY_CONFLICT; anahtarsız tekrar → 409 PHONE_ALREADY_REGISTERED (anahtar tek kullanımlık)', async () => {
    const key = idempotencyKey();
    const { phone, body } = await registered(randomTestPhone(), {}, { 'Idempotency-Key': key });
    const token = await api.pendingToken(phone);

    const conflict = await api.register(
      token,
      { ...body, legalName: 'Başqa ad' },
      { 'Idempotency-Key': key },
    );
    expect(conflict.status).toBe(409);
    expect((conflict.body as ErrorJson).code).toBe('IDEMPOTENCY_CONFLICT');

    const again = await api.register(token, body);
    expect(again.status).toBe(409);
    expect((again.body as ErrorJson).code).toBe('PHONE_ALREADY_REGISTERED');
    const other = await api.register(token, body, { 'Idempotency-Key': idempotencyKey() });
    expect((other.body as ErrorJson).code).toBe('PHONE_ALREADY_REGISTERED');
  });

  it('F2.3a-AC hız sınırı: IP başına saatte ayar kadar istek; fazlası 429 + Retry-After', async () => {
    const max = 10; // buyer_registration.ip_max_per_hour varsayılanı
    // Hız sınırı kayıt anahtarı doğrulandıktan sonra, kayıttan önce sayılır: kayıtlı telefonla
    // gelen her istek (409) de sayılır.
    const phone = randomTestPhone();
    await insertTestUser({ id: randomUUID(), phone });
    const token = await api.pendingToken(phone);
    const body = await registerBody();
    for (let attempt = 0; attempt < max; attempt++) {
      expect((await api.register(token, body)).status).toBe(409);
    }
    const limited = await api.register(await api.pendingToken(randomTestPhone()), body);
    expect(limited.status).toBe(429);
    expect((limited.body as ErrorJson).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    const keys = await redis.keys();
    expect(keys.some((key) => key.startsWith('buyer_reg:req:ip:'))).toBe(true);
  });

  it('F2.3a faaliyet türleri: kimliksiz liste, yalnızca aktifler, sıraya göre; seed tekrar çalışınca ekleme yok', async () => {
    const response = await api.http().get('/api/v1/catalog/activity-types');
    expect(response.status).toBe(200);
    const items = response.body as { id: string; name: { az: string }; sortOrder: number }[];
    const refs = await testRefs();
    expect(items.some((item) => item.id === refs.inactiveActivityTypeId)).toBe(false);
    expect(items[0]?.name.az).toBe('Market / ərzaq mağazası');
    expect(items.map((item) => item.sortOrder)).toEqual(
      [...items.map((item) => item.sortOrder)].sort((a, b) => a - b),
    );
    expect(items.length).toBeGreaterThanOrEqual(11);

    const client = await connectAsMigrator();
    try {
      expect(await seedBusinesses(client)).toEqual({ inserted: 0 });
    } finally {
      await client.end();
    }
  });
});

describe('F2.3a-R15 yapay hata: kayıt yarıda kalırsa hiçbir satır kalmaz', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        // Audit, kullanıcı, işletme, üyelik, abonelik ve outbox yazıldıktan sonra çağrılır.
        {
          provide: AuditService,
          useValue: {
            record: () => Promise.reject(new Error('yapay hata (R15)')),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F2.3a-R15 abonelik ve outbox sonrası hata → 500; users, businesses, memberships, subscriptions, idempotens satırı yok', async () => {
    const api = new RegistrationHttp(app);
    const phone = randomTestPhone();
    const body = await registerBody();
    const response = await api.register(await api.pendingToken(phone), body, {
      'Idempotency-Key': idempotencyKey(),
    });
    expect(response.status).toBe(500);
    expect(await rowsForPhone(phone, String(body.legalName))).toEqual({
      users: 0,
      businesses: 0,
      memberships: 0,
      subscriptions: 0,
      idempotency: 0,
    });
  });
});
