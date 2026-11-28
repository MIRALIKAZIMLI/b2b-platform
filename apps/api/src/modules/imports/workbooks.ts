// Şablon ve rapor .xlsx üreticileri (F3.5a; US-031 AC1, AC2; kart K13, K20). Metinler çeviri
// anahtarından gelir (`imports.*`, i18n/seed/import-messages.ts); kod içinde arayüz metni yok.
import {
  CUSTOMER_PRICE_TEMPLATE_COLUMNS,
  type ImportRowIssue,
  STOCK_TEMPLATE_COLUMNS,
  PRODUCT_IMPORT_COLUMNS,
  type ProductImportColumn,
} from '@b2b/shared';
import ExcelJS from 'exceljs';
import type { ImportCategoryRef, ImportUnitRef } from '../catalog';
import type { CustomerPriceOutcome } from './customer-price-rows';
import type { RowOutcome } from './row-validator';
import type { StockOutcome } from './stock-rows';
import type { StockTemplateRow } from '../inventory';
import { compare, fromDecimalString, subtract, toDecimalString } from '../../core/money';

/** Çeviri: anahtar → metin (yoksa anahtarın kendisi). */
export type Translate = (key: string) => string;

/** Kullanıcının dilindeki ad; yoksa az → ilk dolu dil. */
function localized(name: Record<string, string>, lang: string): string {
  return name[lang] ?? name.az ?? Object.values(name)[0] ?? '';
}

/** Excel sayfa adı: en çok 31 karakter, `[]:*?/\` yok. */
function sheetName(text: string): string {
  return text.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
}

/** Metin olarak tutulacak sütunlar (baştaki sıfır ve uzun barkod bozulmasın). */
const TEXT_COLUMNS: ReadonlySet<ProductImportColumn> = new Set(['sku', 'barcode']);
/** Sütunların "yalnız yeni üründe" zorunlu olanları (K3). */
const REQUIRED_FOR_NEW: ReadonlySet<ProductImportColumn> = new Set(['category', 'unit', 'name_az']);

/** Görünür kategorilerin tam yolu ("Üst / Alt"), dile göre sıralı. */
function categoryRows(
  categories: readonly ImportCategoryRef[],
  lang: string,
): { name: string; path: string }[] {
  const byId = new Map(categories.map((row) => [row.id, row]));
  const rows: { name: string; path: string }[] = [];
  for (const category of categories) {
    const parts: string[] = [];
    let current: ImportCategoryRef | undefined = category;
    let visible = true;
    for (let depth = 0; current !== undefined && depth < 5; depth++) {
      if (!current.isActive) visible = false;
      parts.unshift(localized(current.name, lang));
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    if (visible) rows.push({ name: localized(category.name, lang), path: parts.join(' / ') });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, lang));
}

