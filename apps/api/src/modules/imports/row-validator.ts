// Ürün satırı doğrulayıcı (F3.5a; US-031 AC2, AC4; kart K2–K10). Saf fonksiyon: veritabanı
// okumaları (kategori, marka, birim, SKU eşleşmeleri, varsayılan fiyat listesi) çağırandan gelir.
// Para `number`'a çevrilmez: fiyat metin olarak biçim denetiminden geçer (uygulama F3.5c'de
// `decimal.js` ile yazar).
import {
  type ImportJobStats,
  type ImportNote,
  type ImportRowErrorCode,
  type ImportRowIssue,
  type ImportRowWarningCode,
  isValidGtin,
  PRODUCT_NAME_MAX,
  type ProductImportColumn,
  skuSchema,
} from '@b2b/shared';
import type {
  ImportBrandRef,
  ImportCategoryRef,
  ImportSkuMatches,
  ImportUnitRef,
} from '../catalog';
import type { RawImportRow } from './xlsx-reader';

export type RowAction = 'insert' | 'update' | 'error';

export interface RowOutcome {
  readonly row: number;
  readonly sku: string | null;
  readonly action: RowAction;
  /** Hatalar ve uyarılar; `action: 'error'` ise en az bir hata vardır. */
  readonly issues: ImportRowIssue[];
}

export interface ValidationContext {
  readonly categories: readonly ImportCategoryRef[];
  readonly brands: readonly ImportBrandRef[];
  readonly units: readonly ImportUnitRef[];
  readonly matches: ImportSkuMatches;
  readonly defaultPriceListId: string | null;
  readonly canWritePrices: boolean;
}

export interface ValidationResult {
  readonly outcomes: RowOutcome[];
  readonly stats: ImportJobStats;
  readonly notes: ImportNote[];
}

const NAME_COLUMNS = ['name_az', 'name_ru', 'name_tr'] as const;
const WARNING_CODES: ReadonlySet<string> = new Set<ImportRowWarningCode>([
  'price_ignored_no_permission',
]);
/** `numeric(14,3)` miktar: en çok 11 tam, 3 ondalık hane. */
const QUANTITY_TEXT = /^\d{1,11}(\.\d{1,3})?$/;
/** `numeric(14,4)` birim fiyat: en çok 10 tam hane; ondalık hane sayısı ayrıca denetlenir. */
const PRICE_TEXT = /^\d{1,10}(\.\d+)?$/;
const PRICE_SCALE = 4;

/**
 * Ad eşleştirme anahtarı: kırpılmış, küçük harf, NFC. Azerbaycan/Türk alfabesinde "İ" küçülünce
 * "i̇" (i + U+0307) olur ve "I" dile göre "ı" veya "i" yazılır; eşleşme için üçü de "i" sayılır.
 */
export function nameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .normalize('NFC');
}

/** Excel'de ondalık virgülle yazılmış sayı ("12,50") noktaya çevrilir. */
function decimalText(value: string): string {
  const compact = value.replace(/\s+/g, '');
  return /^-?\d+,\d+$/.test(compact) ? compact.replace(',', '.') : compact;
}

class Issues {
  readonly list: ImportRowIssue[] = [];

  add(column: ProductImportColumn, code: ImportRowErrorCode | ImportRowWarningCode): void {
    if (!this.list.some((issue) => issue.column === column && issue.code === code)) {
      this.list.push({ column, code });
    }
  }

  has(column: ProductImportColumn): boolean {
    return this.list.some((issue) => issue.column === column);
  }

  get hasErrors(): boolean {
    return this.list.some((issue) => !WARNING_CODES.has(issue.code));
  }
}

interface Indexes {
  readonly categoriesByName: Map<string, { visible: Set<string>; hidden: Set<string> }>;
  readonly brandsByName: Map<string, string>;
  readonly unitsByCode: Map<string, ImportUnitRef>;
  readonly unitsByName: Map<string, Set<string>>;
}

function visibleCategoryIds(rows: readonly ImportCategoryRef[]): Set<string> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visible = new Set<string>();
  for (const row of rows) {
    let current: ImportCategoryRef | undefined = row;
    let ok = true;
    for (let depth = 0; current !== undefined && depth < 5; depth++) {
      if (!current.isActive) {
        ok = false;
        break;
      }
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    if (ok) visible.add(row.id);
  }
  return visible;
}

