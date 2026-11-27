// Müşteri fiyatı satırı doğrulayıcı (F3.7a; US-035 AC2, kart K9; S2 = A bir dosya bir müşteri). Saf
// fonksiyon: SKU eşleşmeleri ve bugünkü fiyatlar çağırandan gelir. Fiyat yalnız `unit` ambalajına
// (F3.5a Mimar S3 ile aynı); fiyatı boş satır atlanır (şablon bütün SKU'larla dolu iner).
import {
  type ImportJobStats,
  type ImportRowErrorCode,
  type ImportRowIssue,
  skuSchema,
} from '@b2b/shared';
import type { ImportSkuMatches } from '../catalog';
import { parsePriceText, resolveTarget } from './row-validator';
import type { RawImportRow } from './xlsx-reader';

/** Fark raporundaki eylem: yeni müşteri fiyatı, değişen, aynı (yazılmaz) veya hata. */
export type CustomerPriceAction = 'insert' | 'update' | 'unchanged' | 'error';

export interface CustomerPriceOutcome {
  readonly row: number;
  readonly sku: string | null;
  readonly action: CustomerPriceAction;
  readonly issues: ImportRowIssue[];
  /** Hatasız satırda dolu: yazılacak ambalaj ve noktalı ondalık fiyat. */
  readonly packagingId?: string;
  readonly price?: string;
  /** Perakendecinin bugün ödediği fiyat (fark raporu); bilinmiyorsa null. */
  readonly currentPrice: string | null;
}

/** Ambalaj başına bugünkü fiyat (pricing `ImportCurrentPrice` ile aynı biçim). */
export interface CustomerPriceCurrent {
  readonly customerPrice: string | null;
  readonly effectivePrice: string | null;
}

export interface CustomerPriceContext {
  readonly matches: ImportSkuMatches;
  readonly current: ReadonlyMap<string, CustomerPriceCurrent>;
}

export interface CustomerPriceValidation {
  readonly outcomes: CustomerPriceOutcome[];
  /** `warning` = değişmeyen satırlar (yalnız burada sayılır; `insert` + `update` yazılacaklar). */
  readonly stats: ImportJobStats;
}

/** Fiyatı dolu satırlar (fiyatı boş satır "dokunma" demektir). */
export function priceRows(rows: readonly RawImportRow[]): RawImportRow[] {
  return rows.filter((row) => row.cells.price !== undefined || row.tooLong.includes('price'));
}

/** Dosyadaki SKU'lar (eşleşme sorgusu için). */
export function customerPriceSkus(rows: readonly RawImportRow[]): string[] {
  return priceRows(rows).flatMap((row) => (row.cells.sku === undefined ? [] : [row.cells.sku]));
}

/** Eşleşen SKU'ların `unit` ambalajları (bugünkü fiyat sorgusu için). */
export function matchedPackagingIds(matches: ImportSkuMatches): string[] {
  const ids = new Set<string>();
  for (const variant of matches.variants.values()) {
    if (variant.unitPackagingId !== null) ids.add(variant.unitPackagingId);
  }
  for (const product of matches.products.values()) {
    if (product.unitPackagingId !== null) ids.add(product.unitPackagingId);
  }
  return [...ids];
}

function sameDecimal(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  return normalize(a) === normalize(b);
}

function error(
  raw: RawImportRow,
  sku: string | null,
  issues: ImportRowIssue[],
  currentPrice: string | null = null,
): CustomerPriceOutcome {
  return { row: raw.row, sku, action: 'error', issues, currentPrice };
}

function validateRow(
  raw: RawImportRow,
  context: CustomerPriceContext,
  duplicates: ReadonlySet<string>,
): CustomerPriceOutcome {
  const issues: ImportRowIssue[] = [];
  const add = (column: 'sku' | 'price', code: ImportRowErrorCode) => issues.push({ column, code });
  for (const column of raw.tooLong) {
    if (column === 'sku' || column === 'price') add(column, 'too_long');
  }
  const sku = raw.cells.sku ?? null;
  let packagingId: string | undefined;
  if (sku === null) {
    if (!raw.tooLong.includes('sku')) add('sku', 'required');
  } else if (!skuSchema.safeParse(sku).success) {
    add('sku', 'invalid');
  } else if (duplicates.has(sku.toLowerCase())) {
    add('sku', 'duplicate_in_file');
  } else {
    const target = resolveTarget(sku, context.matches);
    if (target.kind === 'error') add('sku', target.code);
    else if (target.kind === 'insert') add('sku', 'not_found');
    else if (target.unitPackagingId === null) add('price', 'no_unit_packaging');
    else packagingId = target.unitPackagingId;
  }
  let price: string | undefined;
  if (raw.cells.price !== undefined && !raw.tooLong.includes('price')) {
    const parsed = parsePriceText(raw.cells.price);
    if (parsed.ok) price = parsed.value;
    else add('price', parsed.code);
  }

  const current = packagingId === undefined ? undefined : context.current.get(packagingId);
  const currentPrice = current?.effectivePrice ?? null;
  if (issues.length > 0 || packagingId === undefined || price === undefined) {
    return error(raw, sku, issues, currentPrice);
  }
  const customerPrice = current?.customerPrice ?? null;
  if (customerPrice !== null && sameDecimal(customerPrice, price)) {
    return {
      row: raw.row,
      sku,
      action: 'unchanged',
      issues: [{ column: 'price', code: 'price_unchanged' }],
      packagingId,
      price,
      currentPrice,
    };
  }
  return {
    row: raw.row,
    sku,
    action: customerPrice === null ? 'insert' : 'update',
    issues,
    packagingId,
    price,
    currentPrice,
  };
}

/**
 * Bir ürünün SKU'su ile tek varyantının SKU'su aynı ambalajı gösterebilir: böyle satırların hepsi
 * `sku: duplicate_in_file` olur (F3.5c ile aynı kural).
 */
function samePackagingAsErrors(outcomes: readonly CustomerPriceOutcome[]): CustomerPriceOutcome[] {
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    if (outcome.packagingId !== undefined && outcome.action !== 'error') {
      counts.set(outcome.packagingId, (counts.get(outcome.packagingId) ?? 0) + 1);
    }
  }
  return outcomes.map((outcome) =>
    outcome.packagingId !== undefined &&
    outcome.action !== 'error' &&
    (counts.get(outcome.packagingId) ?? 0) > 1
      ? error(
          { row: outcome.row, cells: {}, tooLong: [] },
          outcome.sku,
          [{ column: 'sku', code: 'duplicate_in_file' }],
          outcome.currentPrice,
        )
      : outcome,
  );
}

export function validateCustomerPriceRows(
  rows: readonly RawImportRow[],
  context: CustomerPriceContext,
): CustomerPriceValidation {
  const considered = priceRows(rows);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of considered) {
    const key = row.cells.sku?.toLowerCase();
    if (key === undefined) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  const outcomes = samePackagingAsErrors(
    considered.map((row) => validateRow(row, context, duplicates)),
  );
  const stats = { insert: 0, update: 0, error: 0, warning: 0 };
  for (const outcome of outcomes) {
    if (outcome.action === 'insert') stats.insert++;
    else if (outcome.action === 'update') stats.update++;
    else if (outcome.action === 'unchanged') stats.warning++;
    else stats.error++;
  }
  return { outcomes, stats };
}
