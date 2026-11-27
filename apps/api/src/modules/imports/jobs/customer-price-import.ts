// Müşteri fiyatı içe aktarma türünün ortak adımları (F3.7a; US-035 AC2, kart K9). Doğrulama ve
// uygulama aynı fonksiyonla taze veriyi okur: bağlantı (R30), SKU eşleşmeleri, bugünkü fiyatlar.
import { IMPORT_ROW_ERROR_CODES, IMPORT_ROW_WARNING_CODES } from '@b2b/shared';
import type { Tx } from '../../../core/db';
import type { ProductImportLookup } from '../../catalog';
import type { CustomerPriceImport } from '../../pricing';
import {
  type CustomerPriceValidation,
  customerPriceSkus,
  matchedPackagingIds,
  validateCustomerPriceRows,
} from '../customer-price-rows';
import type { RawImportRow } from '../xlsx-reader';

/** Fark raporunun çeviri anahtarları (i18n/seed/import-messages.ts). */
export const CUSTOMER_PRICE_REPORT_KEYS: readonly string[] = [
  'imports.sheet.report',
  'imports.report.row',
  'imports.report.sku',
  'imports.report.current_price',
  'imports.report.new_price',
  'imports.report.action',
  'imports.report.problem',
  'imports.action.insert',
  'imports.action.update',
  'imports.action.unchanged',
  'imports.action.error',
  ...IMPORT_ROW_ERROR_CODES.map((code) => `imports.row.${code}`),
  ...IMPORT_ROW_WARNING_CODES.map((code) => `imports.row.${code}`),
];

/** Şablonun çeviri anahtarları. */
export const CUSTOMER_PRICE_TEMPLATE_KEYS: readonly string[] = [
  'imports.sheet.customer_prices',
  'imports.sheet.instructions',
  'imports.template.customer_prices_intro',
  'imports.template.column',
  'imports.template.description',
  'imports.column.sku',
  'imports.column.name',
  'imports.column.current_price',
  'imports.column.customer_price',
];

export interface CustomerPriceLookups {
  readonly catalog: Pick<ProductImportLookup, 'skuMatchesTx'>;
  readonly prices: Pick<CustomerPriceImport, 'connectionTx' | 'currentTx'>;
}

/**
 * Satırları çağıranın kiracı işleminde taze veriyle doğrular. Perakendeciyle aktif bağlantı yoksa
 * `null` (iş `CONNECTION_INACTIVE` ile düşer). `share`: uygulama partisi bağlantıyı kilitler.
 */
export async function validateCustomerPricesTx(
  tx: Tx,
  lookups: CustomerPriceLookups,
  input: {
    readonly sellerId: string;
    readonly buyerId: string;
    readonly rows: readonly RawImportRow[];
    readonly now: Date;
    readonly lock?: 'share';
  },
): Promise<CustomerPriceValidation | null> {
  const connection = await lookups.prices.connectionTx(
    tx,
    input.sellerId,
    input.buyerId,
    input.lock,
  );
  if (connection === null) return null;
  const matches = await lookups.catalog.skuMatchesTx(
    tx,
    input.sellerId,
    customerPriceSkus(input.rows),
  );
  const current = await lookups.prices.currentTx(tx, {
    sellerId: input.sellerId,
    buyerId: input.buyerId,
    priceListId: connection.priceListId,
    packagingIds: matchedPackagingIds(matches),
    now: input.now,
  });
  return validateCustomerPriceRows(input.rows, { matches, current });
}

/** Satır no → dosyadaki ham fiyat metni (fark raporunda hatalı satır da görünsün). */
export function rawPrices(rows: readonly RawImportRow[]): Map<number, string> {
  return new Map(
    rows.flatMap((row) => (row.cells.price === undefined ? [] : [[row.row, row.cells.price]])),
  );
}
