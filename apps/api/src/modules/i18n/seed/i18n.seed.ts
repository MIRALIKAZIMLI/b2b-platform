// i18n başlangıç verisi (F1.3, data-model §6.4). `pnpm db:seed` çalıştırır; idempotendir.
// - migrator rolüyle, tek işlemde ve platform bağlamında (`set_config('app.is_platform',
//   'true', true)`) yazar: tablolar FORCE RLS olduğu için sahibi de politikalara tabidir.
// - ON CONFLICT DO NOTHING: adminin sonradan yaptığı düzenlemeler ezilmez.
// - Bölge eklemez: pilot bölge listesi belgede yok (data-model §6 AÇIK SORU, Mimar kararı F1.3).
import { ERROR_MESSAGES } from './error-messages';
import { SMS_MESSAGES } from './sms-messages';

/** pg `Client` / `PoolClient` uyar (modüller pg'yi içe aktarmaz; bağlantıyı cli.ts açar). */
export interface SeedClient {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

const LANGUAGES = [
  { code: 'az', name: 'Azərbaycan dili', isActive: true, isDefault: true, sortOrder: 1 },
  { code: 'ru', name: 'Русский', isActive: true, isDefault: false, sortOrder: 2 },
  { code: 'tr', name: 'Türkçe', isActive: true, isDefault: false, sortOrder: 3 },
  { code: 'en', name: 'English', isActive: false, isDefault: false, sortOrder: 4 },
] as const;

const SEED_LANGS = ['az', 'ru', 'tr'] as const;

export interface I18nSeedResult {
  /** Bu çalıştırmada eklenen satır sayısı (var olanlar sayılmaz). */
  readonly inserted: number;
}

async function insertAll(client: SeedClient): Promise<number> {
  let inserted = 0;
  for (const language of LANGUAGES) {
    const result = await client.query(
      `insert into languages (code, name, is_active, is_default, sort_order, direction)
       values ($1, $2, $3, $4, $5, 'ltr')
       on conflict do nothing`,
      [language.code, language.name, language.isActive, language.isDefault, language.sortOrder],
    );
    inserted += result.rowCount ?? 0;
  }

  const currency = await client.query(
    `insert into currencies (code, symbol, decimals, is_active)
     values ('AZN', '₼', 2, true)
     on conflict do nothing`,
  );
  inserted += currency.rowCount ?? 0;

  const country = await client.query(
    `insert into countries (code, name, default_currency, default_timezone, phone_prefix)
     values ('AZ', $1::jsonb, 'AZN', 'Asia/Baku', '+994')
     on conflict do nothing`,
    [JSON.stringify({ az: 'Azərbaycan', ru: 'Азербайджан', tr: 'Azerbaycan', en: 'Azerbaijan' })],
  );
  inserted += country.rowCount ?? 0;

  const keys: string[] = [];
  const langs: string[] = [];
  const values: string[] = [];
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    for (const lang of SEED_LANGS) {
      keys.push(`errors.${code}`);
      langs.push(lang);
      values.push(text[lang]);
    }
  }
  for (const [key, text] of Object.entries(SMS_MESSAGES)) {
    for (const lang of SEED_LANGS) {
      keys.push(key);
      langs.push(lang);
      values.push(text[lang]);
    }
  }
  const translations = await client.query(
    `insert into ui_translations (key, lang, value)
     select * from unnest($1::text[], $2::text[], $3::text[])
     on conflict do nothing`,
    [keys, langs, values],
  );
  inserted += translations.rowCount ?? 0;

  return inserted;
}

/** Seed'i tek işlemde uygular; hata olursa hiçbir satır yazılmaz. */
export async function seedI18n(client: SeedClient): Promise<I18nSeedResult> {
  await client.query('begin');
  try {
    await client.query("select set_config('app.is_platform', 'true', true)");
    const inserted = await insertAll(client);
    await client.query('commit');
    return { inserted };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