export async function buildProductTemplate(input: {
  readonly lang: string;
  readonly t: Translate;
  readonly categories: readonly ImportCategoryRef[];
  readonly units: readonly ImportUnitRef[];
}): Promise<Buffer> {
  const { t, lang } = input;
  const workbook = new ExcelJS.Workbook();

  // 1. Veri sayfası: okuyucu ilk sayfayı okur (K12); başlık satırı sabit anahtarlar (K20).
  const data = workbook.addWorksheet(sheetName(t('imports.sheet.products')), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  data.columns = PRODUCT_IMPORT_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key.startsWith('name_') ? 32 : 16,
    ...(TEXT_COLUMNS.has(key) ? { style: { numFmt: '@' } } : {}),
  }));
  data.getRow(1).font = { bold: true };
  PRODUCT_IMPORT_COLUMNS.forEach((key, index) => {
    data.getCell(1, index + 1).note = t(`imports.column.${key}`);
  });

  // 2. Açıklama.
  const help = workbook.addWorksheet(sheetName(t('imports.sheet.instructions')));
  help.columns = [{ width: 14 }, { width: 80 }, { width: 18 }];
  help.addRow([t('imports.template.intro')]);
  help.mergeCells(1, 1, 1, 3);
  help.getRow(1).alignment = { wrapText: true };
  help.getRow(1).height = 48;
  help.addRow([]);
  const head = help.addRow([
    t('imports.template.column'),
    t('imports.template.description'),
    t('imports.template.required'),
  ]);
  head.font = { bold: true };
  for (const key of PRODUCT_IMPORT_COLUMNS) {
    const requirement =
      key === 'sku'
        ? t('imports.template.required_always')
        : REQUIRED_FOR_NEW.has(key)
          ? t('imports.template.required_new')
          : t('imports.template.optional');
    help.addRow([key, t(`imports.column.${key}`), requirement]);
  }

  // 3. Kategoriler.
  const categorySheet = workbook.addWorksheet(sheetName(t('imports.sheet.categories')));
  categorySheet.columns = [
    { header: t('imports.template.category_name'), width: 36 },
    { header: t('imports.template.category_path'), width: 64 },
  ];
  categorySheet.getRow(1).font = { bold: true };
  for (const row of categoryRows(input.categories, lang))
    categorySheet.addRow([row.name, row.path]);

  // 4. Birimler (yalnız aktif).
  const unitSheet = workbook.addWorksheet(sheetName(t('imports.sheet.units')));
  unitSheet.columns = [
    { header: t('imports.template.unit_code'), width: 10 },
    { header: t('imports.template.unit_name'), width: 28 },
    { header: t('imports.template.unit_abbreviation'), width: 16 },
  ];
  unitSheet.getRow(1).font = { bold: true };
  for (const unit of input.units.filter((row) => row.isActive)) {
    unitSheet.addRow([unit.code, localized(unit.name, lang), localized(unit.abbreviation, lang)]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Hata raporu (K13): yalnız bu dosyanın sorunlu satırları; satır no, SKU, sütun, tür, açıklama.
 * Başka kiracının verisi girmez (satırlar yalnız yüklenen dosyadan ve kodlardan oluşur).
 */
export async function buildProblemReport(input: {
  readonly t: Translate;
  readonly outcomes: readonly RowOutcome[];
  readonly notes: readonly string[];
}): Promise<Buffer> {
  const { t } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName(t('imports.sheet.report')), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: t('imports.report.row'), width: 8 },
    { header: t('imports.report.sku'), width: 20, style: { numFmt: '@' } },
    { header: t('imports.report.column'), width: 14 },
    { header: t('imports.report.kind'), width: 16 },
    { header: t('imports.report.problem'), width: 64 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const note of input.notes) sheet.addRow(['', '', '', '', t(`imports.note.${note}`)]);
  for (const outcome of input.outcomes) {
    for (const issue of outcome.issues) {
      const isWarning = issue.code === 'price_ignored_no_permission';
      sheet.addRow([
        outcome.row,
        // Formül enjeksiyonu: kullanıcının metni Excel'de formül gibi çalışmasın.
        safeText(outcome.sku ?? ''),
        issue.column,
        t(isWarning ? 'imports.report.warning' : 'imports.report.error'),
        t(`imports.row.${issue.code}`),
      ]);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Sonuç raporunun bir satırı (F3.5c, US-031 AC3). */
export interface RowResult {
  readonly row: number;
  readonly sku: string | null;
  /** F3.7a: `unchanged` = müşteri fiyatı aynıydı, yazılmadı. */
  readonly result: 'insert' | 'update' | 'unchanged' | 'error';
  readonly issues: readonly ImportRowIssue[];
}

/**
 * Sonuç raporu (F3.5c, US-031 AC3; kart K13): dosyanın her satırı; eklendi / güncellendi /
 * uygulanmadı ve nedenler (uyarılar dahil). Yalnız bu dosyanın satırları ve kodlar girer.
 */
export async function buildResultReport(input: {
  readonly t: Translate;
  readonly results: readonly RowResult[];
  readonly notes: readonly string[];
  /** F3.11c: sonuç metni anahtar öneki (stokta `imports.stock_action`). */
  readonly resultPrefix?: string;
}): Promise<Buffer> {
  const { t } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName(t('imports.sheet.result')), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: t('imports.report.row'), width: 8 },
    { header: t('imports.report.sku'), width: 20, style: { numFmt: '@' } },
    { header: t('imports.report.result'), width: 16 },
    { header: t('imports.report.problem'), width: 80 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const note of input.notes) sheet.addRow(['', '', '', t(`imports.note.${note}`)]);
  for (const result of input.results) {
    sheet.addRow([
      result.row,
      safeText(result.sku ?? ''),
      t(`${input.resultPrefix ?? 'imports.result'}.${result.result}`),
      result.issues.map((issue) => `${issue.column}: ${t(`imports.row.${issue.code}`)}`).join('; '),
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Müşteri fiyatı şablonunun bir satırı (F3.7a K9). */
export interface CustomerPriceTemplateRow {
  readonly sku: string;
  readonly productName: Record<string, string>;
  /** Perakendecinin bugünkü fiyatı (noktalı ondalık metin); yoksa null. */
  readonly currentPrice: string | null;
}

/**
 * Müşteri fiyatı şablonu (F3.7a, S2 = A): bir müşteri için; satıcının varyantları SKU, ad ve bugünkü
 * fiyatla dolu, `price` boş. Okuyucu yalnız `sku` ve `price`'ı okur. Fiyatlar metin hücresi (Excel'in
 * kayan nokta yuvarlaması olmasın; okuyucu ondalık virgülü de kabul eder).
 */
export async function buildCustomerPriceTemplate(input: {
  readonly lang: string;
  readonly t: Translate;
  readonly rows: readonly CustomerPriceTemplateRow[];
}): Promise<Buffer> {
  const { t, lang } = input;
  const workbook = new ExcelJS.Workbook();
  const data = workbook.addWorksheet(sheetName(t('imports.sheet.customer_prices')), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  data.columns = CUSTOMER_PRICE_TEMPLATE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === 'name' ? 40 : 16,
    ...(key === 'sku' || key === 'current_price' || key === 'price'
      ? { style: { numFmt: '@' } }
      : {}),
  }));
  data.getRow(1).font = { bold: true };
  const notes: Record<(typeof CUSTOMER_PRICE_TEMPLATE_COLUMNS)[number], string> = {
    sku: 'imports.column.sku',
    name: 'imports.column.name',
    current_price: 'imports.column.current_price',
    price: 'imports.column.customer_price',
  };
  CUSTOMER_PRICE_TEMPLATE_COLUMNS.forEach((key, index) => {
    data.getCell(1, index + 1).note = t(notes[key]);
  });
  for (const row of input.rows) {
    data.addRow({
      sku: safeText(row.sku),
      name: safeText(localized(row.productName, lang)),
      current_price: row.currentPrice ?? '',
      price: '',
    });
  }

  const help = workbook.addWorksheet(sheetName(t('imports.sheet.instructions')));
  help.columns = [{ width: 16 }, { width: 80 }];
  help.addRow([t('imports.template.customer_prices_intro')]);
  help.mergeCells(1, 1, 1, 2);
  help.getRow(1).alignment = { wrapText: true };
  help.getRow(1).height = 48;
  help.addRow([]);
  const head = help.addRow([t('imports.template.column'), t('imports.template.description')]);
  head.font = { bold: true };
  for (const key of CUSTOMER_PRICE_TEMPLATE_COLUMNS) help.addRow([key, t(notes[key])]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Müşteri fiyatı önizleme (fark) raporu (F3.7a, US-035 AC2): fiyatı dolu her satır; şu anki fiyat,
 * yeni fiyat, eylem ve sorunlar. Yalnız bu dosyanın satırları ve bu satıcının kendi fiyatları girer.
 */
export async function buildCustomerPriceReport(input: {
  readonly t: Translate;
  readonly outcomes: readonly CustomerPriceOutcome[];
  /** Dosyadaki ham fiyat metni (hatalı satırda da gösterilir), satır no → metin. */
  readonly rawPrices: ReadonlyMap<number, string>;
}): Promise<Buffer> {
  const { t } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName(t('imports.sheet.report')), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: t('imports.report.row'), width: 8 },
    { header: t('imports.report.sku'), width: 20, style: { numFmt: '@' } },
    { header: t('imports.report.current_price'), width: 16, style: { numFmt: '@' } },
    { header: t('imports.report.new_price'), width: 16, style: { numFmt: '@' } },
    { header: t('imports.report.action'), width: 18 },
    { header: t('imports.report.problem'), width: 64 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const outcome of input.outcomes) {
    sheet.addRow([
      outcome.row,
      safeText(outcome.sku ?? ''),
      outcome.currentPrice ?? '',
      safeText(outcome.price ?? input.rawPrices.get(outcome.row) ?? ''),
      t(`imports.action.${outcome.action}`),
      outcome.issues
        .map((issue) => `${issue.column}: ${t(`imports.row.${issue.code}`)}`)
        .join('; '),
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Varyant adı: ürün adı + özellik değerleri (aynı ürünün varyantları ayırt edilsin). */
function variantName(row: StockTemplateRow, lang: string): string {
  const values = Object.values(row.attributes).filter(
    (value): value is string | number => typeof value === 'string' || typeof value === 'number',
  );
  const name = localized(row.productName, lang);
  return values.length === 0 ? name : `${name} (${values.join(', ')})`;
}

/**
 * Stok sayımı şablonu (F3.11c, S3 = A): bir depo için; depodaki satılabilir varyantlar SKU, ad,
 * temel birim ve bugünkü miktarla (`current_stock`) dolu, `stock` boş. Okuyucu `sku`, `stock` ve
 * `current_stock`'u okur (S2 = B). Miktarlar metin hücresi (kayan nokta yuvarlaması olmasın).
 */
export async function buildStockTemplate(input: {
  readonly lang: string;
  readonly t: Translate;
  readonly rows: readonly StockTemplateRow[];
}): Promise<Buffer> {
  const { t, lang } = input;
  const workbook = new ExcelJS.Workbook();
  const data = workbook.addWorksheet(sheetName(t('imports.sheet.stock')), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  data.columns = STOCK_TEMPLATE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === 'name' ? 40 : 16,
    ...(key === 'name' || key === 'base_unit' ? {} : { style: { numFmt: '@' } }),
  }));
  data.getRow(1).font = { bold: true };
  const notes: Record<(typeof STOCK_TEMPLATE_COLUMNS)[number], string> = {
    sku: 'imports.column.sku',
    name: 'imports.column.name',
    base_unit: 'imports.column.base_unit',
    current_stock: 'imports.column.current_stock',
    stock: 'imports.column.counted_stock',
  };
  STOCK_TEMPLATE_COLUMNS.forEach((key, index) => {
    data.getCell(1, index + 1).note = t(notes[key]);
  });
  for (const row of input.rows) {
    data.addRow({
      sku: safeText(row.sku),
      name: safeText(variantName(row, lang)),
      base_unit: row.baseUnitCode,
      // Sayılmamış varyant boş değil 0: S2 = B karşılaştırması sayılmamışı 0 sayar.
      current_stock: qtyText(row.onHand ?? '0'),
      stock: '',
    });
  }

  const help = workbook.addWorksheet(sheetName(t('imports.sheet.instructions')));
  help.columns = [{ width: 16 }, { width: 80 }];
  help.addRow([t('imports.template.stock_intro')]);
  help.mergeCells(1, 1, 1, 2);
  help.getRow(1).alignment = { wrapText: true };
  help.getRow(1).height = 64;
  help.addRow([]);
  const head = help.addRow([t('imports.template.column'), t('imports.template.description')]);
  head.font = { bold: true };
  for (const key of STOCK_TEMPLATE_COLUMNS) help.addRow([key, t(notes[key])]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** `numeric(14,3)` metni sondaki sıfırlar atılmış ("12.500" → "12.5", "3.000" → "3"). */
export function qtyText(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

/**
 * Stok sayımı önizleme raporu (F3.11c, K7): sayılanı dolu her satır; sistemdeki miktar, sayılan,
 * fark, eylem ve sorunlar. Yalnız bu dosyanın satırları ve bu satıcının kendi deposu girer.
 */
export async function buildStockReport(input: {
  readonly t: Translate;
  readonly outcomes: readonly StockOutcome[];
  readonly rawCounts: ReadonlyMap<number, string>;
}): Promise<Buffer> {
  const { t } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName(t('imports.sheet.report')), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: t('imports.report.row'), width: 8 },
    { header: t('imports.report.sku'), width: 20, style: { numFmt: '@' } },
    { header: t('imports.report.system_qty'), width: 16, style: { numFmt: '@' } },
    { header: t('imports.report.counted_qty'), width: 16, style: { numFmt: '@' } },
    { header: t('imports.report.difference'), width: 14, style: { numFmt: '@' } },
    { header: t('imports.report.action'), width: 18 },
    { header: t('imports.report.problem'), width: 64 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const outcome of input.outcomes) {
    let difference = '';
    if (outcome.counted !== undefined && outcome.action !== 'error') {
      const delta = subtract(
        fromDecimalString(outcome.counted),
        fromDecimalString(outcome.currentOnHand ?? '0'),
      );
      const text = qtyText(toDecimalString(delta, 4));
      difference = compare(delta, fromDecimalString('0')) > 0 ? `+${text}` : text;
    }
    sheet.addRow([
      outcome.row,
      safeText(outcome.sku ?? ''),
      outcome.currentOnHand === null ? '' : qtyText(outcome.currentOnHand),
      safeText(outcome.counted ?? input.rawCounts.get(outcome.row) ?? ''),
      difference,
      t(`imports.stock_action.${outcome.action}`),
      outcome.issues
        .map((issue) => `${issue.column}: ${t(`imports.row.${issue.code}`)}`)
        .join('; '),
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** `=`, `+`, `-`, `@` ile başlayan metnin önüne `'` (CSV/Excel formül enjeksiyonu). */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
