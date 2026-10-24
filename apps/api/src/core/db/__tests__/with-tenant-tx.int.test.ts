import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createTenantPair, createTestTenantTable, testTenantItems } from '../../../../test/isolation';
import { getDb } from '../client';
import { type Tx, withPlatformTx, withTenantTx } from '../index';

interface Settings {
  business_id: string | null;
  user_id: string | null;
  is_platform: string | null;
}

async function readSettings(tx: Pick<Tx, 'execute'>): Promise<Settings> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    select current_setting('app.business_id', true) as business_id,
           current_setting('app.user_id', true) as user_id,
           current_setting('app.is_platform', true) as is_platform
  `);
  return result.rows[0] as unknown as Settings;
}

/** İşlem dışında, aynı havuz bağlantısında (havuz tek bağlantılı) ayarları okur. */
async function readSettingsOutsideTx(): Promise<Settings> {
  return readSettings(getDb());
}

/** Boş ayar: PostgreSQL bir kez ayarlanmış değişkeni işlem sonunda '' olarak bırakır. */
function isUnset(value: string | null): boolean {
  return value === null || value === '';
}

describe('withTenantTx / withPlatformTx', () => {
  let pair = createTenantPair();

  beforeAll(async () => {
    await createTestTenantTable(inject('migratorUrl'));
  });

  beforeEach(() => {
    pair = createTenantPair();
  });

  it('F1.1-AC1: withTenantTx ayarları işlem içinde görünür', async () => {
    const settings = await withTenantTx(pair.a, (tx) => readSettings(tx));

    expect(settings.business_id).toBe(pair.a.businessId);
    expect(settings.user_id).toBe(pair.a.userId);
  });

  it('F1.1-AC1: kullanıcısız işlemde app.user_id boştur', async () => {
    const settings = await withTenantTx({ businessId: pair.a.businessId, userId: null }, (tx) =>
      readSettings(tx),
    );

    expect(settings.business_id).toBe(pair.a.businessId);
    expect(isUnset(settings.user_id)).toBe(true);
  });

  it('F1.1-AC1: işlem sonrası ayar sızmaz', async () => {
    await withTenantTx(pair.a, (tx) => readSettings(tx));

    const after = await readSettingsOutsideTx();

    expect(isUnset(after.business_id)).toBe(true);
    expect(isUnset(after.user_id)).toBe(true);
  });

  it('F1.1-AC1: fn hata atarsa rollback olur', async () => {
    const id = randomUUID();

    await expect(
      withTenantTx(pair.a, async (tx) => {
        await tx.insert(testTenantItems).values({ id, businessId: pair.a.businessId, name: 'x' });
        throw new Error('test hatası');
      }),
    ).rejects.toThrow('test hatası');

    const rows = await withTenantTx(pair.a, (tx) => tx.select().from(testTenantItems));
    expect(rows.find((row) => row.id === id)).toBeUndefined();
    expect(isUnset((await readSettingsOutsideTx()).business_id)).toBe(true);
  });

  it('F1.1-AC1: geçersiz businessId ile işlem açılmaz', async () => {
    await expect(withTenantTx({ businessId: '', userId: null }, () => Promise.resolve(1))).rejects.toThrow();
    await expect(
      withTenantTx({ businessId: 'abc', userId: null }, () => Promise.resolve(1)),
    ).rejects.toThrow();
    await expect(
      withTenantTx({ businessId: pair.a.businessId, userId: 'abc' }, () => Promise.resolve(1)),
    ).rejects.toThrow();
  });

  it('F1.1-AC2: bağlamsız sorgu 0 satır döner', async () => {
    await withTenantTx(pair.a, (tx) =>
      tx.insert(testTenantItems).values({ id: randomUUID(), businessId: pair.a.businessId, name: 'a' }),
    );

    const pooled = await getDb().execute<{ count: string }>(
      sql`select count(*)::text as count from test_tenant_items`,
    );
    expect(pooled.rows[0]?.count).toBe('0');

    const client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    try {
      const fresh = await client.query('select * from test_tenant_items');
      expect(fresh.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('F1.1-AC3: testler app_user olarak çalışır', async () => {
    const result = await withTenantTx(pair.a, (tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );

    expect(result.rows[0]?.current_user).toBe('app_user');
  });

  it('F1.1-AC3: app_user tablo sahibi değil', async () => {
    const result = await withTenantTx(pair.a, (tx) =>
      tx.execute<{ tablename: string; tableowner: string }>(sql`
        select tablename, tableowner from pg_tables
        where schemaname not in ('pg_catalog', 'information_schema')
      `),
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.filter((row) => row.tableowner === 'app_user')).toEqual([]);
    expect(result.rows.find((row) => row.tablename === 'test_tenant_items')?.tableowner).toBe(
      'migrator',
    );
  });

  it('F1.1-AC3: app_user süper kullanıcı değil ve BYPASSRLS yok', async () => {
    const result = await withTenantTx(pair.a, (tx) =>
      tx.execute<{ rolsuper: boolean; rolbypassrls: boolean; is_migrator: boolean }>(sql`
        select rolsuper, rolbypassrls, pg_has_role('app_user', 'migrator', 'member') as is_migrator
        from pg_roles where rolname = 'app_user'
      `),
    );

    expect(result.rows).toEqual([{ rolsuper: false, rolbypassrls: false, is_migrator: false }]);
  });

  it('F1.1-AC5: platform işleminde is_platform true', async () => {
    const userId = randomUUID();
    const settings = await withPlatformTx({ userId }, (tx) => readSettings(tx));

    expect(settings.is_platform).toBe('true');
    expect(settings.user_id).toBe(userId);
    expect(isUnset(settings.business_id)).toBe(true);
  });

  it('F1.1-AC5: kiracı işleminde is_platform yok', async () => {
    await withPlatformTx({ userId: randomUUID() }, (tx) => readSettings(tx));

    const tenant = await withTenantTx(pair.a, (tx) => readSettings(tx));
    const after = await readSettingsOutsideTx();

    expect(isUnset(tenant.is_platform)).toBe(true);
    expect(isUnset(after.is_platform)).toBe(true);
  });
});
