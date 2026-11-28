import { createApiClient } from '@b2b/api-client';
import { createIdempotencyKey } from '@b2b/shared';
import { describe, expect, it, vi } from 'vitest';
import { mobileHref, mobileMenu } from '../../shell/shell-state';
import { fetchStockItems, postMovement, type StockItem, StockError } from '../api';
import {
  BASE_CHOICE,
  buildMovement,
  countPreview,
  defaultUnitChoice,
  isExpiryDate,
  qtyParts,
  stockStatus,
  unitChoices,
} from '../stock-form';

const BASE = 'http://mobile.test';
const BUSINESS = '0190a3b4-0000-7000-8000-0000000000aa';
const WAREHOUSE = '0190a3b4-0000-7000-8000-0000000000cc';
const VARIANT = '0190a3b4-0000-7000-8000-0000000000dd';

/** 1 koli = 12 ədəd (satış birimi); 1 blok = 6 ədəd (satış birimi değil). */
const item = (patch: Partial<StockItem> = {}): StockItem => ({
  variantId: VARIANT,
  productId: '0190a3b4-0000-7000-8000-0000000000ee',
  productName: { az: 'Su 0.5 l' },
  attributes: {},
  sku: 'SU-05',
  baseUnitCode: 'H87',
  packaging: [
    { level: 'unit', unitCode: 'H87', baseQty: '1.000', isSalesUnit: false },
    { level: 'inner', unitCode: 'PK', baseQty: '6.000', isSalesUnit: false },
    { level: 'case', unitCode: 'CS', baseQty: '12.000', isSalesUnit: true },
  ],
  displayUnit: { unitCode: 'CS', baseQty: '12.000' },
  counted: true,
  onHand: '150.000',
  reserved: '0.000',
  available: '150.000',
  low: false,
  updatedAt: '2026-11-28T09:00:00Z',
  ...patch,
});

