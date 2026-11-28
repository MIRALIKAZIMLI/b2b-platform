// F3.10 stok modları kuralı (US-038 AC1–AC2): perakendecideki "Stokta yok" etiketi ve sepet engeli
// (F3.12a, F4.1) bu kuraldan okunur.
import { describe, expect, it } from 'vitest';
import {
  countDelta,
  inventoryAccess,
  isSelectableStockMode,
  LOW_STOCK_THRESHOLD_PATTERN,
  quantityActivationSchema,
  SELECTABLE_STOCK_MODES,
  splitByUnit,
  stockDisplay,
  stockMovementCreateSchema,
  stockQuerySchema,
  toBaseQty,
  trimQty,
  variantBlockedByStock,
} from '../stock';

describe('F3.10 stok modu kuralı', () => {
  it('F3.10-AC1 none modunda saklanan "yok" işareti yok sayılır: her aktif varyant sipariş edilebilir', () => {
    expect(variantBlockedByStock('none', false)).toBe(false);
    expect(variantBlockedByStock('none', true)).toBe(false);
  });

  it('F3.10-AC2 availability modunda "yok" varyant siparişe kapanır, "var" açık', () => {
    expect(variantBlockedByStock('availability', false)).toBe(true);
    expect(variantBlockedByStock('availability', true)).toBe(false);
  });

  it('F3.10-AC2b quantity modunda işaret yok sayılır (karar miktara göre, F3.11a)', () => {
    expect(variantBlockedByStock('quantity', false)).toBe(false);
  });

  it('F3.10-AC1b ayardan yalnız none ve availability seçilir', () => {
    expect(SELECTABLE_STOCK_MODES).toEqual(['none', 'availability']);
    expect(isSelectableStockMode('none')).toBe(true);
    expect(isSelectableStockMode('availability')).toBe(true);
    expect(isSelectableStockMode('quantity')).toBe(false);
    expect(isSelectableStockMode(undefined)).toBe(false);
  });

  it('F3.10-W1 ekran izinleri: inventory.view görür, inventory.manage yazar', () => {
    expect(inventoryAccess(['inventory.view'])).toEqual({ view: true, manage: false });
    expect(inventoryAccess(['inventory.view', 'inventory.manage'])).toEqual({
      view: true,
      manage: true,
    });
    expect(inventoryAccess([])).toEqual({ view: false, manage: false });
  });
});

