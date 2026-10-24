// G sınıfı RLS (F1.3-AC6, D2): app_user herkesin okuyabildiği G tablolarına yalnızca platform
// bağlamında (`app.is_platform = 'true'`) yazabilir. Bağlantı RLS'e tabi app_user'dır (§6.12).
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode } from '../../../../test/isolation';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';

const tenant = { businessId: randomUUID(), userId: randomUUID() };
const platform = { userId: randomUUID() };

const usedCodes = new Set<string>();

/** Gerçek kodlarla (az, AZN, AZ…) ve birbiriyle çakışmayan rastgele kod (`Q` + harfler). */
function testCode(length: number): string {
  const letters = 'ABCDEFGHIJKLMNOPRSTUVWXYZ';
  for (;;) {
    let code = 'Q';
    for (const byte of randomBytes(length - 1)) code += letters[byte % letters.length] ?? 'Q';
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
}

/** Bir G tablosuna tek satır ekleyen SQL (önce gereken üst kayıtlar platformda açılır). */
interface InsertCase {
  readonly table: string;
  readonly insert: () => ReturnType<typeof sql>;
}

const currency = testCode(3);
const country = testCode(2);
const language = testCode(2).toLowerCase();

const INSERT_CASES: InsertCase[] = [
  {
    table: 'languages',
    insert: () =>
      sql`insert into languages (code, name, is_active, is_default, sort_order, direction)
          values (${testCode(2).toLowerCase()}, 'Test', false, false, 99, 'ltr')`,
  },
  {
    table: 'ui_translations',
    insert: () =>
      sql`insert into ui_translations (key, lang, value)
          values (${`test.rls.${randomUUID()}`}, ${language}, 'x')`,
  },
  {
    table: 'currencies',
    insert: () =>
      sql`insert into currencies (code, symbol, decimals, is_active)
          values (${testCode(3)}, 'T', 2, false)`,
  },
  {
    table: 'countries',
    insert: () =>
      sql`insert into countries (code, name, default_currency, default_timezone, phone_prefix)
          values (${testCode(2)}, '{"az": "Test"}'::jsonb, ${currency}, 'Asia/Baku', '+999')`,
  },
  {
    table: 'regions',
    insert: () =>
      sql`insert into regions (country_code, parent_id, type, name)
          values (${country}, null, 'city', '{"az": "Test"}'::jsonb)`,
  },
];

async function rowCount(tx: Tx, query: ReturnType<typeof sql>): Promise<number> {
  const result = await tx.execute(query);
  return result.rowCount ?? 0;
}

describe('G sınıfı RLS (i18n tabloları)', () => {
  beforeAll(async () => {
    const who = await withSystemTx((tx) =>
      tx.execute<{ current_user: string }>(sql`select current_user`),
    );
    expect(who.rows[0]?.current_user).toBe('app_user');

    // Testin kendi üst kayıtları (platform bağlamında).
    await withPlatformTx(platform, async (tx) => {
      await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                           values (${currency}, 'Q', 2, true)`);
      await tx.execute(sql`insert into countries
                             (code, name, default_currency, default_timezone, phone_prefix)
                           values (${country}, '{"az": "Q"}'::jsonb, ${currency}, 'Asia/Baku', '+998')`);
      await tx.execute(sql`insert into languages
                             (code, name, is_active, is_default, sort_order, direction)
                           values (${language}, 'Q', false, false, 98, 'ltr')`);
    });
  });

  it.each(INSERT_CASES)(
    'F1.3-AC6: kiracı bağlamında $table insert → 42501',
    async ({ insert }) => {
      const attempt = withTenantTx(tenant, (tx) => tx.execute(insert()));
      await expect(attempt).rejects.toSatisfy(
        (error: unknown) => pgErrorCode(error) === PG_INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it.each(INSERT_CASES)(
    'F1.3-AC6: bağlamsız (sistem) $table insert → 42501',
    async ({ insert }) => {
      const attempt = withSystemTx((tx) => tx.execute(insert()));
      await expect(attempt).rejects.toSatisfy(
        (error: unknown) => pgErrorCode(error) === PG_INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it.each(INSERT_CASES)(
    'F1.3-AC6: platform bağlamında $table insert çalışır',
    async ({ insert }) => {
      const inserted = await withPlatformTx(platform, (tx) => rowCount(tx, insert()));
      expect(inserted).toBe(1);
    },
  );

  it('F1.3-AC6: kiracı ve bağlamsız okuma çalışır', async () => {
    const byTenant = await withTenantTx(tenant, (tx) =>
      tx.execute<{ code: string }>(sql`select code from currencies where code = ${currency}`),
    );
    const bySystem = await withSystemTx((tx) =>
      tx.execute<{ code: string }>(sql`select code from countries where code = ${country}`),
    );

    expect(byTenant.rows).toEqual([{ code: currency }]);
    expect(bySystem.rows).toEqual([{ code: country }]);
  });

  it('F1.3-AC6 (D2): platform dışı UPDATE 0 satır, değer değişmez; platformda çalışır', async () => {
    const update = sql`update currencies set symbol = 'X' where code = ${currency}`;

    const byTenant = await withTenantTx(tenant, (tx) => rowCount(tx, update));
    const bySystem = await withSystemTx((tx) => rowCount(tx, update));
    const unchanged = await withSystemTx((tx) =>
      tx.execute<{ symbol: string }>(sql`select symbol from currencies where code = ${currency}`),
    );

    expect(byTenant).toBe(0);
    expect(bySystem).toBe(0);
    expect(unchanged.rows).toEqual([{ symbol: 'Q' }]);

    const byPlatform = await withPlatformTx(platform, (tx) => rowCount(tx, update));
    expect(byPlatform).toBe(1);
  });

  it('F1.3-AC6: platform dışı DELETE 0 satır; platformda çalışır', async () => {
    const key = `test.rls.delete.${randomUUID()}`;
    await withPlatformTx(platform, (tx) =>
      tx.execute(sql`insert into ui_translations (key, lang, value) values (${key}, ${language}, 'x')`),
    );
    const remove = sql`delete from ui_translations where key = ${key}`;

    expect(await withTenantTx(tenant, (tx) => rowCount(tx, remove))).toBe(0);
    expect(await withSystemTx((tx) => rowCount(tx, remove))).toBe(0);
    expect(await withPlatformTx(platform, (tx) => rowCount(tx, remove))).toBe(1);
  });
});