const draft = (patch: Partial<Parameters<typeof buildMovement>[0]> = {}) => ({
  type: 'receipt' as const,
  qty: '',
  unit: 'case',
  lotNo: '',
  expiry: '',
  note: '',
  ...patch,
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientWith(respond: () => Response) {
  const seen: Request[] = [];
  const fetch = vi.fn(async (request: Request) => {
    seen.push(request.clone());
    return Promise.resolve(respond());
  });
  return { client: createApiClient({ baseUrl: BASE, fetch }), seen };
}

describe('F3.11d mobil depo stoğu', () => {
  it('F3.11d-AC1 koli ile mal girişi temel birime çevrilir; boş alanlar gönderilmez', () => {
    const result = buildMovement(draft({ qty: '12', note: '  ' }), item(), WAREHOUSE);
    expect(result).toEqual({
      ok: true,
      body: { warehouseId: WAREHOUSE, variantId: VARIANT, type: 'receipt', qty: '144' },
    });
    const full = buildMovement(
      draft({ qty: '1,5', unit: BASE_CHOICE, lotNo: ' L-7 ', expiry: '2027-03-31', note: 'ok' }),
      item(),
      WAREHOUSE,
    );
    expect(full.ok && full.body).toEqual({
      warehouseId: WAREHOUSE,
      variantId: VARIANT,
      type: 'receipt',
      qty: '1.5',
      lotNo: 'L-7',
      expiryDate: '2027-03-31',
      note: 'ok',
    });
  });

  it('F3.11d-AC1 sıfır, boş, harf ve 3 ondalığı aşan miktar alan hatası', () => {
    for (const qty of ['', '0', 'abc', '-2', '0.0001']) {
      expect(buildMovement(draft({ qty }), item(), WAREHOUSE)).toEqual({
        ok: false,
        field: 'qty',
        error: 'qty_positive',
      });
    }
    // Ondalık koli: 0.333 × 12 = 3.996 temel birim (3 ondalık sınırında).
    expect(buildMovement(draft({ qty: '0.333' }), item(), WAREHOUSE)).toMatchObject({
      ok: true,
      body: { qty: '3.996' },
    });
  });

  it('F3.11d-AC1 birim seçenekleri: 1 olmayan ambalajlar + temel birim; varsayılan koli', () => {
    expect(unitChoices(item()).map((c) => c.value)).toEqual(['inner', 'case', BASE_CHOICE]);
    expect(defaultUnitChoice(item())).toBe('case');
    expect(defaultUnitChoice(item({ displayUnit: null }))).toBe(BASE_CHOICE);
  });

  it('F3.11d-AC7 sayımda toplam yazılır; 0 geçerli, parti/tarih gönderilmez; fark önizlemesi', () => {
    const zero = buildMovement(
      draft({ type: 'adjustment', qty: '0', lotNo: 'L', expiry: 'bad' }),
      item(),
      WAREHOUSE,
    );
    expect(zero).toEqual({
      ok: true,
      body: { warehouseId: WAREHOUSE, variantId: VARIANT, type: 'adjustment', qty: '0' },
    });
    expect(buildMovement(draft({ type: 'adjustment', qty: '' }), item(), WAREHOUSE)).toEqual({
      ok: false,
      field: 'qty',
      error: 'qty_invalid',
    });
    expect(countPreview('144', item())).toEqual({ kind: 'delta', delta: '-6' });
    expect(countPreview('156', item())).toEqual({ kind: 'delta', delta: '6' });
    expect(countPreview('150', item())).toEqual({ kind: 'same' });
    expect(countPreview('0', item({ counted: false, onHand: null }))).toEqual({ kind: 'first' });
    expect(countPreview('24', item({ counted: false, onHand: null }))).toEqual({
      kind: 'delta',
      delta: '24',
    });
  });

  it('F3.11d-AC6 rozet: sayılmamış, bitib, az qalıb (API low), var', () => {
    expect(stockStatus(item({ counted: false, available: null }))).toBe('uncounted');
    expect(stockStatus(item({ available: '0.000', low: true }))).toBe('out');
    expect(stockStatus(item({ available: '36.000', low: true }))).toBe('low');
    expect(stockStatus(item())).toBe('in');
  });

  it('F3.11d-AC6 miktar gösterimi koli + kalan; bir koliden az ise yalnız temel birim', () => {
    expect(qtyParts('150.000', item())).toEqual({
      packed: { units: '12', unitCode: 'CS', rest: '6' },
      base: '150',
    });
    expect(qtyParts('144', item())).toEqual({
      packed: { units: '12', unitCode: 'CS', rest: '0' },
      base: '144',
    });
    expect(qtyParts('5', item())).toEqual({ packed: null, base: '5' });
    expect(qtyParts('20', item({ displayUnit: null }))).toEqual({ packed: null, base: '20' });
  });

  it('F3.11d-DATE son kullanma YYYY-AA-GG ve takvimde var', () => {
    expect(isExpiryDate('2027-03-31')).toBe(true);
    expect(isExpiryDate('2028-02-29')).toBe(true);
    for (const bad of ['2027-02-29', '2027-13-01', '2027-04-31', '27-03-31', '2027/03/31', '']) {
      expect(isExpiryDate(bad)).toBe(false);
    }
    expect(buildMovement(draft({ qty: '1', expiry: '2027-02-30' }), item(), WAREHOUSE)).toEqual({
      ok: false,
      field: 'expiry',
      error: 'expiry_invalid',
    });
  });

  it('F3.11d-MENU inventory.view izinli toptancıda Stok /stock açar (Müfettiş #91)', () => {
    const me = {
      activeBusiness: {
        capability: 'seller' as const,
        permissions: [{ code: 'inventory.view', scope: 'warehouse' as const }],
      },
    };
    const stock = mobileMenu(me, 'seller').find((entry) => entry.key === 'stock');
    expect(stock).toBeDefined();
    expect(stock === undefined ? undefined : mobileHref('seller', stock)).toBe('/stock');
    const none = mobileMenu(
      { activeBusiness: { capability: 'seller', permissions: [] } },
      'seller',
    );
    expect(none.some((entry) => entry.key === 'stock')).toBe(false);
  });

  it('F3.11d-KEY hareket isteği işletme + idempotens başlığı taşır, yeniden denemede aynı', async () => {
    let calls = 0;
    const { client, seen } = clientWith(() => {
      calls += 1;
      return calls === 1
        ? json(503, { code: 'INTERNAL_ERROR' })
        : json(201, { movement: null, stock: {} });
    });
    const key = createIdempotencyKey('stock');
    expect(key).toMatch(/^stock-[0-9a-f]{32}$/);
    expect(createIdempotencyKey('stock')).not.toBe(key);
    const body = {
      warehouseId: WAREHOUSE,
      variantId: VARIANT,
      type: 'receipt' as const,
      qty: '144',
    };
    await expect(postMovement(client, BUSINESS, body, key)).rejects.toThrow(StockError);
    await postMovement(client, BUSINESS, body, key);
    expect(seen.map((r) => r.headers.get('Idempotency-Key'))).toEqual([key, key]);
    expect(seen[0]?.headers.get('X-Business-Id')).toBe(BUSINESS);
    expect(new URL(seen[0]?.url ?? '').pathname).toBe('/api/v1/stock/movements');
    expect(await seen[1]?.json()).toEqual(body);
  });

  it('F3.11d-LIST liste isteği depo, süzgeç ve aramayı taşır; hata kodu StockError', async () => {
    const { client, seen } = clientWith(() => json(200, { items: [], nextCursor: null }));
    await fetchStockItems(client, BUSINESS, {
      warehouseId: WAREHOUSE,
      q: '  su ',
      filter: 'low',
      cursor: undefined,
    });
    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/api/v1/stock/items');
    expect(url.searchParams.get('warehouseId')).toBe(WAREHOUSE);
    expect(url.searchParams.get('filter')).toBe('low');
    expect(url.searchParams.get('q')).toBe('su');
    expect(url.searchParams.has('cursor')).toBe(false);

    const failing = clientWith(() => json(403, { code: 'FORBIDDEN' }));
    await expect(
      fetchStockItems(failing.client, BUSINESS, {
        warehouseId: WAREHOUSE,
        q: '',
        filter: 'all',
        cursor: 'c1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