describe('F3.11a miktarlı stok gösterimi ve şemaları', () => {
  const quantity = (availableBase: string | null, baseQtyPerUnit = '24', lowThreshold = '5') =>
    stockDisplay({
      stockMode: 'quantity',
      isAvailable: true,
      availableBase,
      baseQtyPerUnit,
      lowThreshold,
    });

  it('F3.11a-AC6 satılabilir ≤ 5 satış birimi ise "Son X koli", üstündeyse yalnız "Stokta"', () => {
    expect(quantity('120')).toEqual({ state: 'low', lowQty: '5' });
    expect(quantity('24')).toEqual({ state: 'low', lowQty: '1' });
    expect(quantity('144')).toEqual({ state: 'in_stock', lowQty: null });
    // Tam koli sayılır: 143 adet = 5 koli (6. koli eksik).
    expect(quantity('143')).toEqual({ state: 'low', lowQty: '5' });
  });

  it('F3.11a-AC6 bir koliden az, sıfır, eksi veya sayılmamış stok "Stokta yok" (S2 = A)', () => {
    expect(quantity('23.5')).toEqual({ state: 'out_of_stock', lowQty: null });
    expect(quantity('0')).toEqual({ state: 'out_of_stock', lowQty: null });
    expect(quantity('-2')).toEqual({ state: 'out_of_stock', lowQty: null });
    expect(quantity(null)).toEqual({ state: 'out_of_stock', lowQty: null });
  });

  it('F3.11a-AC6 eşik toptancı ayarıyla değişir; ondalıklı ambalaj', () => {
    expect(quantity('240', '24', '10')).toEqual({ state: 'low', lowQty: '10' });
    expect(quantity('240', '24', '0')).toEqual({ state: 'in_stock', lowQty: null });
    expect(quantity('2.5', '0.5', '5')).toEqual({ state: 'low', lowQty: '5' });
  });

  it('F3.11a-AC6 diğer modlar: none gösterim yok, availability işarete göre', () => {
    const base = { availableBase: '0', baseQtyPerUnit: '1', lowThreshold: '5' };
    expect(stockDisplay({ ...base, stockMode: 'none', isAvailable: false })).toEqual({
      state: 'untracked',
      lowQty: null,
    });
    expect(stockDisplay({ ...base, stockMode: 'availability', isAvailable: false }).state).toBe(
      'out_of_stock',
    );
    expect(stockDisplay({ ...base, stockMode: 'availability', isAvailable: true }).state).toBe(
      'in_stock',
    );
  });

  it('F3.11a-V1 hareket gövdesi: miktar en çok 3 ondalık, işaretsiz; yalnız receipt / adjustment', () => {
    const base = {
      warehouseId: '0190a1b2-0000-7000-8000-000000000001',
      variantId: '0190a1b2-0000-7000-8000-000000000002',
    };
    expect(
      stockMovementCreateSchema.safeParse({ ...base, type: 'receipt', qty: '12.125' }).success,
    ).toBe(true);
    expect(
      stockMovementCreateSchema.safeParse({ ...base, type: 'adjustment', qty: '0' }).success,
    ).toBe(true);
    for (const qty of ['-1', '1.0001', '1e3', '', ' 1']) {
      expect(
        stockMovementCreateSchema.safeParse({ ...base, type: 'receipt', qty }).success,
        qty,
      ).toBe(false);
    }
    expect(stockMovementCreateSchema.safeParse({ ...base, type: 'ship', qty: '1' }).success).toBe(
      false,
    );
    expect(stockQuerySchema.parse({ low: 'true', limit: '10' })).toEqual({ low: true, limit: 10 });
    expect(quantityActivationSchema.safeParse({ confirmUncounted: 'yes' }).success).toBe(false);
  });
});

describe('F3.11b depo ekranı miktar çevirisi', () => {
  it('F3.11b-UNIT toBaseQty seçilen ambalajı temel birime çevirir; 3 ondalığı aşan veya geçersiz girdi null', () => {
    expect(toBaseQty('12', '24')).toBe('288');
    expect(toBaseQty('1,5', '24.000')).toBe('36');
    expect(toBaseQty('0.25', '0.5')).toBe('0.125');
    expect(toBaseQty('0.001', '0.5')).toBeNull();
    expect(toBaseQty('-1', '24')).toBeNull();
    expect(toBaseQty('abc', '24')).toBeNull();
    expect(toBaseQty('99999999999', '24')).toBeNull();
  });

  it('F3.11b-UNIT splitByUnit tam ambalaj + kalan (yuvarlama yok); negatif fark işareti korunur', () => {
    expect(splitByUnit('294.000', '24.000')).toEqual({ units: '12', remainder: '6' });
    expect(splitByUnit('288', '24')).toEqual({ units: '12', remainder: '0' });
    expect(splitByUnit('5', '24')).toEqual({ units: '0', remainder: '5' });
    expect(splitByUnit('-30', '24')).toEqual({ units: '-1', remainder: '6' });
    expect(splitByUnit('-5', '24')).toEqual({ units: '0', remainder: '-5' });
    expect(splitByUnit('5', '0')).toBeNull();
  });

  it('F3.11b-AC7 sayım farkı önizlemesi: sayılan toplam − mevcut', () => {
    expect(countDelta('100', '120.000')).toBe('-20');
    expect(countDelta('120', '120.000')).toBe('0');
    expect(countDelta('0.5', '0')).toBe('0.5');
    expect(trimQty('144.000')).toBe('144');
  });

  it('F3.11b-THR eşik deseni 0–9999 tam sayı', () => {
    for (const ok of ['0', '5', '9999']) expect(LOW_STOCK_THRESHOLD_PATTERN.test(ok)).toBe(true);
    for (const bad of ['', '-1', '05', '1.5', '10000']) {
      expect(LOW_STOCK_THRESHOLD_PATTERN.test(bad)).toBe(false);
    }
  });
});
