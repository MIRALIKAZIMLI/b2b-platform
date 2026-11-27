// Ürün satırı doğrulayıcı (F3.5a; US-031 AC2, AC4; kart K2–K10). Saf fonksiyon: veritabanı
// okumaları (kategori, marka, birim, SKU eşleşmeleri, varsayılan fiyat listesi) çağırandan gelir.
// Para `number`'a çevrilmez: fiyat metin olarak biçim denetiminden geçer (uygulama F3.5c'de
// `decimal.js` ile yazar). F3.5c: hatasız satır, uygulamanın yazacağı çözülmüş değerleri
// (`write`) taşır; uygulama satırı yeniden yorumlamaz.
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

/** Uygulamanın hedefi (F3.5c): yeni ürün veya eşleşen varyant. */
export type RowTarget =
  | { readonly kind: 'insert' }
  | { readonly kind: 'update'; readonly productId: string; readonly variantId: string };

/** Hatasız satırın yazılacak değerleri (boş hücre = değiştirme, K3). */
export interface RowWrite {
  readonly target: RowTarget;
  readonly sku: string;
  readonly names: Partial<Record<'az' | 'ru' | 'tr', string>>;
  readonly categoryId?: string;
  readonly brandId?: string;
  /** Yalnız yeni üründe (temel birim içe aktarmayla değişmez). */
  readonly baseUnitCode?: string;
  readonly gtin?: string;
  /** Noktalı ondalık metin (`numeric(14,3)`). */
  readonly caseQty?: string;
  /** Noktalı ondalık metin; yalnız fiyat yazılabilecekse (izin + varsayılan liste). */
  readonly price?: string;
}