function buildIndexes(context: ValidationContext): Indexes {
  const visible = visibleCategoryIds(context.categories);
  const categoriesByName = new Map<string, { visible: Set<string>; hidden: Set<string> }>();
  for (const category of context.categories) {
    for (const text of Object.values(category.name)) {
      if (typeof text !== 'string' || text.trim() === '') continue;
      const key = nameKey(text);
      const entry = categoriesByName.get(key) ?? { visible: new Set(), hidden: new Set() };
      (visible.has(category.id) ? entry.visible : entry.hidden).add(category.id);
      categoriesByName.set(key, entry);
    }
  }
  const brandsByName = new Map(context.brands.map((brand) => [nameKey(brand.name), brand.id]));
  const unitsByCode = new Map(context.units.map((unit) => [unit.code, unit]));
  const unitsByName = new Map<string, Set<string>>();
  for (const unit of context.units) {
    for (const text of [...Object.values(unit.name), ...Object.values(unit.abbreviation)]) {
      if (typeof text !== 'string' || text.trim() === '') continue;
      const key = nameKey(text);
      const codes = unitsByName.get(key) ?? new Set<string>();
      codes.add(unit.code);
      unitsByName.set(key, codes);
    }
  }
  return { categoriesByName, brandsByName, unitsByCode, unitsByName };
}

