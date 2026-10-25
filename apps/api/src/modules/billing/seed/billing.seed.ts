// Plan başlangıç verisi (F1.4b, data-model §4.6). `pnpm db:seed` çalıştırır; idempotendir.
// - migrator rolüyle, tek işlemde ve platform bağlamında yazar (G tabloları FORCE RLS).
// - ON CONFLICT DO NOTHING: adminin sonradan yaptığı düzenlemeler ezilmez.
// - Değerler platform sahibinin varsayılan kararı (2026-10-24): iki plan da 0.00 AZN, aylık,
//   sayısal haklar sınırsız (null). Gerçek fiyatlar F6.3 admin ekranından girilir.
// - Hak değerleri hak kaydıyla doğrulanır (Mimar D3); geçersiz değer seed'i durdurur.
// - i18n seed'inden sonra çalışır (AZN para birimi gerekir).
import {
  type EntitlementKey,
  FEATURE_ENTITLEMENT_KEYS,
  LIMIT_ENTITLEMENT_KEYS,
  parseEntitlementValue,
} from '@b2b/shared';

/** pg `Client` / `PoolClient` uyar (bağlantıyı cli.ts açar). */
export interface SeedClient {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
}

export interface BillingSeedResult {
  /** Bu çalıştırmada eklenen satır sayısı (var olanlar sayılmaz). */
  readonly inserted: number;
}

interface SeedPlan {
  readonly code: string;
  readonly name: Readonly<Record<'az' | 'ru' | 'tr', string>>;
  readonly capability: 'seller' | 'buyer';
  readonly price: string;
  readonly currencyCode: string;
  readonly period: 'month' | 'year';
  readonly entitlements: Readonly<Record<EntitlementKey, unknown>>;
}

function entitlementsWith(features: boolean): Record<EntitlementKey, unknown> {
  const values = {} as Record<EntitlementKey, unknown>;
  for (const key of LIMIT_ENTITLEMENT_KEYS) values[key] = null;
  for (const key of FEATURE_ENTITLEMENT_KEYS) values[key] = features;
  return values;
}

export const SEED_PLANS: readonly SeedPlan[] = [
  {
    code: 'pilot',
    name: { az: 'Pilot', ru: 'Пилот', tr: 'Pilot' },
    capability: 'seller',
    price: '0.00',
    currencyCode: 'AZN',
    period: 'month',
    entitlements: entitlementsWith(true),
  },
  {
    code: 'buyer_free',
    name: { az: 'Pulsuz', ru: 'Бесплатный', tr: 'Ücretsiz' },
    capability: 'buyer',
    price: '0.00',
    currencyCode: 'AZN',
    period: 'month',
    entitlements: entitlementsWith(false),
  },
];

async function insertAll(client: SeedClient, newId: () => string): Promise<number> {
  let inserted = 0;
  for (const plan of SEED_PLANS) {
    const created = await client.query(
      `insert into plans (id, code, name, capability, price, currency_code, period)
       values ($1, $2, $3::jsonb, $4, $5::numeric, $6, $7)
       on conflict (code) do nothing`,
      [
        newId(),
        plan.code,
        JSON.stringify(plan.name),
        plan.capability,
        plan.price,
        plan.currencyCode,
        plan.period,
      ],
    );
    inserted += created.rowCount ?? 0;
    for (const [key, value] of Object.entries(plan.entitlements)) {
      if (!parseEntitlementValue(key as EntitlementKey, value).ok) {
        throw new Error(`Seed hak değeri geçersiz: ${plan.code} ${key}`);
      }
      const result = await client.query(
        `insert into plan_entitlements (plan_id, key, value)
         select id, $2, $3::jsonb from plans where code = $1
         on conflict do nothing`,
        [plan.code, key, JSON.stringify(value)],
      );
      inserted += result.rowCount ?? 0;
    }
  }
  return inserted;
}

/** Seed'i tek işlemde uygular; hata olursa hiçbir satır yazılmaz. `newId` UUIDv7 üretir (D4). */
export async function seedBilling(
  client: SeedClient,
  newId: () => string,
): Promise<BillingSeedResult> {
  await client.query('begin');
  try {
    await client.query("select set_config('app.is_platform', 'true', true)");
    const inserted = await insertAll(client, newId);
    await client.query('commit');
    return { inserted };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
