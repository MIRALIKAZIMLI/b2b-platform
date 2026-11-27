// .xlsx okuyucu (F3.5a, R32, kart K12). Dosya dışarıdan gelir; okuma güvenli ve sınırlıdır:
// - Zip merkezi dizinindeki açılmış boyut toplamı `imports.max_uncompressed_mb` sınırını aşamaz.
// - Yalnız ilk çalışma sayfası okunur; formül hesaplanmaz, dosyadaki önbellek sonucu alınır.
// - Veri satırı `imports.max_rows` sınırını aşınca okuma durur (`IMPORT_TOO_MANY_ROWS`).
// - Hücre metni `imports.cell_max_chars` karakterden uzunsa kesilir ve satır hatası olur (`too_long`).
import { Readable } from 'node:stream';
import {
  CUSTOMER_PRICE_IMPORT_COLUMNS,
  type ImportFailureCode,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_REQUIRED_COLUMNS,
  type ProductImportColumn,
} from '@b2b/shared';
import ExcelJS from 'exceljs';

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_MIN = 22;
const ZIP_COMMENT_MAX = 0xffff;
const ZIP_CENTRAL_HEADER = 46;
const ZIP64_MARK = 0xffffffff;

export interface RawImportRow {
  /** Excel satır numarası (başlık 1). */
  readonly row: number;
  /** Kırpılmış metin; boş hücre yok sayılır. */
  readonly cells: Partial<Record<ProductImportColumn, string>>;
  /** `cellMax`'ı aşan sütunlar. */
  readonly tooLong: ProductImportColumn[];
}

export type ReadResult =
  | { readonly ok: true; readonly rows: RawImportRow[] }
  | { readonly ok: false; readonly failure: ImportFailureCode; readonly reason: string };

/** Okunacak başlıklar: ürün şablonu (varsayılan) veya müşteri fiyatı şablonu (F3.7a). */
export interface ColumnSpec {
  readonly columns: readonly ProductImportColumn[];
  readonly required: readonly ProductImportColumn[];
  /** Bu başlıklardan biri varsa dosya başka türün şablonudur (`wrong_template`, FILE_INVALID). */
  readonly foreign?: readonly string[];
}

export const PRODUCT_COLUMN_SPEC: ColumnSpec = {
  columns: PRODUCT_IMPORT_COLUMNS,
  required: PRODUCT_IMPORT_REQUIRED_COLUMNS,
};

/** F3.7a: yalnız `sku` ve `price` okunur; şablondaki `name`, `current_price` yok sayılır. */
export const CUSTOMER_PRICE_COLUMN_SPEC: ColumnSpec = {
  columns: CUSTOMER_PRICE_IMPORT_COLUMNS,
  required: CUSTOMER_PRICE_IMPORT_COLUMNS,
  // Müfettiş 30 not 3: ürün şablonu da `sku` + `price` taşır; ürün sütunu varsa reddedilir.
  foreign: PRODUCT_IMPORT_COLUMNS.filter(
    (column) => !(CUSTOMER_PRICE_IMPORT_COLUMNS as readonly string[]).includes(column),
  ),
};

export interface ReadLimits {
  readonly maxRows: number;
  readonly maxUncompressedBytes: number;
  /** Hücre metninin üst sınırı (`imports.cell_max_chars`; en uzun alan ad 200). */
  readonly cellMax: number;
}

/**
 * Zip merkezi dizininden açılmış boyut toplamı. Bozuk, zip64 veya sınırı aşan dosya `null`
 * (çağıran `FILE_INVALID` der). Açma kitaplığından önce çalışır (zip bombası, R32).
 */
export function zipUncompressedTotal(body: Buffer, limit: number): number | null {
  if (body.length < ZIP_EOCD_MIN) return null;
  const searchFrom = Math.max(0, body.length - ZIP_EOCD_MIN - ZIP_COMMENT_MAX);
  let eocd = -1;
  for (let i = body.length - ZIP_EOCD_MIN; i >= searchFrom; i--) {
    if (body.readUInt32LE(i) === ZIP_EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = body.readUInt16LE(eocd + 10);
  const directorySize = body.readUInt32LE(eocd + 12);
  const directoryOffset = body.readUInt32LE(eocd + 16);
  if (entries === 0xffff || directoryOffset === ZIP64_MARK) return null;
  if (directoryOffset + directorySize > eocd) return null;

  let offset = directoryOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + ZIP_CENTRAL_HEADER > eocd) return null;
    if (body.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) return null;
    const compressed = body.readUInt32LE(offset + 20);
    const uncompressed = body.readUInt32LE(offset + 24);
    if (compressed === ZIP64_MARK || uncompressed === ZIP64_MARK) return null;
    total += uncompressed;
    if (total > limit) return null;
    offset +=
      ZIP_CENTRAL_HEADER +
      body.readUInt16LE(offset + 28) +
      body.readUInt16LE(offset + 30) +
      body.readUInt16LE(offset + 32);
  }
  return total;
}

