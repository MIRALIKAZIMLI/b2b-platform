// F3.5a (US-031 AC2, AC4; kart K2–K10, Mimar S1–S3, V3): satır doğrulayıcı.
import { describe, expect, it } from 'vitest';
import type { ImportSkuMatches } from '../../catalog';
import { nameKey, type RowOutcome, type ValidationContext, validateRows } from '../row-validator';
import type { RawImportRow } from '../xlsx-reader';

const CATEGORIES = [
  { id: 'root', parentId: null, isActive: true, name: { az: 'Kosmetika', ru: 'Косметика' } },
  { id: 'hair', parentId: 'root', isActive: true, name: { az: 'Şampun', ru: 'Шампунь' } },
  { id: 'off', parentId: null, isActive: false, name: { az: 'Köhnə' } },
  { id: 'under-off', parentId: 'off', isActive: true, name: { az: 'Gizli' } },
  { id: 'dup1', parentId: null, isActive: true, name: { az: 'İkili' } },
  { id: 'dup2', parentId: 'root', isActive: true, name: { tr: 'İkili' } },
];
const UNITS = [
  {
    code: 'H87',
    allowsDecimal: false,
    isActive: true,
    name: { az: 'Ədəd' },
    abbreviation: { az: 'əd.' },
  },
  {
    code: 'KGM',
    allowsDecimal: true,
    isActive: true,
    name: { az: 'Kiloqram' },
    abbreviation: { az: 'kq' },
  },
  {
    code: 'OLD',
    allowsDecimal: false,
    isActive: false,
    name: { az: 'Köhnə vahid' },
    abbreviation: { az: 'kv' },
  },
];

const NO_MATCHES: ImportSkuMatches = { variants: new Map(), products: new Map() };

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    categories: CATEGORIES,
    brands: [{ id: 'b1', name: 'Nivea' }],
    units: UNITS,
    matches: NO_MATCHES,
    defaultPriceListId: 'list-1',
    canWritePrices: true,
    ...overrides,
  };
}

let rowNo = 1;
function raw(cells: RawImportRow['cells'], tooLong: RawImportRow['tooLong'] = []): RawImportRow {
  rowNo += 1;
  return { row: rowNo, cells, tooLong };
}

const NEW = { sku: 'N-1', name_az: 'Şampun 400', category: 'şampun', unit: 'H87' } as const;

function one(cells: RawImportRow['cells'], ctx = context()): RowOutcome {
  const [outcome] = validateRows([raw(cells)], ctx).outcomes;
  if (outcome === undefined) throw new Error('sonuç yok');
  return outcome;
}

function codes(outcome: RowOutcome): string[] {
  return outcome.issues.map((issue) => `${issue.column}:${issue.code}`);
}

