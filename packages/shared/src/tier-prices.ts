// Kademeli fiyat (F3.9; US-037 AC1, ADR-0019; openapi `/api/v1/tier-prices`; data-model §4.9
// `tier_prices`). Kademe bir ambalaj seviyesinin bütün perakendecilerine uygulanır; seçilen fiyatın
// (müşteri, atanmış liste, varsayılan liste) üzerine gelir. Eşik satış birimi cinsindendir (o ambalaj
// adedi); miktar eşiğe eşitse indirim uygulanır (P7). Kurallar (kullanıcı kararı S2 = A): eşik
// 1'den büyük ve tekrarsız, indirim 0 < x < 100, eşik büyüdükçe indirim de büyür. Kademe sayısı
// sınırı ayardan (`pricing.tier_max_per_packaging`); şemadaki üst sınır yalnız gövde büyüklüğü içindir.
import { z } from 'zod';
import { normalizeDecimalInput } from './pricing-form';

/** `min_qty numeric(14,3)`: en çok 11 tam + 3 ondalık hane. */
export const TIER_MIN_QTY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;
/** `discount_percent numeric(5,2)` ve 100'den küçük: en çok 2 tam + 2 ondalık hane. */
export const TIER_PERCENT_PATTERN = /^\d{1,2}(\.\d{1,2})?$/;
/** Gövdede en çok bu kadar kademe (openapi `maxItems`); asıl sınır ayardadır (en çok 20). */
export const TIER_PRICES_BODY_MAX = 20;
/** `GET /tier-prices` süzgecinde en çok bu kadar ambalaj kimliği. */
export const TIER_PRICES_FILTER_MAX = 100;

export interface TierInput {
  readonly minQty: string;
  readonly discountPercent: string;
}

export type TierRuleError =
  'min_qty_too_small' | 'duplicate_min_qty' | 'percent_out_of_range' | 'percent_not_increasing';

/**
 * Negatif olmayan iki ondalık metni karşılaştırır (desenlerden geçmiş değerler; sayıya çevirmez).
 * Eksi: a < b, 0: eşit, artı: a > b.
 */
export function compareDecimalText(a: string, b: string): number {
  const [aWhole = '0', aFraction = ''] = a.split('.');
  const [bWhole = '0', bFraction = ''] = b.split('.');
  const wholeA = aWhole.replace(/^0+(?=\d)/, '');
  const wholeB = bWhole.replace(/^0+(?=\d)/, '');
  if (wholeA.length !== wholeB.length) return wholeA.length - wholeB.length;
  if (wholeA !== wholeB) return wholeA < wholeB ? -1 : 1;
  const width = Math.max(aFraction.length, bFraction.length);
  const fa = aFraction.padEnd(width, '0');
  const fb = bFraction.padEnd(width, '0');
  if (fa === fb) return 0;
  return fa < fb ? -1 : 1;
}

/**
 * Kademe kuralları (S2 = A). Desene uyan satırlar için alan başına hata kodu döner; anahtar
 * `<index>.minQty` veya `<index>.discountPercent`. Sıralama gövdede serbest; artış kuralı eşik
 * sırasına göre denetlenir ve hata daha büyük eşikli satıra yazılır.
 */
export function tierRuleErrors(tiers: readonly TierInput[]): Map<string, TierRuleError> {
  const errors = new Map<string, TierRuleError>();
  const seen = new Map<string, number>();
  tiers.forEach((tier, index) => {
    if (compareDecimalText(tier.minQty, '1') <= 0) {
      errors.set(`${String(index)}.minQty`, 'min_qty_too_small');
    }
    if (compareDecimalText(tier.discountPercent, '0') <= 0) {
      errors.set(`${String(index)}.discountPercent`, 'percent_out_of_range');
    }
    const key = [...seen.keys()].find((other) => compareDecimalText(other, tier.minQty) === 0);
    if (key !== undefined) {
      errors.set(`${String(index)}.minQty`, 'duplicate_min_qty');
    } else {
      seen.set(tier.minQty, index);
    }
  });
  const order = tiers
    .map((tier, index) => ({ tier, index }))
    .sort((a, b) => compareDecimalText(a.tier.minQty, b.tier.minQty));
  for (let i = 1; i < order.length; i++) {
    const previous = order[i - 1];
    const current = order[i];
    if (previous === undefined || current === undefined) continue;
    if (compareDecimalText(previous.tier.minQty, current.tier.minQty) === 0) continue;
    if (compareDecimalText(current.tier.discountPercent, previous.tier.discountPercent) <= 0) {
      const field = `${String(current.index)}.discountPercent`;
      if (!errors.has(field)) errors.set(field, 'percent_not_increasing');
    }
  }
  return errors;
}

const tierSchema = z
  .object({
    minQty: z.string().regex(TIER_MIN_QTY_PATTERN),
    discountPercent: z.string().regex(TIER_PERCENT_PATTERN),
  })
  .strict();