/** Dosyada birden çok geçen SKU anahtarları (harf duyarsız, kullanıcı kararı A). */
function duplicateSkus(rows: readonly RawImportRow[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const sku = row.cells.sku;
    if (sku === undefined) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return duplicates;
}

type Target =
  | { readonly kind: 'insert' }
  | { readonly kind: 'update'; readonly baseUnitCode: string }
  | { readonly kind: 'error'; readonly code: ImportRowErrorCode };

/** Kart K2: önce varyant SKU'su, sonra tek aktif varyantlı ürünün SKU'su; yoksa yeni ürün. */
function resolveTarget(key: string, matches: ImportSkuMatches): Target {
  const variant = matches.variants.get(key);
  if (variant !== undefined) {
    if (variant.variantStatus === 'archived' || variant.productStatus === 'archived') {
      return { kind: 'error', code: 'archived' };
    }
    return { kind: 'update', baseUnitCode: variant.baseUnitCode };
  }
  const product = matches.products.get(key);
  if (product !== undefined) {
    if (product.status === 'archived') return { kind: 'error', code: 'archived' };
    if (product.activeVariantCount !== 1) return { kind: 'error', code: 'variant_ambiguous' };
    return { kind: 'update', baseUnitCode: product.baseUnitCode };
  }
  return { kind: 'insert' };
}

function checkUnit(
  text: string | undefined,
  target: Target,
  indexes: Indexes,
  issues: Issues,
): ImportUnitRef | undefined {
  const current =
    target.kind === 'update' ? indexes.unitsByCode.get(target.baseUnitCode) : undefined;
  if (text === undefined) {
    if (target.kind === 'insert') issues.add('unit', 'required');
    return current;
  }
  let unit = indexes.unitsByCode.get(text.toUpperCase());
  if (unit === undefined) {
    const codes = indexes.unitsByName.get(nameKey(text));
    if (codes !== undefined && codes.size > 1) {
      issues.add('unit', 'ambiguous');
      return current;
    }
    const code = codes === undefined ? undefined : [...codes][0];
    unit = code === undefined ? undefined : indexes.unitsByCode.get(code);
  }
  if (unit === undefined) {
    issues.add('unit', 'not_found');
    return current;
  }
  if (target.kind === 'update') {
    // Temel birim içe aktarmayla değişmez (ambalaj ve fiyat geçmişi buna bağlı).
    if (unit.code !== target.baseUnitCode) issues.add('unit', 'cannot_change');
    return current;
  }
  if (!unit.isActive) issues.add('unit', 'inactive');
  return unit;
}

function checkCategory(
  text: string | undefined,
  target: Target,
  indexes: Indexes,
  issues: Issues,
): void {
  if (text === undefined) {
    if (target.kind === 'insert') issues.add('category', 'required');
    return;
  }
  const entry = indexes.categoriesByName.get(nameKey(text));
  if (entry === undefined) issues.add('category', 'not_found');
  else if (entry.visible.size > 1) issues.add('category', 'ambiguous');
  else if (entry.visible.size === 0) issues.add('category', 'inactive');
}

function checkCaseQty(text: string, unit: ImportUnitRef | undefined, issues: Issues): void {
  const value = decimalText(text);
  if (!QUANTITY_TEXT.test(value)) {
    issues.add('case_qty', value.startsWith('-') ? 'not_positive' : 'invalid');
    return;
  }
  const [whole = '0', fraction = ''] = value.split('.');
  const isInteger = /^0*$/.test(fraction);
  if (unit !== undefined && !unit.allowsDecimal && !isInteger) {
    issues.add('case_qty', 'not_integer');
    return;
  }
  // Koli en az iki temel birim içerir (> 1); "1" veya "1.000" ambalaj seviyesi değildir.
  const wholeNumber = BigInt(whole);
  if (wholeNumber < 1n || (wholeNumber === 1n && isInteger)) {
    issues.add('case_qty', /[1-9]/.test(value) ? 'must_exceed_one' : 'not_positive');
  }
}

function checkPrice(text: string, context: ValidationContext, issues: Issues): void {
  const value = decimalText(text);
  if (value.startsWith('-')) {
    issues.add('price', 'negative');
    return;
  }
  if (!PRICE_TEXT.test(value)) {
    issues.add('price', 'invalid');
    return;
  }
  const fraction = value.split('.')[1] ?? '';
  if (fraction.replace(/0+$/, '').length > PRICE_SCALE) {
    issues.add('price', 'too_many_decimals');
    return;
  }
  // Mimar S2: fiyat yazma yetkisi yoksa fiyat yok sayılır, satır uygulanır.
  if (!context.canWritePrices) issues.add('price', 'price_ignored_no_permission');
  else if (context.defaultPriceListId === null) issues.add('price', 'no_default_price_list');
}

function validateRow(
  raw: RawImportRow,
  context: ValidationContext,
  indexes: Indexes,
  duplicates: ReadonlySet<string>,
): RowOutcome {
  const issues = new Issues();
  for (const column of raw.tooLong) issues.add(column, 'too_long');
  const cells = raw.cells;
  const sku = cells.sku ?? null;

  let target: Target = { kind: 'insert' };
  if (sku === null) {
    issues.add('sku', 'required');
  } else if (!issues.has('sku')) {
    if (!skuSchema.safeParse(sku).success) {
      issues.add('sku', 'invalid');
    } else if (duplicates.has(sku.toLowerCase())) {
      issues.add('sku', 'duplicate_in_file');
    } else {
      target = resolveTarget(sku.toLowerCase(), context.matches);
      if (target.kind === 'error') issues.add('sku', target.code);
    }
  }

  const names = NAME_COLUMNS.filter((column) => cells[column] !== undefined);
  for (const column of names) {
    if (!issues.has(column) && (cells[column] ?? '').length > PRODUCT_NAME_MAX) {
      issues.add(column, 'too_long');
    }
  }
  if (target.kind === 'insert' && names.length === 0) issues.add('name_az', 'required');

  if (!issues.has('category')) checkCategory(cells.category, target, indexes, issues);
  const brand = cells.brand;
  if (brand !== undefined && !issues.has('brand') && !indexes.brandsByName.has(nameKey(brand))) {
    issues.add('brand', 'not_found');
  }
  const unit = issues.has('unit') ? undefined : checkUnit(cells.unit, target, indexes, issues);
  const barcode = cells.barcode;
  if (barcode !== undefined && !issues.has('barcode') && !isValidGtin(barcode)) {
    issues.add('barcode', 'invalid_gtin');
  }
  if (cells.case_qty !== undefined && !issues.has('case_qty')) {
    checkCaseQty(cells.case_qty, unit, issues);
  }
  if (cells.price !== undefined && !issues.has('price')) checkPrice(cells.price, context, issues);

  const action: RowAction = issues.hasErrors
    ? 'error'
    : target.kind === 'update'
      ? 'update'
      : 'insert';
  return { row: raw.row, sku, action, issues: issues.list };
}

/** Bütün satırlar; sayılar ve iş notları (V3: stok sütunu henüz uygulanmıyor). */
export function validateRows(
  rows: readonly RawImportRow[],
  context: ValidationContext,
): ValidationResult {
  const indexes = buildIndexes(context);
  const duplicates = duplicateSkus(rows);
  const outcomes = rows.map((row) => validateRow(row, context, indexes, duplicates));
  let insert = 0;
  let update = 0;
  let error = 0;
  let warning = 0;
  for (const outcome of outcomes) {
    if (outcome.action === 'insert') insert++;
    else if (outcome.action === 'update') update++;
    else error++;
    if (outcome.action !== 'error' && outcome.issues.length > 0) warning++;
  }
  const notes: ImportNote[] = rows.some((row) => row.cells.stock !== undefined)
    ? ['stock_column_ignored']
    : [];
  return { outcomes, stats: { insert, update, error, warning }, notes };
}
