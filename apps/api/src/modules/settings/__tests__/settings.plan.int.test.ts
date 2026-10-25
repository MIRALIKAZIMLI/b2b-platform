// F1.4-AC1 plan katmanı (F1.4b): çözümleme işletme → plan → platform. Plan ve abonelik satırları
// platform bağlamında ham SQL ile açılır (billing modülünün iç dosyaları içe aktarılmaz).
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { withPlatformTx, withTenantTx } from '../../../core/db';
import { SettingsCache } from '../settings.cache';
import { SettingsRepository } from '../settings.repository';
import { SettingsService } from '../settings.service';

const PLATFORM = { userId: randomUUID() };

async function createRegion(): Promise<string> {
  return await withPlatformTx(PLATFORM, async (tx) => {
    await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                         values ('XBA', 'X', 2, true) on conflict do nothing`);
    await tx.execute(sql`insert into countries
                           (code, name, default_currency, default_timezone, phone_prefix)
                         values ('XB', '{"az": "Test"}'::jsonb, 'XBA', 'Asia/Baku', '+997')
                         on conflict do nothing`);
    const region = await tx.execute<{ id: string }>(sql`
      insert into regions (country_code, parent_id, type, name)
      values ('XB', null, 'city', '{"az": "Test"}'::jsonb) returning id`);
    const id = region.rows[0]?.id;
    if (id === undefined) throw new Error('test bölgesi oluşmadı');
    return id;
  });
}

async function createPlan(): Promise<string> {
  const planId = randomUUID();
  await withPlatformTx(PLATFORM, (tx) =>
    tx.execute(sql`
      insert into plans (id, code, name, capability, price, currency_code, period)
      values (${planId}, ${`test_${planId}`}, '{"az": "Test"}'::jsonb, 'seller', 0, 'XBA', 'month')`),
  );
  return planId;
}

/** İşletme açar; `planId` verilirse güncel abonelik başlatır. */
async function createBusiness(regionId: string, planId?: string): Promise<string> {
  const businessId = randomUUID();
  await withTenantTx({ businessId, userId: null }, (tx) =>
    tx.execute(sql`
      insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
      values (${businessId}, 'Test MMC', 'XB', ${regionId}, 'Asia/Baku', 'self_signup')`),
  );
  if (planId !== undefined) {
    await withPlatformTx(PLATFORM, (tx) =>
      tx.execute(sql`
        insert into subscriptions
          (id, business_id, plan_id, status, current_period_start, current_period_end)
        values (${randomUUID()}, ${businessId}, ${planId}, 'active', '2026-10-01', '2026-10-31')`),
    );
  }
  return businessId;
}

describe('SettingsService plan katmanı (entegrasyon: PostgreSQL + Redis)', () => {
  let redis: TestRedis;
  let settings: SettingsService;
  let regionId: string;

  beforeAll(async () => {
    redis = createTestRedis();
    settings = new SettingsService(new SettingsRepository(), new SettingsCache(redis.client));
    regionId = await createRegion();
  });

  afterAll(async () => {
    await redis.cleanup();
  });

  it('F1.4-AC1: plan değeri platformu ezer', async () => {
    const planId = await createPlan();
    const subscribed = await createBusiness(regionId, planId);
    const other = await createBusiness(regionId);
    await settings.set('connection.request_ttl_days', 21, { scope: 'platform' }, PLATFORM);
    await settings.set('connection.request_ttl_days', 30, { scope: 'plan', planId }, PLATFORM);

    expect(await settings.get('connection.request_ttl_days', subscribed)).toBe(30);
    expect(await settings.get('connection.request_ttl_days', other)).toBe(21);
    expect(await settings.get('connection.request_ttl_days')).toBe(21);
  });

  it('F1.4-AC1: işletme değeri planı ezer', async () => {
    const planId = await createPlan();
    const own = await createBusiness(regionId, planId);
    const sibling = await createBusiness(regionId, planId);
    await settings.set('delivery.auto_confirm_hours', 24, { scope: 'plan', planId }, PLATFORM);
    await settings.set(
      'delivery.auto_confirm_hours',
      12,
      { scope: 'business', businessId: own },
      PLATFORM,
    );

    expect(await settings.get('delivery.auto_confirm_hours', own)).toBe(12);
    expect(await settings.get('delivery.auto_confirm_hours', sibling)).toBe(24);
  });

  it('F1.4-AC1: plan ayarı yazılınca önbellek yenilenir', async () => {
    const planId = await createPlan();
    const businessId = await createBusiness(regionId, planId);
    const before = await settings.get('sms.daily_cap', businessId);
    expect(before).not.toBe(70);
    expect(await redis.keys()).toContain(`settings:business:${businessId}:sms.daily_cap`);

    await settings.set('sms.daily_cap', 70, { scope: 'plan', planId }, PLATFORM);
    expect(await settings.get('sms.daily_cap', businessId)).toBe(70);

    await settings.set('sms.daily_cap', 80, { scope: 'plan', planId }, PLATFORM);
    expect(await settings.get('sms.daily_cap', businessId)).toBe(80);
  });

  it('F1.4-AC1: aboneliği iptal edilen işletmede plan katmanı yok', async () => {
    const planId = await createPlan();
    const businessId = await createBusiness(regionId, planId);
    await settings.set('outbox.batch_size', 7, { scope: 'plan', planId }, PLATFORM);
    await withPlatformTx(PLATFORM, (tx) =>
      tx.execute(
        sql`update subscriptions set status = 'cancelled' where business_id = ${businessId}`,
      ),
    );

    expect(await settings.get('outbox.batch_size', businessId)).toBe(100);
  });
});