/** `PUT /tier-prices` (US-037 AC1): ambalajın bütün kademeleri değişir; boş liste = kaldır. */
export const tierPricesSetSchema = z
  .object({
    packagingId: z.uuid(),
    tiers: z
      .array(tierSchema)
      .max(TIER_PRICES_BODY_MAX)
      .superRefine((tiers, context) => {
        for (const [field, code] of tierRuleErrors(tiers)) {
          const [index = '0', name = 'minQty'] = field.split('.');
          context.addIssue({ code: 'custom', path: [Number(index), name], message: code });
        }
      }),
  })
  .strict();
export type TierPricesSet = z.infer<typeof tierPricesSetSchema>;

/** `GET /tier-prices`: yalnız bu ambalaj seviyelerinin kademeleri (ürün formu; tekrarlı parametre). */
export const tierPricesQuerySchema = z
  .object({
    packagingId: z.preprocess(
      (value) => (typeof value === 'string' ? [value] : value),
      z.array(z.uuid()).min(1).max(TIER_PRICES_FILTER_MAX),
    ),
  })
  .strict();
export type TierPricesQuery = z.infer<typeof tierPricesQuerySchema>;

/** openapi `TierPrice`. */
export interface TierPriceView {
  readonly minQty: string;
  readonly discountPercent: string;
}

/** openapi `PackagingTiers`: eşik artan. */
export interface PackagingTiersView {
  readonly packagingId: string;
  readonly tiers: readonly TierPriceView[];
}

/** openapi `TierPricePage`: kademesi olmayan ambalaj da boş listeyle döner. */
export interface TierPricePage {
  readonly items: readonly PackagingTiersView[];
  /** Ambalaj başına en çok kademe (ayar `pricing.tier_max_per_packaging`). */
  readonly maxPerPackaging: number;
}

// ---- Web formu ----

export interface TierFormRow {
  readonly minQty: string;
  readonly discountPercent: string;
}

export type TierFormError = TierRuleError | 'invalid' | 'required';

/**
 * Kademe satırları → `PUT` gövdesinin `tiers`'ı. Tamamen boş satır atlanır; virgül noktaya çevrilir.
 * Hata anahtarı `<satır>.minQty|discountPercent` (satır = formdaki sıra).
 */
export function tierPricesBody(
  rows: readonly TierFormRow[],
):
  | { readonly ok: true; readonly tiers: readonly TierInput[] }
  | { readonly ok: false; readonly errors: ReadonlyMap<string, TierFormError> } {
  const errors = new Map<string, TierFormError>();
  const tiers: TierInput[] = [];
  const rowOf: number[] = [];
  rows.forEach((row, index) => {
    const minQty = normalizeDecimalInput(row.minQty);
    const percent = normalizeDecimalInput(row.discountPercent);
    if (minQty === '' && percent === '') return;
    const at = String(index);
    if (minQty === '') errors.set(`${at}.minQty`, 'required');
    else if (!TIER_MIN_QTY_PATTERN.test(minQty)) errors.set(`${at}.minQty`, 'invalid');
    if (percent === '') errors.set(`${at}.discountPercent`, 'required');
    else if (!TIER_PERCENT_PATTERN.test(percent)) errors.set(`${at}.discountPercent`, 'invalid');
    if (!errors.has(`${at}.minQty`) && !errors.has(`${at}.discountPercent`)) {
      tiers.push({ minQty, discountPercent: percent });
      rowOf.push(index);
    }
  });
  for (const [field, code] of tierRuleErrors(tiers)) {
    const [index = '0', name = 'minQty'] = field.split('.');
    const row = rowOf[Number(index)];
    if (row !== undefined) errors.set(`${String(row)}.${name}`, code);
  }
  if (errors.size > 0) return { ok: false, errors };
  return { ok: true, tiers };
}

/**
 * API 422 ayrıntısı (`tiers.<i>.<alan>`: [kod]) → form hata anahtarları. `sentRows[i]` gönderilen
 * i. kademenin formdaki satırı. `tiers` kökündeki hata (sınır aşıldı) `limit` olarak döner.
 */
export function tierPricesFieldErrors(
  details: unknown,
  sentRows: readonly number[],
): { readonly fields: ReadonlyMap<string, TierFormError>; readonly limit: boolean } {
  const fields = new Map<string, TierFormError>();
  if (typeof details !== 'object' || details === null) return { fields, limit: false };
  const known: readonly string[] = [
    'min_qty_too_small',
    'duplicate_min_qty',
    'percent_out_of_range',
    'percent_not_increasing',
  ];
  for (const [key, value] of Object.entries(details)) {
    const match = /^tiers\.(\d+)\.(minQty|discountPercent)$/.exec(key);
    const row = match === null ? undefined : sentRows[Number(match[1])];
    if (match === null || row === undefined) continue;
    const first: unknown = Array.isArray(value) ? value[0] : undefined;
    const code =
      typeof first === 'string' && known.includes(first) ? (first as TierRuleError) : 'invalid';
    fields.set(`${String(row)}.${match[2] ?? 'minQty'}`, code);
  }
  return { fields, limit: 'tiers' in details };
}

/** Gösterim: `10.000` → `10`, `2.50` → `2.5` (metin; sayıya çevrilmez). */
export function formatTierDecimal(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}
