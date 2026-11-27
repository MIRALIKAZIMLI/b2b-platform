// F3.10 stok modları kuralı (US-038 AC1–AC2): perakendecideki "Stokta yok" etiketi ve sepet engeli
// (F3.12a, F4.1) bu kuraldan okunur.
import { describe, expect, it } from 'vitest';
import {
  inventoryAccess,
  isSelectableStockMode,
  SELECTABLE_STOCK_MODES,
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
