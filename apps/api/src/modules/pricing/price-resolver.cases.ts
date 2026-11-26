// Fiyat çözümleme test tablosu (test-strategy §3.1 P1–P11; ADR-0019; R28). Beklenen değerler sabit
// metinlerdir: yuvarlama yarım yukarı, birim 4 hane, satır 2 hane. Bu tablo kod yazılmadan önce
// yazıldı (AGENTS.md kural 10: kritik alan, önce test).
import type { PriceListSource, PriceResolverInput } from './price-resolver';

export const NOW = new Date('2026-11-10T08:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');
const OLDER = new Date('2026-09-01T00:00:00Z');
/** Asia/Baku 2026-11-11 00:00 = 2026-11-10 20:00Z. */
const BAKU_MIDNIGHT = new Date('2026-11-10T20:00:00Z');

export const DEFAULT_LIST: PriceListSource = {
  listId: '00000000-0000-7000-8000-000000000001',
  name: 'Əsas',
  currency: 'AZN',
  vatIncluded: true,
  vatRate: '18.00',
  prices: [{ unitPrice: '10.0000', validFrom: PAST }],
};

export const ASSIGNED_LIST: PriceListSource = {
  listId: '00000000-0000-7000-8000-000000000002',
  name: 'Böyük marketlər',
  currency: 'AZN',
  vatIncluded: false,
  vatRate: '18.00',
  prices: [{ unitPrice: '9.5000', validFrom: PAST }],
};

export function baseInput(overrides: Partial<PriceResolverInput> = {}): PriceResolverInput {
  return {
    now: NOW,
    currency: 'AZN',
    qty: '1',
    branchPricingEnabled: false,
    branchPrices: [],
    customerPrices: [],
    assignedList: null,
    defaultList: DEFAULT_LIST,
    tiers: [],
    branchDiscountPercent: null,
    ...overrides,
  };
}

export interface ExpectedPrice {
  readonly source: string;
  readonly unitPrice?: string;
  readonly finalUnitPrice?: string;
  readonly tierDiscountPercent?: string | null;
  readonly branchDiscountPercent?: string | null;
  readonly priceListId?: string | null;
  readonly validFrom?: Date;
  readonly vatIncluded?: boolean | null;
}

export interface PriceCase {
  readonly id: string;
  readonly title: string;
  readonly input: PriceResolverInput;
  readonly expected?: ExpectedPrice;
  readonly error?: string;
}

