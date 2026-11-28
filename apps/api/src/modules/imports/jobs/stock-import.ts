// Stok sayımı içe aktarma türünün ortak adımları (F3.11c; kart K1–K12). Doğrulama ve uygulama aynı
// fonksiyonla taze veriyi okur: depo (aktif mi), SKU eşleşmeleri, depodaki bugünkü sayılar.
import { IMPORT_ROW_ERROR_CODES, IMPORT_ROW_WARNING_CODES } from '@b2b/shared';
import type { Tx } from '../../../core/db';
import type { ProductImportLookup } from '../../catalog';
import type { StockImport } from '../../inventory';
import {
  matchedVariantIds,
  type StockValidation,
  stockSkus,
  validateStockRows,
} from '../stock-rows';
import type { RawImportRow } from '../xlsx-reader';

/** Önizleme ve sonuç raporunun çeviri anahtarları (i18n/seed/import-messages.ts). */
export const STOCK_REPORT_KEYS: readonly string[] = [
  'imports.sheet.report',
  'imports.sheet.result',
  'imports.report.row',
  'imports.report.sku',
  'imports.report.system_qty',
  'imports.report.counted_qty',
  'imports.report.difference',
  'imports.report.action',
  'imports.report.result',
  'imports.report.problem',
  'imports.stock_action.insert',
  'imports.stock_action.update',
  'imports.stock_action.unchanged',
  'imports.stock_action.error',
  ...IMPORT_ROW_ERROR_CODES.map((code) => `imports.row.${code}`),
  ...IMPORT_ROW_WARNING_CODES.map((code) => `imports.row.${code}`),
];

/** Şablonun çeviri anahtarları. */
export const STOCK_TEMPLATE_KEYS: readonly string[] = [
  'imports.sheet.stock',
  'imports.sheet.instructions',
  'imports.template.stock_intro',
  'imports.template.column',
  'imports.template.description',
  'imports.column.sku',
  'imports.column.name',
  'imports.column.base_unit',
  'imports.column.current_stock',
  'imports.column.counted_stock',
];

export interface StockLookups {
  readonly catalog: Pick<ProductImportLookup, 'skuMatchesTx'>;
  readonly stock: Pick<StockImport, 'activeWarehouseTx' | 'countsTx'>;
}

/**
 * Satırları çağıranın kiracı işleminde taze veriyle doğrular. Depo pasif (veya yok) ise `null`
 * (iş `WAREHOUSE_INACTIVE` ile düşer).
 */
export async function validateStockTx(
  tx: Tx,
  lookups: StockLookups,
  input: {
    readonly sellerId: string;
    readonly warehouseId: string;
    readonly rows: readonly RawImportRow[];
  },
): Promise<StockValidation | null> {
  if (!(await lookups.stock.activeWarehouseTx(tx, input.sellerId, input.warehouseId))) return null;
  const matches = await lookups.catalog.skuMatchesTx(tx, input.sellerId, stockSkus(input.rows));
  const counts = await lookups.stock.countsTx(
    tx,
    input.sellerId,
    input.warehouseId,
    matchedVariantIds(matches),
  );
  return validateStockRows(input.rows, { matches, counts });
}

/** Satır no → dosyadaki ham sayılan metni (raporda hatalı satır da görünsün). */
export function rawCounts(rows: readonly RawImportRow[]): Map<number, string> {
  return new Map(
    rows.flatMap((row) => (row.cells.stock === undefined ? [] : [[row.row, row.cells.stock]])),
  );
}
