import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import { SettingsCache } from '../settings.cache';
import { SettingsRepository } from '../settings.repository';
import { SettingsService } from '../settings.service';

/** migrator (tablo sahibi) ile tablodaki satırı okur; testte doğrulama için. */
async function readRowAsOwner(
  key: string,
  businessId: string | null,
): Promise<{ value: unknown; updated_by: string | null } | undefined> {
  const client = new Client({ connectionString: inject('migratorUrl') });
  await client.connect();
  try {
    const result = await client.query<{ value: unknown; updated_by: string | null }>(
      `select value, updated_by from settings
        where key = $1 and scope_id is not distinct from $2::uuid`,
      [key, businessId],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

describe('SettingsService (entegrasyon: PostgreSQL + Redis)', () => {
  let redis: TestRedis;
  let service: SettingsService;
  const actor = { userId: randomUUID() };

  beforeAll(() => {
    redis = createTestRedis();
    service = new SettingsService(new SettingsRepository(), new SettingsCache(redis.client));
  });

  afterAll(async () => {
    await redis.cleanup();
  });

  it('F1.4-AC1: işletme değeri platformu ezer', async () => {
    const businessId = randomUUID();
    await service.set('connection.request_ttl_days', 21, { scope: 'platform' }, actor);
    await service.set('connection.request_ttl_days', 10, { scope: 'business', businessId }, actor);

    expect(await service.get('connection.request_ttl_days', businessId)).toBe(10);
    expect(await service.get('connection.request_ttl_days', randomUUID())).toBe(21);
    expect(await service.get('connection.request_ttl_days')).toBe(21);
  });

  it('F1.4-AC1: değer yoksa kod varsayılanı', async () => {
    expect(await service.get('delivery.location_mismatch_meters', randomUUID())).toBe(300);
    expect(await service.get('mobile.min_version.ios')).toBe('0.0.0');
  });

  it('F1.4-AC2: cooldown 6 gün → SETTING_OUT_OF_RANGE (veritabanına yazılmaz)', async () => {
    const error = await errorOf(
      service.set('connection.cooldown_after_reject_days', 6, { scope: 'platform' }, actor),
    );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('SETTING_OUT_OF_RANGE');
    expect(await readRowAsOwner('connection.cooldown_after_reject_days', null)).toBeUndefined();
  });

  it('F1.4-AC3: set sonrası get yeni değeri döner', async () => {
    const businessId = randomUUID();
    expect(await service.get('sms.daily_cap', businessId)).toBe(500);
    expect(await redis.keys()).toContain(`settings:platform:-:sms.daily_cap`);

    await service.set('sms.daily_cap', 250, { scope: 'platform' }, actor);
    expect(await service.get('sms.daily_cap', businessId)).toBe(250);

    await service.set('sms.daily_cap', 50, { scope: 'business', businessId }, actor);
    expect(await service.get('sms.daily_cap', businessId)).toBe(50);

    await service.set('sms.daily_cap', 60, { scope: 'business', businessId }, actor);
    expect(await service.get('sms.daily_cap', businessId)).toBe(60);
  });

  it('F1.4-AC3: Redis yoksa değer veritabanından okunur', async () => {
    const broken = createTestRedis('redis://127.0.0.1:1');
    try {
      const offline = new SettingsService(
        new SettingsRepository(),
        new SettingsCache(broken.client),
      );
      await offline.set('outbox.max_attempts', 7, { scope: 'platform' }, actor);

      expect(await offline.get('outbox.max_attempts')).toBe(7);
    } finally {
      await broken.cleanup();
    }
  });

  it('K2: updated_by platform kullanıcısıdır', async () => {
    const userId = randomUUID();
    await service.set('outbox.poll_interval_ms', 2000, { scope: 'platform' }, { userId });

    expect(await readRowAsOwner('outbox.poll_interval_ms', null)).toEqual({
      value: 2000,
      updated_by: userId,
    });
  });

  it('F1.4-AC5: app_user select → 42501', async () => {
    const error = await errorOf(withSystemTx((tx) => tx.execute(sql`select * from settings`)));

    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.4-AC5: app_user insert / update / delete → 42501', async () => {
    const statements = [
      sql`insert into settings (scope, key, value) values ('platform', 'sms.daily_cap', '1')`,
      sql`update settings set value = '1'`,
      sql`delete from settings`,
    ];
    for (const statement of statements) {
      const error = await errorOf(
        withPlatformTx({ userId: actor.userId }, (tx) => tx.execute(statement)),
      );
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    }
  });

  it('F1.4-AC5: fonksiyonla okuma çalışır', async () => {
    await service.set('connection.block_rate_alert_pct', 15, { scope: 'platform' }, actor);

    const result = await withSystemTx((tx) =>
      tx.execute<{ scope: string; value: unknown }>(
        sql`select scope, value from settings_get(${'connection.block_rate_alert_pct'}, null)`,
      ),
    );

    expect(result.rows).toEqual([{ scope: 'platform', value: 15 }]);
  });

  it('F1.4-AC5: settings_put platform bağlamı dışında → 42501', async () => {
    const businessId = randomUUID();
    const put = sql`select settings_put('business', ${businessId}::uuid, 'sms.daily_cap', '1'::jsonb)`;

    const asTenant = await errorOf(
      withTenantTx({ businessId, userId: randomUUID() }, (tx) => tx.execute(put)),
    );
    const asSystem = await errorOf(withSystemTx((tx) => tx.execute(put)));

    expect(pgErrorCode(asTenant)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(pgErrorCode(asSystem)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(await readRowAsOwner('sms.daily_cap', businessId)).toBeUndefined();
  });

  it('F1.4-AC5: PUBLIC fonksiyonları çalıştıramaz, sahibi migrator', async () => {
    const result = await withSystemTx((tx) =>
      tx.execute<{ proname: string; owner: string; public_exec: boolean; definer: boolean }>(sql`
        select p.proname,
               pg_get_userbyid(p.proowner) as owner,
               exists (
                 select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE'
               ) as public_exec,
               p.prosecdef as definer
          from pg_proc p
         where p.proname in ('settings_get', 'settings_put')
         order by p.proname
      `),
    );

    expect(result.rows).toEqual([
      { proname: 'settings_get', owner: 'migrator', public_exec: false, definer: true },
      { proname: 'settings_put', owner: 'migrator', public_exec: false, definer: true },
    ]);
  });
});
