// F3.11c (US-039 AC7; kart K4–K7, K11; S1 = A, S2 = B): stok sayımı satır doğrulayıcı, ürün
// şablonunun stok sütunu (V3) ve çeviri anahtarları.
import { describe, expect, it } from 'vitest';
import type { ImportSkuMatches, ImportVariantMatch } from '../../catalog';
import type { StockCounts } from '../../inventory';
import { IMPORT_MESSAGES } from '../../i18n';
import { STOCK_REPORT_KEYS, STOCK_TEMPLATE_KEYS } from '../jobs/stock-import';
import { parseQtyText, type StockColumnContext, validateRows } from '../row-validator';
import { validateStockRows } from '../stock-rows';
import type { RawImportRow } from '../xlsx-reader';

function variant(id: string, overrides: Partial<ImportVariantMatch> = {}): ImportVariantMatch {
  return {
    variantId: id,
    productId: `p-${id}`,
    variantStatus: 'active',
    productStatus: 'active',
    baseUnitCode: 'H87',
    unitPackagingId: `u-${id}`,
    ...overrides,
  };
}

const MATCHES: ImportSkuMatches = {
  variants: new Map([
    ['A-1', variant('va')],
    ['B-1', variant('vb')],
    ['C-1', variant('vc')],
    ['R-1', variant('vr')],
    ['X-1', variant('vx', { variantStatus: 'archived' })],
  ]),
  products: new Map([
    [
      'P-1',
      {
        productId: 'p-va',
        status: 'active',
        baseUnitCode: 'H87',
        activeVariantCount: 1,
        activeVariantId: 'va',
        unitPackagingId: 'u-va',
      },
    ],
  ]),
};
const COUNTS = new Map<string, StockCounts>([
  ['va', { onHand: '40.000', reserved: '0.000' }],
  ['vc', { onHand: '5.000', reserved: '0.000' }],
  ['vr', { onHand: '20.000', reserved: '8.000' }],
]);

let rowNo = 1;
function raw(cells: RawImportRow['cells'], tooLong: RawImportRow['tooLong'] = []): RawImportRow {
  rowNo += 1;
  return { row: rowNo, cells, tooLong };
}

function issues(result: ReturnType<typeof validateStockRows>): string[][] {
  return result.outcomes.map((outcome) =>
    outcome.issues.map((issue) => `${issue.column}:${issue.code}`),
  );
}

describe('F3.11c stok satırı doğrulayıcı', () => {
  it('F3.11c-AC2 ilk sayım / değişen / aynı / hatalı; sayılanı boş satır atlanır', () => {
    const result = validateStockRows(
      [
        raw({ sku: 'a-1', stock: '37' }),
        raw({ sku: 'B-1', stock: '3,5' }),
        raw({ sku: 'C-1', stock: '5.000' }),
        raw({ sku: 'Z-1', stock: '1' }),
        raw({ sku: 'C-1' }),
      ],
      {
        matches: { ...MATCHES, variants: new Map([...MATCHES.variants, ['a-1', variant('va')]]) },
        counts: COUNTS,
      },
    );
    expect(result.outcomes.map((outcome) => outcome.action)).toEqual([
      'update',
      'insert',
      'unchanged',
      'error',
    ]);
    expect(result.stats).toEqual({ insert: 1, update: 1, error: 1, warning: 1 });
    expect(result.outcomes[0]).toMatchObject({
      variantId: 'va',
      counted: '37',
      currentOnHand: '40.000',
    });
    expect(result.outcomes[1]).toMatchObject({ counted: '3.5', currentOnHand: null });
    expect(issues(result)[2]).toEqual(['stock:stock_unchanged']);
    expect(issues(result)[3]).toEqual(['sku:not_found']);
  });

  it('F3.11c-V miktar ve SKU hataları; arşivli varyant; çift satır; rezerve altı', () => {
    const result = validateStockRows(
      [
        raw({ stock: '1' }),
        raw({ sku: 'A-1', stock: '-1' }),
        raw({ sku: 'B-1', stock: '1.2345' }),
        raw({ sku: 'C-1', stock: 'çox' }),
        raw({ sku: 'X-1', stock: '1' }),
        raw({ sku: 'R-1', stock: '7' }),
        raw({ sku: 'D-1', stock: '1' }),
        raw({ sku: 'd-1', stock: '2' }),
      ],
      { matches: MATCHES, counts: COUNTS },
    );
    expect(issues(result)).toEqual([
      ['sku:required'],
      ['stock:negative'],
      ['stock:too_many_decimals'],
      ['stock:invalid'],
      ['sku:archived'],
      ['stock:below_reserved'],
      ['sku:duplicate_in_file'],
      ['sku:duplicate_in_file'],
    ]);
    expect(result.stats.error).toBe(8);
    // Ürün SKU'su ve tek varyantının SKU'su aynı varyant: ikisi de çift. Uzun hücre too_long.
    const same = validateStockRows(
      [
        raw({ sku: 'P-1', stock: '1' }),
        raw({ sku: 'A-1', stock: '2' }),
        raw({ sku: 'B-1' }, ['stock']),
      ],
      { matches: MATCHES, counts: COUNTS },
    );
    expect(issues(same)).toEqual([
      ['sku:duplicate_in_file'],
      ['sku:duplicate_in_file'],
      ['stock:too_long'],
    ]);
  });

  it('F3.11c-S2 şablondaki sistem miktarı bugünküyle farklıysa satır uygulanmaz; boşsa kontrol yok; sayılmamış 0', () => {
    const result = validateStockRows(
      [
        raw({ sku: 'A-1', current_stock: '30', stock: '37' }),
        raw({ sku: 'A-1'.replace('A', 'C'), current_stock: '5', stock: '6' }),
        raw({ sku: 'B-1', current_stock: '0', stock: '2' }),
        raw({ sku: 'R-1', current_stock: 'x', stock: '9' }),
      ],
      { matches: MATCHES, counts: COUNTS },
    );
    expect(issues(result)).toEqual([
      ['current_stock:stock_changed'],
      [],
      [],
      ['current_stock:invalid'],
    ]);
    expect(result.outcomes[1]).toMatchObject({ action: 'update', expected: '5' });
    expect(result.outcomes[2]).toMatchObject({ action: 'insert', expected: '0' });
  });

  it('F3.11c-V miktar metni: ondalık virgül, sondaki sıfırlar, 11 tam hane', () => {
    expect(parseQtyText('12,5')).toEqual({ ok: true, value: '12.5' });
    expect(parseQtyText('3.1000')).toEqual({ ok: true, value: '3.1000' });
    expect(parseQtyText('123456789012')).toEqual({ ok: false, code: 'invalid' });
  });
});