/** exceljs hücre değeri → metin. Formülde yalnız önbellek sonucu (hesaplama yok, K12). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? numberText(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result);
    if ('formula' in value || 'sharedFormula' in value) return '';
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part: unknown) =>
          typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '',
        )
        .join('');
    }
    if ('text' in value) return cellText(value.text);
    // `{error: '#DIV/0!'}` ve bilinmeyen türler boş sayılır.
  }
  return '';
}

/**
 * Sayı → metin: tam sayılar üstel gösterim olmadan (barkod), ondalıklar JS'nin en kısa gösterimiyle.
 * Ondalık hassasiyeti `decimal.js` ile doğrulayıcıda denetlenir.
 */
function numberText(value: number): string {
  if (Number.isInteger(value)) return BigInt(value).toString();
  return String(value);
}

function headerMap(
  values: readonly unknown[],
  spec: ColumnSpec,
): Map<number, ProductImportColumn> | string {
  const known = new Set<string>(spec.columns);
  const map = new Map<number, ProductImportColumn>();
  const seen = new Set<ProductImportColumn>();
  const foreign = new Set<string>(spec.foreign ?? []);
  const keys = values.map((value) => cellText(value).trim().toLowerCase());
  if (keys.some((key) => foreign.has(key))) return 'wrong_template';
  keys.forEach((key, index) => {
    if (!known.has(key)) return;
    const column = key as ProductImportColumn;
    if (seen.has(column)) return;
    seen.add(column);
    map.set(index, column);
  });
  const missing = spec.required.filter((column) => !seen.has(column));
  return missing.length > 0 ? `missing_columns:${missing.join(',')}` : map;
}

/** Dosyayı okur; satırlar veya `failed` nedeni. Beklenmeyen okuma hatası `FILE_INVALID`. */
export async function readProductRows(
  body: Buffer,
  limits: ReadLimits,
  spec: ColumnSpec = PRODUCT_COLUMN_SPEC,
): Promise<ReadResult> {
  if (zipUncompressedTotal(body, limits.maxUncompressedBytes) === null) {
    return { ok: false, failure: 'FILE_INVALID', reason: 'zip' };
  }
  try {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(body), {
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'ignore',
      worksheets: 'emit',
      entries: 'emit',
    });
    for await (const sheet of reader) {
      let columns: Map<number, ProductImportColumn> | undefined;
      const rows: RawImportRow[] = [];
      for await (const row of sheet) {
        const values = Array.isArray(row.values) ? (row.values as unknown[]) : [];
        if (columns === undefined) {
          const header = headerMap(values, spec);
          if (typeof header === 'string')
            return { ok: false, failure: 'FILE_INVALID', reason: header };
          columns = header;
          continue;
        }
        const parsed = toRow(row.number, values, columns, limits.cellMax);
        if (parsed === null) continue;
        if (rows.length >= limits.maxRows) {
          return { ok: false, failure: 'IMPORT_TOO_MANY_ROWS', reason: 'rows' };
        }
        rows.push(parsed);
      }
      if (columns === undefined) return { ok: false, failure: 'FILE_INVALID', reason: 'empty' };
      return { ok: true, rows };
    }
    return { ok: false, failure: 'FILE_INVALID', reason: 'no_sheet' };
  } catch {
    // Bozuk içerik: ayrıntı dosyadan geldiği için loglanmaz (kişisel veri olabilir).
    return { ok: false, failure: 'FILE_INVALID', reason: 'unreadable' };
  }
}

function toRow(
  number: number,
  values: readonly unknown[],
  columns: ReadonlyMap<number, ProductImportColumn>,
  cellMax: number,
): RawImportRow | null {
  const cells: Partial<Record<ProductImportColumn, string>> = {};
  const tooLong: ProductImportColumn[] = [];
  for (const [index, column] of columns) {
    let text = cellText(values[index]).trim();
    if (text === '') continue;
    if (text.length > cellMax) {
      text = text.slice(0, cellMax);
      tooLong.push(column);
    }
    cells[column] = text;
  }
  return Object.keys(cells).length === 0 ? null : { row: number, cells, tooLong };
}