export interface RowOutcome {
  readonly row: number;
  readonly sku: string | null;
  readonly action: RowAction;
  /** Hatalar ve uyarılar; `action: 'error'` ise en az bir hata vardır. */
  readonly issues: ImportRowIssue[];
  /** `action !== 'error'` ise dolu. */
  readonly write?: RowWrite;
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

interface CategoryMatch {
  readonly visible: Set<string>;
  readonly hidden: Set<string>;
}

interface Indexes {
  readonly categoriesByName: Map<string, CategoryMatch>;
  /** "Üst / Alt" tam yolu (şablondaki "Kateqoriyalar" sayfası; Müfettiş 29 not 8). */
  readonly categoriesByPath: Map<string, CategoryMatch>;
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

/** Yol anahtarı: "/" ile ayrılmış parçalar ayrı ayrı `nameKey`. */
export function pathKey(value: string): string {
  return value
    .split('/')
    .map((part) => nameKey(part))
    .join('/');
}

function addCategory(
  map: Map<string, CategoryMatch>,
  key: string,
  id: string,
  isVisible: boolean,
): void {
  const entry = map.get(key) ?? { visible: new Set<string>(), hidden: new Set<string>() };
  (isVisible ? entry.visible : entry.hidden).add(id);
  map.set(key, entry);
}

/** Kategorinin her dildeki tam yolu (üst zincir aynı dilde; eksik dil az'a düşer). */
function categoryPaths(
  category: ImportCategoryRef,
  byId: Map<string, ImportCategoryRef>,
): string[] {
  const paths: string[] = [];
  for (const lang of Object.keys(category.name)) {
    const parts: string[] = [];
    let current: ImportCategoryRef | undefined = category;
    for (let depth = 0; current !== undefined && depth < 5; depth++) {
      const text = current.name[lang] ?? current.name.az ?? '';
      if (text.trim() === '') break;
      parts.unshift(text);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    if (current === undefined && parts.length > 1) paths.push(parts.join('/'));
  }
  return paths;
}

function buildIndexes(context: ValidationContext): Indexes {
  const visible = visibleCategoryIds(context.categories);
  const byId = new Map(context.categories.map((row) => [row.id, row]));
  const categoriesByName = new Map<string, CategoryMatch>();
  const categoriesByPath = new Map<string, CategoryMatch>();
  for (const category of context.categories) {
    const isVisible = visible.has(category.id);
    for (const text of Object.values(category.name)) {
      if (typeof text !== 'string' || text.trim() === '') continue;
      addCategory(categoriesByName, nameKey(text), category.id, isVisible);
    }
    for (const path of categoryPaths(category, byId)) {
      addCategory(categoriesByPath, pathKey(path), category.id, isVisible);
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
  return { categoriesByName, categoriesByPath, brandsByName, unitsByCode, unitsByName };
}

/** Dosyada birden çok geçen SKU anahtarları (harf duyarsız, kullanıcı kararı A). */
export function duplicateSkus(rows: readonly RawImportRow[]): Set<string> {
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

export type Target =
  | { readonly kind: 'insert' }
  | {
      readonly kind: 'update';
      readonly productId: string;
      readonly variantId: string;
      readonly baseUnitCode: string;
      readonly unitPackagingId: string | null;
    }
  | { readonly kind: 'error'; readonly code: ImportRowErrorCode };

/**
 * Kart K2: önce varyant SKU'su, sonra tek aktif varyantlı ürünün SKU'su; yoksa yeni ürün.
 * Eşleşme haritası ham SKU ile anahtarlı (harf duyarsızlık SQL `lower()` ile, F3.5c K7).
 */
export function resolveTarget(sku: string, matches: ImportSkuMatches): Target {
  const variant = matches.variants.get(sku);
  if (variant !== undefined) {
    if (variant.variantStatus === 'archived' || variant.productStatus === 'archived') {
      return { kind: 'error', code: 'archived' };
    }
    return {
      kind: 'update',
      productId: variant.productId,
      variantId: variant.variantId,
      baseUnitCode: variant.baseUnitCode,
      unitPackagingId: variant.unitPackagingId,
    };
  }
  const product = matches.products.get(sku);
  if (product !== undefined) {
    if (product.status === 'archived') return { kind: 'error', code: 'archived' };
    if (product.activeVariantCount !== 1 || product.activeVariantId === null) {
      return { kind: 'error', code: 'variant_ambiguous' };
    }
    return {
      kind: 'update',
      productId: product.productId,
      variantId: product.activeVariantId,
      baseUnitCode: product.baseUnitCode,
      unitPackagingId: product.unitPackagingId,
    };
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

/** Kategori adı veya "Üst / Alt" yolu (K8); bulunan görünür kategori kimliği. */
function checkCategory(
  text: string | undefined,
  target: Target,
  indexes: Indexes,
  issues: Issues,
): string | undefined {
  if (text === undefined) {
    if (target.kind === 'insert') issues.add('category', 'required');
    return undefined;
  }
  const entry =
    (text.includes('/') ? indexes.categoriesByPath.get(pathKey(text)) : undefined) ??
    indexes.categoriesByName.get(nameKey(text));
  if (entry === undefined) issues.add('category', 'not_found');
  else if (entry.visible.size > 1) issues.add('category', 'ambiguous');
  else if (entry.visible.size === 0) issues.add('category', 'inactive');
  else return [...entry.visible][0];
  return undefined;
}

function checkCaseQty(
  text: string,
  unit: ImportUnitRef | undefined,
  issues: Issues,
): string | undefined {
  const value = decimalText(text);
  if (!QUANTITY_TEXT.test(value)) {
    issues.add('case_qty', value.startsWith('-') ? 'not_positive' : 'invalid');
    return undefined;
  }
  const [whole = '0', fraction = ''] = value.split('.');
  const isInteger = /^0*$/.test(fraction);
  if (unit !== undefined && !unit.allowsDecimal && !isInteger) {
    issues.add('case_qty', 'not_integer');
    return undefined;
  }
  // Koli en az iki temel birim içerir (> 1); "1" veya "1.000" ambalaj seviyesi değildir.
  const wholeNumber = BigInt(whole);
  if (wholeNumber < 1n || (wholeNumber === 1n && isInteger)) {
    issues.add('case_qty', /[1-9]/.test(value) ? 'must_exceed_one' : 'not_positive');
    return undefined;
  }
  return value;
}

/**
 * Fiyat hücresinin biçim denetimi (F3.5a; F3.7a müşteri fiyatı da kullanır): noktalı ondalık metin
 * veya hata kodu. Ondalık virgül kabul edilir; para `number`'a çevrilmez.
 */
export function parsePriceText(
  text: string,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly code: ImportRowErrorCode } {
  const value = decimalText(text);
  if (value.startsWith('-')) return { ok: false, code: 'negative' };
  if (!PRICE_TEXT.test(value)) return { ok: false, code: 'invalid' };
  const fraction = value.split('.')[1] ?? '';
  if (fraction.replace(/0+$/, '').length > PRICE_SCALE) {
    return { ok: false, code: 'too_many_decimals' };
  }
  return { ok: true, value };
}

/** Yazılacak fiyat metni; yok sayılan (izinsiz) veya hatalı fiyatta `undefined`. */
function checkPrice(
  text: string,
  target: Target,
  context: ValidationContext,
  issues: Issues,
): string | undefined {
  const parsed = parsePriceText(text);
  if (!parsed.ok) {
    issues.add('price', parsed.code);
    return undefined;
  }
  const value = parsed.value;
  // Mimar S2: fiyat yazma yetkisi yoksa fiyat yok sayılır, satır uygulanır.
  if (!context.canWritePrices) {
    issues.add('price', 'price_ignored_no_permission');
    return undefined;
  }
  if (context.defaultPriceListId === null) {
    issues.add('price', 'no_default_price_list');
    return undefined;
  }
  // Mimar S3: fiyat yalnız `unit` ambalajına; yeni üründe uygulama `unit` ambalajını açar.
  if (target.kind === 'update' && target.unitPackagingId === null) {
    issues.add('price', 'no_unit_packaging');
    return undefined;
  }
  return value;
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
      target = resolveTarget(sku, context.matches);
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

  const categoryId = issues.has('category')
    ? undefined
    : checkCategory(cells.category, target, indexes, issues);
  const brand = cells.brand;
  const brandId =
    brand === undefined || issues.has('brand')
      ? undefined
      : indexes.brandsByName.get(nameKey(brand));
  if (brand !== undefined && !issues.has('brand') && brandId === undefined) {
    issues.add('brand', 'not_found');
  }
  const unit = issues.has('unit') ? undefined : checkUnit(cells.unit, target, indexes, issues);
  const barcode = cells.barcode;
  if (barcode !== undefined && !issues.has('barcode') && !isValidGtin(barcode)) {
    issues.add('barcode', 'invalid_gtin');
  }
  const caseQty =
    cells.case_qty === undefined || issues.has('case_qty')
      ? undefined
      : checkCaseQty(cells.case_qty, unit, issues);
  const price =
    cells.price === undefined || issues.has('price')
      ? undefined
      : checkPrice(cells.price, target, context, issues);

  if (issues.hasErrors || sku === null || target.kind === 'error') {
    return { row: raw.row, sku, action: 'error', issues: issues.list };
  }
  const nameEntries: [string, string][] = [];
  for (const column of names) nameEntries.push([column.slice(5), cells[column] ?? '']);
  const write: RowWrite = {
    target:
      target.kind === 'update'
        ? { kind: 'update', productId: target.productId, variantId: target.variantId }
        : { kind: 'insert' },
    sku,
    names: Object.fromEntries(nameEntries),
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(brandId === undefined ? {} : { brandId }),
    ...(target.kind === 'insert' && unit !== undefined ? { baseUnitCode: unit.code } : {}),
    ...(barcode === undefined ? {} : { gtin: barcode }),
    ...(caseQty === undefined ? {} : { caseQty }),
    ...(price === undefined ? {} : { price }),
  };
  return {
    row: raw.row,
    sku,
    action: target.kind === 'update' ? 'update' : 'insert',
    issues: issues.list,
    write,
  };
}

/**
 * Müfettiş 29 D2: farklı SKU metinleri (varyant SKU'su ve tek varyantlı ürünün SKU'su) aynı
 * varyantı gösterebilir; böyle satırların hepsi `sku: duplicate_in_file` olur (aynı SKU'nun iki
 * kez geçmesiyle aynı kural; hangi satırın kazanacağı belirsiz kalmaz).
 */
function sameTargetAsErrors(outcomes: readonly RowOutcome[]): RowOutcome[] {
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    const target = outcome.write?.target;
    if (target?.kind === 'update') {
      counts.set(target.variantId, (counts.get(target.variantId) ?? 0) + 1);
    }
  }
  return outcomes.map((outcome) => {
    const target = outcome.write?.target;
    if (target?.kind !== 'update' || (counts.get(target.variantId) ?? 0) < 2) return outcome;
    return {
      row: outcome.row,
      sku: outcome.sku,
      action: 'error',
      issues: [...outcome.issues, { column: 'sku', code: 'duplicate_in_file' }],
    };
  });
}

/** Bütün satırlar; sayılar ve iş notları (V3: stok sütunu henüz uygulanmıyor). */
export function validateRows(
  rows: readonly RawImportRow[],
  context: ValidationContext,
): ValidationResult {
  const indexes = buildIndexes(context);
  const duplicates = duplicateSkus(rows);
  const outcomes = sameTargetAsErrors(
    rows.map((row) => validateRow(row, context, indexes, duplicates)),
  );
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