describe('F3.5a satır doğrulayıcı', () => {
  it('F3.5a-AC2 geçerli yeni satır insert; kategori ve birim adla/kodla, harf duyarsız eşleşir', () => {
    expect(one(NEW)).toMatchObject({ action: 'insert', issues: [] });
    expect(one({ ...NEW, category: 'ШАМПУНЬ', unit: 'kiloqram' }).action).toBe('insert');
    expect(one({ ...NEW, unit: 'əd.' }).action).toBe('insert');
  });

  it('F3.5a-AC2 yeni satırda ad, kategori, birim zorunlu; SKU zorunlu ve biçimli', () => {
    expect(codes(one({ sku: 'N-2' }))).toEqual([
      'name_az:required',
      'category:required',
      'unit:required',
    ]);
    expect(codes(one({ ...NEW, sku: undefined }))).toContain('sku:required');
    expect(codes(one({ ...NEW, sku: 'boşluk var' }))).toContain('sku:invalid');
  });

  it('F3.5a-AC2 kategori: bulunamayan, pasif üst altındaki, birden çok eşleşen', () => {
    expect(codes(one({ ...NEW, category: 'Yoxdur' }))).toEqual(['category:not_found']);
    expect(codes(one({ ...NEW, category: 'Gizli' }))).toEqual(['category:inactive']);
    expect(codes(one({ ...NEW, category: 'ikili' }))).toEqual(['category:ambiguous']);
  });

  it('F3.5a-AC2 Azerbaycan/Türk harfleri: İ, I, ı eşleşmede aynı sayılır', () => {
    expect(nameKey('İkili')).toBe(nameKey('ikili'));
    expect(nameKey('IKILI')).toBe(nameKey('ıkılı'));
    expect(nameKey('  Şampun ')).toBe('şampun');
  });

  it('F3.5a-AC2 marka, birim, barkod ve koli içi adet kuralları', () => {
    expect(codes(one({ ...NEW, brand: 'NIVEA' }))).toEqual([]);
    expect(codes(one({ ...NEW, brand: 'Yox' }))).toEqual(['brand:not_found']);
    expect(codes(one({ ...NEW, unit: 'OLD' }))).toEqual(['unit:inactive']);
    expect(codes(one({ ...NEW, unit: 'XYZ' }))).toEqual(['unit:not_found']);
    expect(codes(one({ ...NEW, barcode: '4006381333931' }))).toEqual([]);
    expect(codes(one({ ...NEW, barcode: '4006381333932' }))).toEqual(['barcode:invalid_gtin']);
    expect(codes(one({ ...NEW, case_qty: '24' }))).toEqual([]);
    expect(codes(one({ ...NEW, case_qty: '1' }))).toEqual(['case_qty:must_exceed_one']);
    expect(codes(one({ ...NEW, case_qty: '0' }))).toEqual(['case_qty:not_positive']);
    expect(codes(one({ ...NEW, case_qty: '2,5' }))).toEqual(['case_qty:not_integer']);
    expect(codes(one({ ...NEW, unit: 'KGM', case_qty: '2,5' }))).toEqual([]);
    expect(codes(one({ ...NEW, case_qty: 'on' }))).toEqual(['case_qty:invalid']);
  });

  it('F3.5a-PRICE fiyat biçimi: ondalık virgül, en çok 4 ondalık, negatif yok', () => {
    expect(codes(one({ ...NEW, price: '12,50' }))).toEqual([]);
    expect(codes(one({ ...NEW, price: '0' }))).toEqual([]);
    expect(codes(one({ ...NEW, price: '1.23450' }))).toEqual([]);
    expect(codes(one({ ...NEW, price: '1.23456' }))).toEqual(['price:too_many_decimals']);
    expect(codes(one({ ...NEW, price: '-3' }))).toEqual(['price:negative']);
    expect(codes(one({ ...NEW, price: 'pulsuz' }))).toEqual(['price:invalid']);
  });

  it('F3.5a-PRICE varsayılan liste yoksa hata; fiyat izni yoksa uyarı ve satır uygulanır (Mimar S2)', () => {
    expect(codes(one({ ...NEW, price: '5' }, context({ defaultPriceListId: null })))).toEqual([
      'price:no_default_price_list',
    ]);
    const warned = one(
      { ...NEW, price: '5' },
      context({ canWritePrices: false, defaultPriceListId: null }),
    );
    expect(warned.action).toBe('insert');
    expect(codes(warned)).toEqual(['price:price_ignored_no_permission']);
    const result = validateRows([raw({ ...NEW, price: '5' })], context({ canWritePrices: false }));
    expect(result.stats).toEqual({ insert: 1, update: 0, error: 0, warning: 1 });
  });

  it('F3.5a-AC4 eşleşme: önce varyant SKU (harf duyarsız), sonra tek varyantlı ürün SKU; çok varyantlıda hata (Mimar S1)', () => {
    const matches: ImportSkuMatches = {
      variants: new Map([
        [
          'v-1',
          {
            variantId: 'v1',
            productId: 'p1',
            variantStatus: 'active',
            productStatus: 'active',
            baseUnitCode: 'H87',
          },
        ],
        [
          'v-arc',
          {
            variantId: 'v2',
            productId: 'p1',
            variantStatus: 'archived',
            productStatus: 'active',
            baseUnitCode: 'H87',
          },
        ],
      ]),
      products: new Map([
        [
          'p-single',
          { productId: 'p2', status: 'draft', baseUnitCode: 'H87', activeVariantCount: 1 },
        ],
        [
          'p-multi',
          { productId: 'p3', status: 'active', baseUnitCode: 'H87', activeVariantCount: 2 },
        ],
        [
          'p-arc',
          { productId: 'p4', status: 'archived', baseUnitCode: 'H87', activeVariantCount: 1 },
        ],
      ]),
    };
    const ctx = context({ matches });
    // Güncellemede boş hücre "değiştirme": ad/kategori/birim zorunlu değil.
    expect(one({ sku: 'V-1' }, ctx)).toMatchObject({ action: 'update', issues: [] });
    expect(one({ sku: 'P-SINGLE', price: '3' }, ctx)).toMatchObject({
      action: 'update',
      issues: [],
    });
    expect(codes(one({ sku: 'p-multi' }, ctx))).toEqual(['sku:variant_ambiguous']);
    expect(codes(one({ sku: 'V-ARC' }, ctx))).toEqual(['sku:archived']);
    expect(codes(one({ sku: 'p-arc' }, ctx))).toEqual(['sku:archived']);
    // Temel birim içe aktarmayla değişmez.
    expect(codes(one({ sku: 'v-1', unit: 'KGM' }, ctx))).toEqual(['unit:cannot_change']);
    expect(codes(one({ sku: 'v-1', unit: 'ədəd' }, ctx))).toEqual([]);
  });

  it('F3.5a-AC4 dosyada aynı SKU iki kez (harf duyarsız) ise ikisi de hatalı', () => {
    const result = validateRows([raw(NEW), raw({ ...NEW, sku: 'n-1' })], context());
    expect(result.outcomes.map(codes)).toEqual([
      ['sku:duplicate_in_file'],
      ['sku:duplicate_in_file'],
    ]);
    expect(result.stats).toEqual({ insert: 0, update: 0, error: 2, warning: 0 });
  });

  it('F3.5a-R32 uzun hücre too_long; ad 200 karakteri aşamaz', () => {
    const [long] = validateRows([raw(NEW, ['brand'])], context()).outcomes;
    expect(long?.issues.map((issue) => `${issue.column}:${issue.code}`)).toEqual([
      'brand:too_long',
    ]);
    expect(codes(one({ ...NEW, name_ru: 'я'.repeat(201) }))).toEqual(['name_ru:too_long']);
  });

  it('F3.5a-V3 stok dolu satır varsa iş notu; stok doğrulanmaz', () => {
    const result = validateRows([raw({ ...NEW, stock: 'çox' })], context());
    expect(result.notes).toEqual(['stock_column_ignored']);
    expect(result.outcomes[0]?.issues).toEqual([]);
    expect(validateRows([raw(NEW)], context()).notes).toEqual([]);
  });
});
