import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createTenantPair,
  createTestTenantTable,
  testTenantItems,
} from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { withSystemTx, withTenantTx } from '../../../core/db';
import { AuditService } from '../../../core/audit';
import { SystemClock } from '../../../core/clock';
import { SettingsCache } from '../settings.cache';
import { SettingsRepository } from '../settings.repository';
import { SettingsService } from '../settings.service';
import { insertTestUsers } from '../../../../test/users';

describe('ayar kiracı izolasyonu (settings)', () => {
  let redis: TestRedis;
  let service: SettingsService;
  const actor = { userId: randomUUID() };

  beforeAll(async () => {
    await createTestTenantTable(inject('migratorUrl'));
    await insertTestUsers(actor.userId);
    redis = createTestRedis();
    service = new SettingsService(
      new SettingsRepository(),
      new SettingsCache(redis.client),
      new AuditService(new SystemClock()),
    );
  });

  afterAll(async () => {
    await redis.cleanup();
  });

  it('F1.4-AC6: bağlantı app_user ile kurulur', async () => {
    const result = await withSystemTx((tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );

    expect(result.rows[0]?.current_user).toBe('app_user');
  });

  it("F1.4-AC6: A'nın ayarı B'nin get'inde görünmez", async () => {
    const pair = createTenantPair();
    await service.set(
      'delivery.auto_confirm_hours',
      12,
      { scope: 'business', businessId: pair.a.businessId },
      actor,
    );

    expect(await service.get('delivery.auto_confirm_hours', pair.a.businessId)).toBe(12);
    expect(await service.get('delivery.auto_confirm_hours', pair.b.businessId)).toBe(48);
    expect(await service.get('delivery.auto_confirm_hours')).toBe(48);
  });

  it("F1.4-AC6: B bağlamında A'nın kimliğiyle settings_get işletme satırı döndürmez", async () => {
    const pair = createTenantPair();
    await service.set(
      'connection.daily_request_quota',
      5,
      { scope: 'business', businessId: pair.a.businessId },
      actor,
    );

    const asB = await withTenantTx(pair.b, (tx) =>
      tx.execute<{ scope: string }>(
        sql`select scope from settings_get(${'connection.daily_request_quota'}, ${pair.a.businessId}::uuid)`,
      ),
    );
    const asSystem = await withSystemTx((tx) =>
      tx.execute<{ scope: string }>(
        sql`select scope from settings_get(${'connection.daily_request_quota'}, ${pair.a.businessId}::uuid)`,
      ),
    );
    const asA = await withTenantTx(pair.a, (tx) =>
      tx.execute<{ scope: string; value: unknown }>(
        sql`select scope, value from settings_get(${'connection.daily_request_quota'}, ${pair.a.businessId}::uuid)`,
      ),
    );

    expect(asB.rows.filter((row) => row.scope === 'business')).toEqual([]);
    expect(asSystem.rows.filter((row) => row.scope === 'business')).toEqual([]);
    expect(asA.rows.filter((row) => row.scope === 'business')).toEqual([
      { scope: 'business', value: 5 },
    ]);
  });

  it('F1.4-AC6: withSystemTx T tablosunda 0 satır görür', async () => {
    const pair = createTenantPair();
    await withTenantTx(pair.a, (tx) =>
      tx
        .insert(testTenantItems)
        .values({ id: randomUUID(), businessId: pair.a.businessId, name: 'A' }),
    );

    const rows = await withSystemTx((tx) => tx.select().from(testTenantItems));
    const settings = await withSystemTx((tx) =>
      tx.execute<{ business_id: string; user_id: string; is_platform: string }>(sql`
        select coalesce(current_setting('app.business_id', true), '') as business_id,
               coalesce(current_setting('app.user_id', true), '') as user_id,
               coalesce(current_setting('app.is_platform', true), '') as is_platform
      `),
    );

    expect(rows).toEqual([]);
    expect(settings.rows).toEqual([{ business_id: '', user_id: '', is_platform: '' }]);
  });
});
