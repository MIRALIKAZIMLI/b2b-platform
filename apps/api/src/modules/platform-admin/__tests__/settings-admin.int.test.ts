// F2.19 admin ayar ekranı uçları (US-017 AC1–AC3). Gerçek PostgreSQL; uygulama bağlantısı
// RLS'e tabi app_user. Testler başka testlerin okuduğu değerleri değiştirmemek için kendi planını
// açar ve platform kapsamında yalnız etkisiz `onboarding.seller_mode` anahtarına yazar.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { withPlatformTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { SettingsService } from '../../settings';
import {
  businessRows,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
} from './buyer-fixtures';
import { AdminHttp, auditRows, platformUser } from './fixtures';

interface ItemJson {
  readonly key: string;
  readonly kind: string;
  readonly min?: number;
  readonly max?: number;
  readonly scopes: string[];
  readonly value: unknown;
  readonly inheritedValue: unknown;
  readonly inheritedFrom: string;
  readonly updatedAt: string | null;
}

describe('F2.19 admin ayarlar (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: AdminHttp;
  let superAdmin: string;
  let planId: string;
  let region: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    api = new AdminHttp(app);
    superAdmin = await platformUser('super_admin');
    region = await newRegion('Ayarlar');
    planId = randomUUID();
    await platformRows(
      `insert into plans (id, code, name, capability, price, currency_code, period)
       values ($1, $2, '{"az": "Test planı"}'::jsonb, 'seller', 0, 'AZN', 'month')`,
      [planId, `f219_${planId.slice(0, 8)}`],
    );
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const code = (body: unknown) => (body as { code: string }).code;

  async function list(query: Record<string, string>, userId = superAdmin) {
    return await api
      .http()
      .get('/api/v1/admin/settings')
      .query(query)
      .set(await api.bearer(userId));
  }

  async function put(body: unknown, userId = superAdmin) {
    return await api
      .http()
      .put('/api/v1/admin/settings')
      .set(await api.bearer(userId))
      .send(body as object);
  }

  function item(body: unknown, key: string): ItemJson | undefined {
    return (body as { items: ItemJson[] }).items.find((candidate) => candidate.key === key);
  }

  /** Test planına abone yeni perakendeci. */
  async function buyerOnTestPlan(): Promise<string> {
    const buyer = await newBuyer(region);
    await platformRows(
      `insert into subscriptions
         (id, business_id, plan_id, status, current_period_start, current_period_end)
       values ($1, $2, $3, 'active', current_date, current_date + 30)`,
      [randomUUID(), buyer.businessId, planId],
    );
    return buyer.businessId;
  }

  it('F2.19-AC1: platform kapsamı tüm anahtarları tür, sınır ve miras ile döner', async () => {
    const response = await list({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ scope: 'platform', scopeId: null });
    expect(item(response.body, 'connection.cooldown_after_reject_days')).toMatchObject({
      kind: 'int',
      min: 7,
      max: 365,
      scopes: ['platform', 'plan', 'business'],
      inheritedFrom: 'default',
      inheritedValue: 30,
    });
    expect(item(response.body, 'otp.code_ttl_minutes')?.scopes).toEqual(['platform']);
  });

  it('F2.19-AC1: platform kapsamına yazılır; yanıt güncel satırdır', async () => {
    const response = await put({
      scope: 'platform',
      key: 'onboarding.seller_mode',
      value: 'manual',
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ key: 'onboarding.seller_mode', value: 'manual' });
    expect((response.body as ItemJson).updatedAt).not.toBeNull();
  });

  it('F2.19-AC1: plan ve işletme kapsamı; en özel kapsam geçerli olur', async () => {
    const businessId = await buyerOnTestPlan();
    const key = 'invitation.team_days';

    const planWrite = await put({ scope: 'plan', scopeId: planId, key, value: 10 });
    expect(planWrite.status).toBe(200);
    expect(planWrite.body).toMatchObject({
      value: 10,
      inheritedFrom: expect.any(String) as string,
    });

    const before = await list({ scope: 'business', scopeId: businessId });
    expect(item(before.body, key)).toMatchObject({
      value: null,
      inheritedValue: 10,
      inheritedFrom: 'plan',
    });

    const businessWrite = await put({ scope: 'business', scopeId: businessId, key, value: 3 });
    expect(businessWrite.status).toBe(200);
    expect(businessWrite.body).toMatchObject({
      value: 3,
      inheritedValue: 10,
      inheritedFrom: 'plan',
    });

    const settings = app.get(SettingsService);
    expect(await settings.get(key, businessId)).toBe(3);
    const other = await buyerOnTestPlan();
    expect(await settings.get(key, other)).toBe(10);

    const planList = await list({ scope: 'plan', scopeId: planId });
    expect(item(planList.body, key)).toMatchObject({ value: 10 });
  });

  it('F2.19-AC2: değişiklik audit’e eski ve yeni değerle yazılır', async () => {
    const seller = await newSeller(region);
    const key = 'connection.daily_request_quota';
    const target = { scope: 'business', scopeId: seller.businessId, key };
    expect((await put({ ...target, value: 50 })).status).toBe(200);
    expect((await put({ ...target, value: 80 })).status).toBe(200);
    const rows = await auditRows(`business:${seller.businessId}:${key}`);
    expect(rows.map((row) => [row.action, row.actor_type, row.before, row.after])).toEqual([
      ['setting.updated', 'platform', null, 50],
      ['setting.updated', 'platform', 50, 80],
    ]);
  });

  it('F2.19-AC3: bekleme süresi 6 gün → 422 SETTING_OUT_OF_RANGE, yazılmaz', async () => {
    const response = await put({
      scope: 'plan',
      scopeId: planId,
      key: 'connection.cooldown_after_reject_days',
      value: 6,
    });
    expect(response.status).toBe(422);
    expect(code(response.body)).toBe('SETTING_OUT_OF_RANGE');
    const planList = await list({ scope: 'plan', scopeId: planId });
    expect(item(planList.body, 'connection.cooldown_after_reject_days')?.value).toBeNull();
  });

  it('F2.19-AC4: operasyon, destek, içerik ve platform rolü olmayan kullanıcı 403', async () => {
    for (const role of ['operations', 'support', 'content', null] as const) {
      const userId = await platformUser(role);
      expect((await list({}, userId)).status).toBe(403);
      expect(
        (await put({ scope: 'platform', key: 'onboarding.seller_mode', value: 'manual' }, userId))
          .status,
      ).toBe(403);
    }
    const seller = await newSeller(region);
    expect((await list({}, seller.admin.userId)).status).toBe(403);
  });

  it('F2.19-AC5: yalnız platform anahtarı plan/işletmede 422 SETTING_SCOPE_NOT_ALLOWED', async () => {
    const response = await put({
      scope: 'plan',
      scopeId: planId,
      key: 'otp.max_attempts',
      value: 3,
    });
    expect(response.status).toBe(422);
    expect(code(response.body)).toBe('SETTING_SCOPE_NOT_ALLOWED');
  });

  it('F2.19-AC5: olmayan plan veya işletme 404; eksik scopeId 422', async () => {
    const missing = randomUUID();
    expect((await list({ scope: 'plan', scopeId: missing })).status).toBe(404);
    expect((await list({ scope: 'business', scopeId: missing })).status).toBe(404);
    const write = await put({
      scope: 'business',
      scopeId: missing,
      key: 'invitation.team_days',
      value: 5,
    });
    expect(write.status).toBe(404);
    expect((await list({ scope: 'plan' })).status).toBe(422);
    expect((await put({ scope: 'platform', key: 'yok.anahtar', value: 1 })).status).toBe(422);
  });

  it('F2.19-AC6: settings_admin_list platform bağlamı dışında 42501, içinde çalışır', async () => {
    const seller = await newSeller(region);
    await expect(
      businessRows(seller.businessId, `select * from settings_admin_list('platform', null)`),
    ).rejects.toMatchObject({ code: '42501' });
    const rows = await withPlatformTx({ userId: superAdmin }, (tx) =>
      tx.execute<{ key: string }>(sql`select key from settings_admin_list('platform', null)`),
    );
    expect(rows.rows.some((row) => row.key === 'onboarding.seller_mode')).toBe(true);
  });
});