describe('F3.11c-V3 ürün şablonunun stok sütunu', () => {
  const NEW = { sku: 'N-1', name_az: 'Şampun', category: 'şampun', unit: 'H87' } as const;
  const base = {
    categories: [{ id: 'hair', parentId: null, isActive: true, name: { az: 'Şampun' } }],
    brands: [],
    units: [
      { code: 'H87', allowsDecimal: false, isActive: true, name: { az: 'Ədəd' }, abbreviation: {} },
    ],
    matches: MATCHES,
    defaultPriceListId: 'list-1',
    canWritePrices: true,
  };
  function stock(overrides: Partial<StockColumnContext>): StockColumnContext {
    return {
      mode: 'quantity',
      canWrite: true,
      defaultWarehouseId: 'w1',
      counts: COUNTS,
      ...overrides,
    };
  }

  it('F3.11c-V3 quantity modu: varsayılan depoya sayım; rezerve altı ve varsayılan depo yoksa hata', () => {
    const result = validateRows(
      [
        raw({ ...NEW, stock: '12' }),
        raw({ sku: 'R-1', stock: '7' }),
        raw({ sku: 'A-1', stock: '-1' }),
      ],
      { ...base, stock: stock({}) },
    );
    expect(result.notes).toEqual([]);
    expect(result.outcomes[0]?.write).toMatchObject({ stockCount: '12' });
    expect(result.outcomes[1]?.issues).toEqual([{ column: 'stock', code: 'below_reserved' }]);
    expect(result.outcomes[2]?.issues).toEqual([{ column: 'stock', code: 'negative' }]);
    const noWarehouse = validateRows([raw({ ...NEW, stock: '1' })], {
      ...base,
      stock: stock({ defaultWarehouseId: null }),
    });
    expect(noWarehouse.outcomes[0]?.issues).toEqual([
      { column: 'stock', code: 'no_default_warehouse' },
    ]);
  });

  it('F3.11c-V3 availability modu 0 = yok, > 0 = var; none modu not; izinsiz üye uyarı + yok sayılır', () => {
    const availability = validateRows(
      [raw({ sku: 'A-1', stock: '0' }), raw({ sku: 'B-1', stock: '3' })],
      { ...base, stock: stock({ mode: 'availability' }) },
    );
    expect(availability.outcomes.map((outcome) => outcome.write?.available)).toEqual([false, true]);
    const none = validateRows([raw({ sku: 'A-1', stock: 'çox' })], {
      ...base,
      stock: stock({ mode: 'none' }),
    });
    expect(none.notes).toEqual(['stock_column_ignored']);
    expect(none.outcomes[0]?.issues).toEqual([]);
    const denied = validateRows([raw({ sku: 'A-1', stock: '5' })], {
      ...base,
      stock: stock({ canWrite: false }),
    });
    expect(denied.outcomes[0]).toMatchObject({ action: 'update' });
    expect(denied.outcomes[0]?.issues).toEqual([
      { column: 'stock', code: 'stock_ignored_no_permission' },
    ]);
    expect(denied.outcomes[0]?.write?.stockCount).toBeUndefined();
    expect(denied.stats.warning).toBe(1);
  });
});

describe('F3.11c çeviri anahtarları', () => {
  it('F3.11c-AC1 şablon ve rapor anahtarlarının az/ru/tr metni var', () => {
    for (const key of [...STOCK_TEMPLATE_KEYS, ...STOCK_REPORT_KEYS]) {
      const text = IMPORT_MESSAGES[key];
      expect(text, key).toBeDefined();
      expect(text?.az && text.ru && text.tr, key).toBeTruthy();
    }
  });
});
