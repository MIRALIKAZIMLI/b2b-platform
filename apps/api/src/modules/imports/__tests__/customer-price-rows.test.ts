// F3.7a müşteri fiyatı satır doğrulayıcı (US-035 AC2, kart K9). Saf fonksiyon: eşleşmeler ve
// bugünkü fiyatlar elle verilir.
import { describe, expect, it } from 'vitest';
import type { ImportProductMatch, ImportSkuMatches, ImportVariantMatch } from '../../catalog';
import {
  type CustomerPriceCurrent,
  customerPriceSkus,
  matchedPackagingIds,
  validateCustomerPriceRows,
} from '../customer-price-rows';
import type { RawImportRow } from '../xlsx-reader';

function variant(id: string, unitPackagingId: string | null, archived = false): ImportVariantMatch {
  return {
    variantId: id,
    productId: `p-${id}`,
    variantStatus: archived ? 'archived' : 'active',
    productStatus: 'active',
    baseUnitCode: 'H87',
    unitPackagingId,
  };
}

function product(activeVariantCount: number, unitPackagingId: string | null): ImportProductMatch {
  return {
    productId: 'p-multi',
    status: 'active',
    baseUnitCode: 'H87',
    activeVariantCount,
    activeVariantId: activeVariantCount === 1 ? 'v-single' : null,
    unitPackagingId,
  };
}

const MATCHES: ImportSkuMatches = {
  variants: new Map([
    ['V-1', variant('v1', 'k1')],
    ['V-2', variant('v2', 'k2')],
    ['V-3', variant('v3', 'k3')],
    ['V-OLD', variant('v-old', 'k-old', true)],
    ['V-NOUNIT', variant('v-nounit', null)],
    ['V-SINGLE', variant('v-single', 'k-single')],
  ]),
  products: new Map([
    ['P-MULTI', product(2, null)],
    ['P-SINGLE', product(1, 'k-single')],
  ]),
};

const CURRENT = new Map<string, CustomerPriceCurrent>([
  ['k1', { customerPrice: null, effectivePrice: '10.0000' }],
  ['k2', { customerPrice: '8.5000', effectivePrice: '8.5000' }],
  ['k3', { customerPrice: '7.0000', effectivePrice: '7.0000' }],
]);

let rowNo = 1;
function raw(sku: string | undefined, price: string | undefined): RawImportRow {
  rowNo++;
  const cells: RawImportRow['cells'] = {};
  if (sku !== undefined) cells.sku = sku;
  if (price !== undefined) cells.price = price;
  return { row: rowNo, cells, tooLong: [] };
}

describe('F3.7a müşteri fiyatı satır doğrulayıcı', () => {
  it('F3.7a-AC2 yeni, değişen ve aynı fiyat ayrılır; fiyatı boş satır atlanır', () => {
    const rows = [raw('V-1', '9,5'), raw('V-2', '8'), raw('V-3', '7.00'), raw('V-2X', undefined)];
    const result = validateCustomerPriceRows(rows, { matches: MATCHES, current: CURRENT });
    expect(result.outcomes.map((o) => [o.sku, o.action, o.price, o.currentPrice])).toEqual([
      ['V-1', 'insert', '9.5', '10.0000'],
      ['V-2', 'update', '8', '8.5000'],
      ['V-3', 'unchanged', '7.00', '7.0000'],
    ]);
    expect(result.outcomes[2]?.issues).toEqual([{ column: 'price', code: 'price_unchanged' }]);
    expect(result.stats).toEqual({ insert: 1, update: 1, error: 0, warning: 1 });
  });

  it('F3.7a-AC2 SKU ve fiyat hataları: bulunamadı, arşivli, belirsiz, unit yok, geçersiz fiyat', () => {
    const rows = [
      raw('YOK-1', '1'),
      raw('V-OLD', '1'),
      raw('P-MULTI', '1'),
      raw('V-NOUNIT', '1'),
      raw('V-1', '-2'),
      raw('V-2', 'abc'),
      raw('V-3', '1.123456'),
      raw(undefined, '1'),
      raw('kötü sku', '1'),
    ];
    const result = validateCustomerPriceRows(rows, { matches: MATCHES, current: CURRENT });
    expect(result.outcomes.map((o) => [o.action, o.issues])).toEqual([
      ['error', [{ column: 'sku', code: 'not_found' }]],
      ['error', [{ column: 'sku', code: 'archived' }]],
      ['error', [{ column: 'sku', code: 'variant_ambiguous' }]],
      ['error', [{ column: 'price', code: 'no_unit_packaging' }]],
      ['error', [{ column: 'price', code: 'negative' }]],
      ['error', [{ column: 'price', code: 'invalid' }]],
      ['error', [{ column: 'price', code: 'too_many_decimals' }]],
      ['error', [{ column: 'sku', code: 'required' }]],
      ['error', [{ column: 'sku', code: 'invalid' }]],
    ]);
    // Hatalı satırda da bugünkü fiyat görünür (fark raporu).
    expect(result.outcomes[4]?.currentPrice).toBe('10.0000');
    expect(result.stats).toEqual({ insert: 0, update: 0, error: 9, warning: 0 });
  });

  it('F3.7a-AC2 aynı SKU (harf duyarsız) veya aynı ambalaj iki kez: hepsi duplicate_in_file', () => {
    const rows = [
      raw('V-1', '1'),
      raw('v-1', '2'),
      raw('V-SINGLE', '3'),
      raw('P-SINGLE', '4'),
      raw('V-2', '5'),
    ];
    const matches: ImportSkuMatches = {
      variants: new Map([...MATCHES.variants, ['v-1', variant('v1', 'k1')]]),
      products: MATCHES.products,
    };
    const result = validateCustomerPriceRows(rows, { matches, current: CURRENT });
    expect(result.outcomes.map((o) => [o.sku, o.action, o.issues[0]?.code ?? null])).toEqual([
      ['V-1', 'error', 'duplicate_in_file'],
      ['v-1', 'error', 'duplicate_in_file'],
      ['V-SINGLE', 'error', 'duplicate_in_file'],
      ['P-SINGLE', 'error', 'duplicate_in_file'],
      ['V-2', 'update', null],
    ]);
  });

  it('F3.7a-AC2 yardımcılar: fiyatı dolu SKU listesi ve eşleşen unit ambalajları', () => {
    expect(customerPriceSkus([raw('A', '1'), raw('B', undefined), raw(undefined, '2')])).toEqual([
      'A',
    ]);
    expect(matchedPackagingIds(MATCHES).sort()).toEqual(
      ['k-old', 'k-single', 'k1', 'k2', 'k3'].sort(),
    );
  });
});
