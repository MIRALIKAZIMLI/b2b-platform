// Stok modları (F3.10; US-038, ADR-0018). Mod toptancı ayarıdır (`seller_profiles.stock_mode`).
// - `none`: stok tutulmaz; her aktif varyant sipariş edilebilir (US-038 AC1).
// - `availability`: varyantın var/yok işareti (`product_variants.is_available`); "yok" varyant
//   perakendecide "Stokta yok" görünür ve sepete eklenemez (US-038 AC2; liste F3.12a, sepet F4.1).
// - `quantity`: miktarlı stok (F3.11a, iki adımlı geçiş S5 = B): stok önce girilir, sonra
//   `POST /stock-mode/quantity` ile açılır; satıcı profili PATCH'inde seçilemez.
import { z } from 'zod';

export const STOCK_MODES = ['none', 'availability', 'quantity'] as const;
export type StockMode = (typeof STOCK_MODES)[number];

/** `PATCH /business/seller-profile` ile seçilebilen modlar (F3.10; `quantity` ayrı uçla, F3.11a). */
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

/** data-model §4.10 `stock_movements.type`. F3.11a yalnız `receipt` ve `adjustment` yazar; diğerleri F4.4. */
export const STOCK_MOVEMENT_TYPES = [
  'receipt',
  'reserve',
  'release',
  'ship',
  'return',
  'adjustment',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** `POST /stock/movements` ile elle yazılan türler: mal girişi, sayım düzeltmesi (US-039 AC1, AC7). */
export const MANUAL_STOCK_MOVEMENT_TYPES = ['receipt', 'adjustment'] as const;
export type ManualStockMovementType = (typeof MANUAL_STOCK_MOVEMENT_TYPES)[number];

/** Stok miktarı metni: temel birimde, en çok 3 ondalık (`numeric(14,3)`); işaretsiz. */
export const STOCK_QTY_PATTERN = /^[0-9]{1,11}(\.[0-9]{1,3})?$/;

export const STOCK_LIST_LIMIT_MAX = 100;
export const STOCK_LOT_NO_MAX = 64;
export const STOCK_NOTE_MAX = 500;

const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

/** `POST /stock/movements` gövdesi (openapi; F3.11a). `qty` temel birimde; sayımda sayılan toplam. */
export const stockMovementCreateSchema = z.strictObject({
  warehouseId: z.uuid(),
  variantId: z.uuid(),
  type: z.enum(MANUAL_STOCK_MOVEMENT_TYPES),
  qty: z.string().regex(STOCK_QTY_PATTERN, 'invalid'),
  lotNo: z.string().trim().min(1).max(STOCK_LOT_NO_MAX).optional(),
  expiryDate: z.iso.date().optional(),
  note: z.string().trim().min(1).max(STOCK_NOTE_MAX).optional(),
});
export type StockMovementCreate = z.infer<typeof stockMovementCreateSchema>;

/** `GET /stock/movements` sorgusu. */
export const stockMovementsQuerySchema = z.strictObject({
  warehouseId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(STOCK_LIST_LIMIT_MAX).optional(),
});
export type StockMovementsQuery = z.infer<typeof stockMovementsQuerySchema>;

/** `GET /stock` sorgusu. */
export const stockQuerySchema = stockMovementsQuerySchema.extend({ low: queryBoolean.optional() });
export type StockQuery = z.infer<typeof stockQuerySchema>;

/** "Az qalan" / "Son X koli" eşiği (F3.11b, S1 = A): satış biriminde tam sayı, 0–9999. */
export const LOW_STOCK_THRESHOLD_PATTERN = /^(0|[1-9][0-9]{0,3})$/;

/** `GET /stock/items` süzgeci (F3.11b): hepsi, az qalan (sayılmış), sayılmamış. */
export const STOCK_ITEM_FILTERS = ['all', 'low', 'uncounted'] as const;
export type StockItemFilter = (typeof STOCK_ITEM_FILTERS)[number];
export const STOCK_ITEM_QUERY_MAX = 100;

/** `GET /stock/items` sorgusu: bir depodaki tüm satılabilir varyantlar (sayılmamışlar dahil). */
export const stockItemsQuerySchema = z.strictObject({
  warehouseId: z.uuid(),
  q: z.string().trim().min(1).max(STOCK_ITEM_QUERY_MAX).optional(),
  filter: z.enum(STOCK_ITEM_FILTERS).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(STOCK_LIST_LIMIT_MAX).optional(),
});
export type StockItemsQuery = z.infer<typeof stockItemsQuerySchema>;

/** `POST /stock-mode/quantity` gövdesi (S2 = A: sayılmamış varyant varken açık onay). */
export const quantityActivationSchema = z.strictObject({
  confirmUncounted: z.boolean().optional(),
});

const QTY_SCALE = 1000n;

/** `numeric(14,3)` metnini binde bir tamsayıya çevirir ("12.5" → 12500n, "-3" → -3000n). */
function toMilli(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const milli = BigInt(whole) * QTY_SCALE + BigInt(fraction.padEnd(3, '0').slice(0, 3));
  return negative ? -milli : milli;
}

function fromMilli(value: bigint, scale = 3): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(scale);
  const whole = abs / unit;
  const fraction = (abs % unit).toString().padStart(scale, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fraction === '' ? '' : `.${fraction}`}`;
}

/** Sayı metnini sadeleştirir ("144.000" → "144", "-2.500" → "-2.5"). */
export function trimQty(value: string): string {
  return fromMilli(toMilli(value));
}

/**
 * Ekranda girilen miktarı (seçilen ambalajda) temel birime çevirir (F3.11b K2). Sonuç
 * `STOCK_QTY_PATTERN`'e uymuyorsa (3 ondalığı aşar, çok büyük, negatif) null: alan hatası.
 * Girdi en çok 3 ondalık; çarpım 6 ondalığa çıkabilir, 3'ün ötesi sıfır değilse reddedilir.
 */
export function toBaseQty(qty: string, baseQtyPerUnit: string): string | null {
  const text = qty.trim().replace(',', '.');
  if (!STOCK_QTY_PATTERN.test(text) || !STOCK_QTY_PATTERN.test(baseQtyPerUnit)) return null;
  const micro = toMilli(text) * toMilli(baseQtyPerUnit);
  if (micro % QTY_SCALE !== 0n) return null;
  const result = fromMilli(micro / QTY_SCALE);
  return STOCK_QTY_PATTERN.test(result) ? result : null;
}

export interface QtyInUnits {
  /** Tam ambalaj sayısı (ör. 12 koli). */
  readonly units: string;
  /** Kalan temel birim (ör. 6 adet); 0 ise "0". */
  readonly remainder: string;
}

/**
 * Temel birimdeki miktarı ambalaja böler: `⌊miktar / ambalaj⌋` ve kalan (yuvarlama yok, F3.11b K1).
 * Negatif fark (sayım) işaretini tam kısma taşır. Ambalaj ≤ 0 ise null.
 */
export function splitByUnit(baseQty: string, baseQtyPerUnit: string): QtyInUnits | null {
  const per = toMilli(baseQtyPerUnit);
  if (per <= 0n) return null;
  const value = toMilli(baseQty);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const units = abs / per;
  const remainder = abs - units * per;
  return {
    units: `${negative && units > 0n ? '-' : ''}${units.toString()}`,
    remainder: `${negative && units === 0n && remainder > 0n ? '-' : ''}${fromMilli(remainder)}`,
  };
}

/** Sayım farkı önizlemesi (S1 = A): sayılan − mevcut, temel birimde. */
export function countDelta(countedBase: string, onHand: string): string {
  return fromMilli(toMilli(countedBase) - toMilli(onHand));
}

export type StockDisplayState = 'untracked' | 'in_stock' | 'low' | 'out_of_stock';

export interface StockDisplay {
  readonly state: StockDisplayState;
  /** `low` iken satış biriminde kalan tam sayı ("Son X koli"); diğer durumlarda null. */
  readonly lowQty: string | null;
}

export interface StockDisplayInput {
  readonly stockMode: StockMode;
  /** `availability` modunda var/yok işareti. */
  readonly isAvailable: boolean;
  /** `quantity` modunda aktif depoların satılabilir toplamı (temel birim, V6); sayılmamışsa null. */
  readonly availableBase: string | null;
  /** Satış biriminin içerdiği temel birim (`product_packaging.base_qty`, > 0). */
  readonly baseQtyPerUnit: string;
  /** "Son X" eşiği, satış biriminde (`seller_profiles.low_stock_display_threshold`, varsayılan 5). */
  readonly lowThreshold: string;
}

/**
 * Perakendeci ekranındaki stok gösterimi (US-039 AC6, V6; liste F3.12a). `quantity` modunda satış
 * birimi cinsinden tam kalan `⌊satılabilir / ambalaj⌋`: 0 ise "Stokta yok", eşiğe eşit veya altındaysa
 * "Son X koli", üstündeyse yalnız "Stokta". Sayılmamış varyant "Stokta yok" (kullanıcı kararı S2 = A).
 * `availability` modunda işaret, `none` modunda gösterim yok (`untracked`).
 */
export function stockDisplay(input: StockDisplayInput): StockDisplay {
  if (input.stockMode === 'none') return { state: 'untracked', lowQty: null };
  if (input.stockMode === 'availability') {
    return { state: input.isAvailable ? 'in_stock' : 'out_of_stock', lowQty: null };
  }
  const perUnit = toMilli(input.baseQtyPerUnit);
  if (input.availableBase === null || perUnit <= 0n) return { state: 'out_of_stock', lowQty: null };
  const available = toMilli(input.availableBase);
  const units = available > 0n ? available / perUnit : 0n;
  if (units <= 0n) return { state: 'out_of_stock', lowQty: null };
  if (units * QTY_SCALE <= toMilli(input.lowThreshold)) {
    return { state: 'low', lowQty: units.toString() };
  }
  return { state: 'in_stock', lowQty: null };
}
