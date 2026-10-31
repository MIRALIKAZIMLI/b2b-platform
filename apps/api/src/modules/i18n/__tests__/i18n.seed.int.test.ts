// i18n seed'i (F1.3): idempotent, migrator rolüyle platform bağlamında yazar, admin
// düzenlemelerini ezmez (ON CONFLICT DO NOTHING). Pilot bölgeler F2.1a'da eklendi (onaylı liste:
// docs/tasks/F2-seed-listeleri.md §1); F1.3'teki "bölge eklemez" kararı bununla kapandı.
import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { withPlatformTx, withSystemTx } from '../../../core/db';
import { ERROR_MESSAGES } from '../seed/error-messages';
import { seedI18n } from '../seed/i18n.seed';
import { PILOT_REGIONS } from '../seed/regions';

describe('i18n seed', () => {
  let owner: Awaited<ReturnType<typeof connectAsMigrator>>;

  beforeAll(async () => {
    owner = await connectAsMigrator();
  });

  afterAll(async () => {
    await owner.end();
  });

  it('F1.3: iki kez çalışınca aynı sonuç (idempotent)', async () => {
    await seedI18n(owner);
    const first = await snapshot();
    await seedI18n(owner);
    const second = await snapshot();

    expect(second).toEqual(first);
  });

  it('F1.3: diller, para birimi ve ülke kartta yazıldığı gibi', async () => {
    await seedI18n(owner);

    const languages = await withSystemTx((tx) =>
      tx.execute<{ code: string; is_active: boolean; is_default: boolean }>(
        sql`select code, is_active, is_default from languages
             where code in ('az', 'ru', 'tr', 'en') order by sort_order`,
      ),
    );
    const currency = await withSystemTx((tx) =>
      tx.execute(sql`select code, symbol, decimals, is_active from currencies where code = 'AZN'`),
    );
    const country = await withSystemTx((tx) =>
      tx.execute(sql`select code, default_currency, default_timezone, phone_prefix
                       from countries where code = 'AZ'`),
    );

    expect(languages.rows).toEqual([
      { code: 'az', is_active: true, is_default: true },
      { code: 'ru', is_active: true, is_default: false },
      { code: 'tr', is_active: true, is_default: false },
      { code: 'en', is_active: false, is_default: false },
    ]);
    expect(currency.rows).toEqual([{ code: 'AZN', symbol: '₼', decimals: 2, is_active: true }]);
    expect(country.rows).toEqual([
      { code: 'AZ', default_currency: 'AZN', default_timezone: 'Asia/Baku', phone_prefix: '+994' },
    ]);
  });

  it('F1.3 (D5): her ErrorCode için az, ru, tr çevirisi yazılır', async () => {
    await seedI18n(owner);

    const rows = await withSystemTx((tx) =>
      tx.execute<{ key: string; lang: string; value: string }>(
        sql`select key, lang, value from ui_translations where key like 'errors.%'`,
      ),
    );

    for (const code of ERROR_CODES) {
      for (const lang of ['az', 'ru', 'tr'] as const) {
        const row = rows.rows.find((r) => r.key === `errors.${code}` && r.lang === lang);
        expect({ code, lang, value: row?.value }).toEqual({
          code,
          lang,
          value: ERROR_MESSAGES[code][lang],
        });
      }
    }
  });

  it('F1.3: seed adminin değiştirdiği çeviriyi ve dil durumunu ezmez', async () => {
    await seedI18n(owner);
    const platform = { userId: randomUUID() };
    await withPlatformTx(platform, async (tx) => {
      await tx.execute(sql`update ui_translations set value = 'Admin metni'
                            where key = 'errors.NOT_FOUND' and lang = 'az'`);
      await tx.execute(sql`update languages set sort_order = 42 where code = 'tr'`);
    });

    try {
      await seedI18n(owner);
      const after = await withSystemTx((tx) =>
        tx.execute<{ value: string }>(
          sql`select value from ui_translations where key = 'errors.NOT_FOUND' and lang = 'az'`,
        ),
      );
      const tr = await withSystemTx((tx) =>
        tx.execute<{ sort_order: number }>(sql`select sort_order from languages where code = 'tr'`),
      );
      expect(after.rows).toEqual([{ value: 'Admin metni' }]);
      expect(tr.rows).toEqual([{ sort_order: 42 }]);
    } finally {
      await withPlatformTx(platform, async (tx) => {
        await tx.execute(sql`update ui_translations set value = ${ERROR_MESSAGES.NOT_FOUND.az}
                              where key = 'errors.NOT_FOUND' and lang = 'az'`);
        await tx.execute(sql`update languages set sort_order = 3 where code = 'tr'`);
      });
    }
  });

  it('F2.1a: seed onaylı pilot bölgeleri ekler (4 şehir, Bakı altında 12 rayon); tekrar çalışınca çoğalmaz', async () => {
    await seedI18n(owner);
    await seedI18n(owner);

    // Diğer test dosyaları kendi AZ bölgelerini açar; yalnızca onaylı listedeki adlar sayılır.
    const names = PILOT_REGIONS.flatMap((city) => [
      city.name.az,
      ...(city.districts ?? []).map((district) => district.az),
    ]);
    const regions = await withSystemTx((tx) =>
      tx.execute<{ type: string; parent: string | null; n: number }>(
        sql`select r.type, p.name->>'az' as parent, count(*)::int as n
              from regions r left join regions p on p.id = r.parent_id
             where r.country_code = 'AZ' and r.name->>'az' in ${names}
             group by r.type, p.name->>'az' order by r.type`,
      ),
    );
    expect(regions.rows).toEqual([
      { type: 'city', parent: null, n: 4 },
      { type: 'district', parent: 'Bakı', n: 12 },
    ]);
    const baku = await withSystemTx((tx) =>
      tx.execute<{ name: unknown }>(
        sql`select name from regions where country_code = 'AZ' and type = 'city'
             and name->>'az' = 'Bakı'`,
      ),
    );
    expect(baku.rows).toEqual([{ name: { az: 'Bakı', ru: 'Баку', tr: 'Bakü' } }]);
  });

  it('F1.3: seed bağlantıda platform ayarını bırakmaz (set_config işlem içinde)', async () => {
    await seedI18n(owner);

    const setting = await owner.query<{ value: string | null }>(
      "select current_setting('app.is_platform', true) as value",
    );
    expect(setting.rows[0]?.value ?? '').toBe('');
  });
});

async function snapshot(): Promise<unknown> {
  return await withSystemTx(async (tx) => ({
    languages: (await tx.execute(sql`select * from languages order by code`)).rows,
    currencies: (await tx.execute(sql`select * from currencies where code = 'AZN'`)).rows,
    countries: (await tx.execute(sql`select * from countries where code = 'AZ'`)).rows,
    translations: (
      await tx.execute(
        sql`select key, lang, value from ui_translations where key like 'errors.%' order by key, lang`,
      )
    ).rows,
  }));
}