export const PRICE_CASES: readonly PriceCase[] = [
  {
    id: 'P1',
    title: 'yalnız varsayılan liste → default_list',
    input: baseInput(),
    expected: {
      source: 'default_list',
      unitPrice: '10.0000',
      finalUnitPrice: '10.0000',
      tierDiscountPercent: null,
      branchDiscountPercent: null,
      priceListId: DEFAULT_LIST.listId,
      validFrom: PAST,
      vatIncluded: true,
    },
  },
  {
    id: 'P2',
    title: 'bağlantıya atanmış liste + varsayılan → price_list',
    input: baseInput({ assignedList: ASSIGNED_LIST }),
    expected: {
      source: 'price_list',
      unitPrice: '9.5000',
      finalUnitPrice: '9.5000',
      priceListId: ASSIGNED_LIST.listId,
      vatIncluded: false,
    },
  },
  {
    id: 'P2b',
    title: 'atanmış listede bu ambalajın fiyatı yok → varsayılana düşer',
    input: baseInput({ assignedList: { ...ASSIGNED_LIST, prices: [] } }),
    expected: { source: 'default_list', unitPrice: '10.0000', priceListId: DEFAULT_LIST.listId },
  },
  {
    id: 'P3',
    title: 'müşteri fiyatı + atanmış liste → customer_price (ƏDV atanmış listeden)',
    input: baseInput({
      assignedList: ASSIGNED_LIST,
      customerPrices: [{ unitPrice: '8.7500', validFrom: PAST }],
    }),
    expected: {
      source: 'customer_price',
      unitPrice: '8.7500',
      finalUnitPrice: '8.7500',
      priceListId: null,
      vatIncluded: false,
    },
  },
  {
    id: 'P4',
    title: 'şube fiyatı var ama branch_pricing_enabled = false → müşteri fiyatı',
    input: baseInput({
      branchPricingEnabled: false,
      branchPrices: [{ unitPrice: '7.0000', validFrom: PAST }],
      customerPrices: [{ unitPrice: '8.7500', validFrom: PAST }],
    }),
    expected: { source: 'customer_price', unitPrice: '8.7500' },
  },
  {
    id: 'P4b',
    title: 'şube fiyatı var, kapalı, müşteri fiyatı yok → liste',
    input: baseInput({
      branchPricingEnabled: false,
      branchPrices: [{ unitPrice: '7.0000', validFrom: PAST }],
    }),
    expected: { source: 'default_list', unitPrice: '10.0000' },
  },
  {
    id: 'P5',
    title: 'şube fiyatı var ve açık → branch_price',
    input: baseInput({
      branchPricingEnabled: true,
      branchPrices: [{ unitPrice: '7.0000', validFrom: PAST }],
      customerPrices: [{ unitPrice: '8.7500', validFrom: PAST }],
      assignedList: ASSIGNED_LIST,
    }),
    expected: { source: 'branch_price', unitPrice: '7.0000', priceListId: null },
  },
  {
    id: 'P6',
    title: 'geleceğe tarihli fiyat henüz geçerli değil → önceki fiyat',
    input: baseInput({
      now: new Date('2026-11-10T19:59:00Z'),
      defaultList: {
        ...DEFAULT_LIST,
        prices: [
          { unitPrice: '10.0000', validFrom: PAST },
          { unitPrice: '12.0000', validFrom: BAKU_MIDNIGHT },
        ],
      },
    }),
    expected: { source: 'default_list', unitPrice: '10.0000', validFrom: PAST },
  },
  {
    id: 'P6b',
    title: 'geçerlilik anı tam geldi (00:00 Asia/Baku) → yeni fiyat',
    input: baseInput({
      now: BAKU_MIDNIGHT,
      defaultList: {
        ...DEFAULT_LIST,
        prices: [
          { unitPrice: '12.0000', validFrom: BAKU_MIDNIGHT },
          { unitPrice: '10.0000', validFrom: PAST },
          { unitPrice: '11.0000', validFrom: OLDER },
        ],
      },
    }),
    expected: { source: 'default_list', unitPrice: '12.0000', validFrom: BAKU_MIDNIGHT },
  },
  {
    id: 'P6c',
    title: 'yalnız ileri tarihli fiyat var → none',
    input: baseInput({
      defaultList: {
        ...DEFAULT_LIST,
        prices: [{ unitPrice: '12.0000', validFrom: BAKU_MIDNIGHT }],
      },
    }),
    expected: { source: 'none' },
  },
  {
    id: 'P7',
    title: 'kademe eşiği tam sınırda (qty = min_qty) → indirim uygulanır',
    input: baseInput({
      qty: '10',
      tiers: [
        { minQty: '10', discountPercent: '3' },
        { minQty: '50', discountPercent: '5' },
      ],
    }),
    expected: {
      source: 'default_list',
      unitPrice: '10.0000',
      tierDiscountPercent: '3.00',
      finalUnitPrice: '9.7000',
    },
  },
  {
    id: 'P7b',
    title: 'eşiğin hemen altı (9.999) → indirim yok',
    input: baseInput({ qty: '9.999', tiers: [{ minQty: '10', discountPercent: '3' }] }),
    expected: { source: 'default_list', tierDiscountPercent: null, finalUnitPrice: '10.0000' },
  },
  {
    id: 'P7c',
    title: 'birden çok kademe → miktarın ulaştığı en büyük kademe',
    input: baseInput({
      qty: '75',
      tiers: [
        { minQty: '50', discountPercent: '5' },
        { minQty: '10', discountPercent: '3' },
        { minQty: '100', discountPercent: '8' },
      ],
    }),
    expected: { source: 'default_list', tierDiscountPercent: '5.00', finalUnitPrice: '9.5000' },
  },
  {
    id: 'P8',
    title: 'kademe + şube indirimi → önce kademe, sonra şube (her adım 4 hane)',
    input: baseInput({
      qty: '10',
      defaultList: { ...DEFAULT_LIST, prices: [{ unitPrice: '3.3333', validFrom: PAST }] },
      tiers: [{ minQty: '10', discountPercent: '3' }],
      branchDiscountPercent: '2.5',
    }),
    // 3.3333 × 0.97 = 3.233301 → 3.2333; 3.2333 × 0.975 = 3.1524675 → 3.1525
    expected: {
      source: 'default_list',
      unitPrice: '3.3333',
      tierDiscountPercent: '3.00',
      branchDiscountPercent: '2.50',
      finalUnitPrice: '3.1525',
    },
  },
  {
    id: 'P9',
    title: 'hiçbir listede fiyat yok → none',
    input: baseInput({ defaultList: { ...DEFAULT_LIST, prices: [] } }),
    expected: { source: 'none' },
  },
  {
    id: 'P9b',
    title: 'satıcının hiç listesi yok → none',
    input: baseInput({ defaultList: null }),
    expected: { source: 'none' },
  },
  {
    id: 'P10',
    title: 'farklı para birimli liste → CURRENCY_MISMATCH',
    input: baseInput({ assignedList: { ...ASSIGNED_LIST, currency: 'USD' } }),
    error: 'CURRENCY_MISMATCH',
  },
  {
    id: 'P11',
    title: 'yuvarlama: indirimli birim fiyat 4 hane, yarım yukarı (bankacı değil)',
    input: baseInput({
      qty: '1',
      defaultList: { ...DEFAULT_LIST, prices: [{ unitPrice: '1.2345', validFrom: PAST }] },
      branchDiscountPercent: '10',
    }),
    // 1.2345 × 0.9 = 1.11105 → yarım yukarı 1.1111 (bankacı yuvarlaması 1.1110 verirdi)
    expected: { source: 'default_list', unitPrice: '1.2345', finalUnitPrice: '1.1111' },
  },
];

/** P11 satır toplamı: [birim, miktar, beklenen 2 haneli toplam]. */
export const LINE_TOTAL_CASES: readonly (readonly [string, string, string])[] = [
  ['1.1111', '3', '3.33'],
  ['0.1250', '1', '0.13'],
  ['2.0050', '1', '2.01'],
  ['0.0050', '1', '0.01'],
  ['3.1525', '10', '31.53'],
  ['9.9999', '0.5', '5.00'],
];
