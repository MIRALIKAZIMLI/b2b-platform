// F3.10 stok modları kuralı (US-038 AC1–AC2): perakendecideki "Stokta yok" etiketi ve sepet engeli
// (F3.12a, F4.1) bu kuraldan okunur.
import { describe, expect, it } from 'vitest';
import {
  inventoryAccess,
  isSelectableStockMode,
  quantityActivationSchema,
  SELECTABLE_STOCK_MODES,
  stockDisplay,
  stockMovementCreateSchema,
  stockQuerySchema,
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
