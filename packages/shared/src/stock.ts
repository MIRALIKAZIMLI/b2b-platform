// Stok modları (F3.10; US-038, ADR-0018). Mod toptancı ayarıdır (`seller_profiles.stock_mode`).
// - `none`: stok tutulmaz; her aktif varyant sipariş edilebilir (US-038 AC1).
// - `availability`: varyantın var/yok işareti (`product_variants.is_available`); "yok" varyant
//   perakendecide "Stokta yok" görünür ve sepete eklenemez (US-038 AC2; liste F3.12a, sepet F4.1).
// - `quantity`: miktarlı stok (F3.11a, iki adımlı geçiş S5 = B); bugün ayardan seçilemez.

export const STOCK_MODES = ['none', 'availability', 'quantity'] as const;
export type StockMode = (typeof STOCK_MODES)[number];

/** `PATCH /business/seller-profile` ile seçilebilen modlar (F3.10; `quantity` F3.11a'da). */
export const SELECTABLE_STOCK_MODES = ['none', 'availability'] as const;
export type SelectableStockMode = (typeof SELECTABLE_STOCK_MODES)[number];

export function isSelectableStockMode(value: unknown): value is SelectableStockMode {
  return typeof value === 'string' && (SELECTABLE_STOCK_MODES as readonly string[]).includes(value);
}

/**
 * Var/yok işareti varyantı siparişe kapatır mı (US-038 AC1–AC2). Yalnız `availability` modunda
 * işaret geçerlidir; `none` modunda saklanan işaret yok sayılır. `quantity` modunda karar miktara
 * göre verilir (F3.11a / F4.1), işaret yok sayılır.
 */
export function variantBlockedByStock(stockMode: StockMode, isAvailable: boolean): boolean {
  return stockMode === 'availability' && !isAvailable;
}

export interface InventoryAccess {
  readonly view: boolean;
  readonly manage: boolean;
}

/** Stok ekranı izinleri: görme `inventory.view`, var/yok yazma `inventory.manage`. */
export function inventoryAccess(codes: readonly string[]): InventoryAccess {
  return { view: codes.includes('inventory.view'), manage: codes.includes('inventory.manage') };
}
