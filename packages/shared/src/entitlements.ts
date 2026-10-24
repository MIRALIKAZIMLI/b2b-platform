// Plan hakkı anahtar kaydı (ADR-0009, data-model §4.6 `plan_entitlements`). Her anahtarın tipi
// Zod ile tanımlıdır; `plan_entitlements` ve `entitlement_overrides` değerleri yazılırken bu kayıtla
// doğrulanır (F1.4b, Mimar düzeltmesi D3). Liste data-model §4.6 tablosuyla birebir aynıdır
// (test: entitlements.test.ts). Kod plan adına göre dallanmaz; yalnızca bu anahtarları sorar.
import { z } from 'zod';

/** Sayısal hak: tamsayı ≥ 0; `null` = sınırsız. */
const limitSchema = z.number().int().min(0).nullable();

/** Özellik hakkı: açık / kapalı. */
const featureSchema = z.boolean();

export const LIMIT_ENTITLEMENT_KEYS = [
  'users.max',
  'buyers.active.max',
  'warehouses.max',
  'connection_requests.daily',
] as const;

export const FEATURE_ENTITLEMENT_KEYS = [
  'feature.courier_app',
  'feature.export',
  'feature.branch_pricing',
] as const;

export type LimitEntitlementKey = (typeof LIMIT_ENTITLEMENT_KEYS)[number];
export type FeatureEntitlementKey = (typeof FEATURE_ENTITLEMENT_KEYS)[number];
export type EntitlementKey = LimitEntitlementKey | FeatureEntitlementKey;

export const ENTITLEMENT_KEYS: readonly EntitlementKey[] = [
  ...LIMIT_ENTITLEMENT_KEYS,
  ...FEATURE_ENTITLEMENT_KEYS,
];

/** Sayısal hak değeri; `null` sınırsızdır. */
export type LimitValue = number | null;

export type EntitlementValue<K extends EntitlementKey> = K extends LimitEntitlementKey
  ? LimitValue
  : boolean;

const LIMIT_KEY_SET: ReadonlySet<string> = new Set(LIMIT_ENTITLEMENT_KEYS);
const KEY_SET: ReadonlySet<string> = new Set(ENTITLEMENT_KEYS);

export function isEntitlementKey(value: unknown): value is EntitlementKey {
  return typeof value === 'string' && KEY_SET.has(value);
}

export function isLimitEntitlementKey(value: unknown): value is LimitEntitlementKey {
  return typeof value === 'string' && LIMIT_KEY_SET.has(value);
}

export type ParseEntitlementResult<K extends EntitlementKey> =
  { readonly ok: true; readonly value: EntitlementValue<K> } | { readonly ok: false };

/** Değeri anahtarın tipine göre doğrular. Hata ayrıntısı döndürmez. */
export function parseEntitlementValue<K extends EntitlementKey>(
  key: K,
  raw: unknown,
): ParseEntitlementResult<K> {
  const schema: z.ZodType<unknown> = isLimitEntitlementKey(key) ? limitSchema : featureSchema;
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, value: result.data as EntitlementValue<K> }
    : { ok: false };
}
