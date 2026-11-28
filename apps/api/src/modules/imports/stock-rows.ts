// Stok sayımı satırı doğrulayıcı (F3.11c; US-039 AC7, kart K4–K7; S1 = A sayılan toplam, S2 = B
// şablondan sonra değişen stok, S3 = A bir dosya bir depo). Saf fonksiyon: SKU eşleşmeleri ve
// depodaki bugünkü sayılar çağırandan gelir. Miktar `number`'a çevrilmez (`decimal.js`).
import {
  type ImportColumn,
  type ImportJobStats,
  type ImportRowIssue,
  skuSchema,
} from '@b2b/shared';
import { compare, fromDecimalString } from '../../core/money';
import type { ImportSkuMatches } from '../catalog';
import type { StockCounts } from '../inventory';
import { parseQtyText, resolveTarget } from './row-validator';
import type { RawImportRow } from './xlsx-reader';

/** İlk sayım (stok satırı yok), değişen, aynı (hareket yazılmaz) veya hata. */
export type StockAction = 'insert' | 'update' | 'unchanged' | 'error';

export interface StockOutcome {
  readonly row: number;
  readonly sku: string | null;
  readonly action: StockAction;
  readonly issues: ImportRowIssue[];
  /** Hatasız satırda dolu: sayılacak varyant ve noktalı ondalık sayılan toplam. */
  readonly variantId?: string;
  readonly counted?: string;
  /** S2 = B: dosyadaki `current_stock` (boşsa undefined: kontrol yok). */
  readonly expected?: string;
  /** Depodaki bugünkü `on_hand` (rapor); sayılmamış veya bilinmiyorsa null. */
  readonly currentOnHand: string | null;
}

export interface StockValidation {
  readonly outcomes: StockOutcome[];
  /** `insert` = ilk sayım, `update` = değişen, `warning` = aynı, `error` = hatalı. */
  readonly stats: ImportJobStats;
}

/** K4: sayılan hücresi boş satır "dokunma" demektir. */
export function stockRows(rows: readonly RawImportRow[]): RawImportRow[] {
  return rows.filter((row) => row.cells.stock !== undefined || row.tooLong.includes('stock'));
}

export function stockSkus(rows: readonly RawImportRow[]): string[] {
  return stockRows(rows).flatMap((row) => (row.cells.sku === undefined ? [] : [row.cells.sku]));
}

/** Eşleşen SKU'ların varyantları (bugünkü sayı sorgusu için). */
export function matchedVariantIds(matches: ImportSkuMatches): string[] {
  const ids = new Set<string>();
  for (const variant of matches.variants.values()) ids.add(variant.variantId);
  for (const product of matches.products.values()) {
    if (product.activeVariantId !== null) ids.add(product.activeVariantId);
  }
  return [...ids];
}

function errorOutcome(
  raw: Pick<RawImportRow, 'row'>,
  sku: string | null,
  issues: ImportRowIssue[],
  currentOnHand: string | null,
): StockOutcome {
  return { row: raw.row, sku, action: 'error', issues, currentOnHand };
}

function validateRow(
  raw: RawImportRow,
  matches: ImportSkuMatches,
  counts: ReadonlyMap<string, StockCounts>,
  duplicates: ReadonlySet<string>,
): StockOutcome {
  const issues: ImportRowIssue[] = [];
  const add = (column: ImportColumn, code: ImportRowIssue['code']) => issues.push({ column, code });
  for (const column of raw.tooLong) add(column, 'too_long');
  const sku = raw.cells.sku ?? null;
  let variantId: string | undefined;
  if (sku === null) {
    if (!raw.tooLong.includes('sku')) add('sku', 'required');
  } else if (raw.tooLong.includes('sku')) {
    // too_long zaten eklendi.
  } else if (!skuSchema.safeParse(sku).success) {
    add('sku', 'invalid');
  } else if (duplicates.has(sku.toLowerCase())) {
    add('sku', 'duplicate_in_file');
  } else {
    const target = resolveTarget(sku, matches);
    if (target.kind === 'error') add('sku', target.code);
    else if (target.kind === 'insert') add('sku', 'not_found');
    else variantId = target.variantId;
  }
  let counted: string | undefined;
  if (raw.cells.stock !== undefined && !raw.tooLong.includes('stock')) {
    const parsed = parseQtyText(raw.cells.stock);
    if (parsed.ok) counted = parsed.value;
    else add('stock', parsed.code);
  }
  let expected: string | undefined;
  if (raw.cells.current_stock !== undefined && !raw.tooLong.includes('current_stock')) {
    const parsed = parseQtyText(raw.cells.current_stock);
    if (parsed.ok) expected = parsed.value;
    else add('current_stock', parsed.code);
  }

  const current = variantId === undefined ? undefined : counts.get(variantId);
  const currentOnHand = current?.onHand ?? null;
  if (issues.length > 0 || variantId === undefined || counted === undefined) {
    return errorOutcome(raw, sku, issues, currentOnHand);
  }
  const onHand = fromDecimalString(currentOnHand ?? '0');
  // S2 = B: şablon indikten sonra stok değiştiyse satır uygulanmaz (yeni şablon indirilir).
  if (expected !== undefined && compare(fromDecimalString(expected), onHand) !== 0) {
    return errorOutcome(
      raw,
      sku,
      [{ column: 'current_stock', code: 'stock_changed' }],
      currentOnHand,
    );
  }
  // K6: sayılan rezerveden az olamaz (elle sayımdaki STOCK_INSUFFICIENT).
  if (compare(fromDecimalString(counted), fromDecimalString(current?.reserved ?? '0')) < 0) {
    return errorOutcome(raw, sku, [{ column: 'stock', code: 'below_reserved' }], currentOnHand);
  }
  const base = {
    row: raw.row,
    sku,
    variantId,
    counted,
    currentOnHand,
    ...(expected === undefined ? {} : { expected }),
  };
  if (current === undefined) return { ...base, action: 'insert', issues };
  if (compare(fromDecimalString(counted), onHand) === 0) {
    return { ...base, action: 'unchanged', issues: [{ column: 'stock', code: 'stock_unchanged' }] };
  }
  return { ...base, action: 'update', issues };
}

/** Ürün SKU'su ile tek varyantının SKU'su aynı varyantı gösterebilir: hepsi `duplicate_in_file`. */
function sameVariantAsErrors(outcomes: readonly StockOutcome[]): StockOutcome[] {
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    if (outcome.variantId !== undefined && outcome.action !== 'error') {
      counts.set(outcome.variantId, (counts.get(outcome.variantId) ?? 0) + 1);
    }
  }
  return outcomes.map((outcome) =>
    outcome.variantId !== undefined &&
    outcome.action !== 'error' &&
    (counts.get(outcome.variantId) ?? 0) > 1
      ? errorOutcome(
          outcome,
          outcome.sku,
          [{ column: 'sku', code: 'duplicate_in_file' }],
          outcome.currentOnHand,
        )
      : outcome,
  );
}

export function validateStockRows(
  rows: readonly RawImportRow[],
  context: {
    readonly matches: ImportSkuMatches;
    readonly counts: ReadonlyMap<string, StockCounts>;
  },
): StockValidation {
  const considered = stockRows(rows);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of considered) {
    const key = row.cells.sku?.toLowerCase();
    if (key === undefined) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  const outcomes = sameVariantAsErrors(
    considered.map((row) => validateRow(row, context.matches, context.counts, duplicates)),
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
