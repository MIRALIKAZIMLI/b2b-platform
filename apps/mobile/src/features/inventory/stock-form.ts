// Depo stok ekranı saf kuralları — mobil (F3.11d; US-039 AC1, AC6, AC7). Web F3.11b ile aynı:
// miktar en büyük satış biriminde ("koli") + kalan temel birim (K1); girişte birim seçilir,
// sunucuya her zaman temel birim gider (K2, `@b2b/shared` `toBaseQty`). Sayımda raftaki toplam
// yazılır (F3.11a S1 = A). Ekran bileşenleri bu modülü kullanır; testler Node'da çalışır.
import {
  countDelta,
  splitByUnit,
  STOCK_LOT_NO_MAX,
  STOCK_NOTE_MAX,
  toBaseQty,
  trimQty,
} from '@b2b/shared';
import type { MovementInput, StockItem } from './api';

/** Birim seçicide temel birimin değeri (ambalaj seviyeleriyle çakışmaz). */
export const BASE_CHOICE = 'base';

export interface UnitChoice {
  /** Ambalaj seviyesi (`case`, `inner`…) veya `BASE_CHOICE`. */
  readonly value: string;
  readonly unitCode: string;
  /** Bir birimdeki temel birim miktarı. */
  readonly baseQty: string;
}

type Packs = Pick<StockItem, 'packaging' | 'displayUnit' | 'baseUnitCode'>;

/** Seçilebilir birimler: 1'den büyük ambalajlar (küçükten büyüğe) + temel birim. */
export function unitChoices(item: Packs): UnitChoice[] {
  const packs = item.packaging
    .filter((p) => trimQty(p.baseQty) !== '1')
    .map((p) => ({ value: p.level, unitCode: p.unitCode, baseQty: p.baseQty }));
  return [...packs, { value: BASE_CHOICE, unitCode: item.baseUnitCode, baseQty: '1' }];
}

/** Varsayılan birim: ekrandaki satış birimi ("koli"), yoksa temel birim. */
export function defaultUnitChoice(item: Packs): string {
  const display = item.displayUnit;
  if (display === null) return BASE_CHOICE;
  const match = unitChoices(item).find(
    (c) => c.value !== BASE_CHOICE && c.unitCode === display.unitCode,
  );
  return match?.value ?? BASE_CHOICE;
}

export type StockStatus = 'uncounted' | 'out' | 'low' | 'in';

/** Kart rozeti (F3.11b ile aynı sıra): sayılmamış → bitib → az qalıb (API `low`) → var. */
export function stockStatus(item: Pick<StockItem, 'counted' | 'available' | 'low'>): StockStatus {
  if (!item.counted) return 'uncounted';
  if (item.available !== null && trimQty(item.available) === '0') return 'out';
  if (item.low) return 'low';
  return 'in';
}

export interface QtyParts {
  /** Ambalajlı gösterim: "12" koli + "6" temel; ambalaj yoksa veya bir koliden azsa null. */
  readonly packed: {
    readonly units: string;
    readonly unitCode: string;
    readonly rest: string;
  } | null;
  /** Temel birimde sadeleştirilmiş miktar ("294"). */
  readonly base: string;
}

/** Temel birimdeki miktarı ekran parçalarına böler (yuvarlama yok, F3.11b K1). */
export function qtyParts(baseQty: string, item: Pick<StockItem, 'displayUnit'>): QtyParts {
  const base = trimQty(baseQty);
  const display = item.displayUnit;
  if (display === null || trimQty(display.baseQty) === '1') return { packed: null, base };
  const split = splitByUnit(baseQty, display.baseQty);
  if (split === null || split.units === '0' || split.units === '-0') return { packed: null, base };
  return {
    packed: { units: split.units, unitCode: display.unitCode, rest: split.remainder },
    base,
  };
}

export type QtyError = 'qty_positive' | 'qty_invalid';

/**
 * Girilen miktar + seçilen birim → temel birim. Mal girişinde 0 kabul edilmez (`qty_positive`);
 * sayımda 0 geçerli (raf boş). Boş, harf, 3 ondalığı aşan sonuç `qty_invalid` (mal girişinde
 * `qty_positive`, web ile aynı ileti).
 */
export function baseQtyOf(
  type: MovementInput['type'],
  qty: string,
  choice: UnitChoice | undefined,
): { readonly ok: true; readonly qty: string } | { readonly ok: false; readonly error: QtyError } {
  const fail = {
    ok: false as const,
    error: type === 'receipt' ? 'qty_positive' : 'qty_invalid',
  } as const;
  if (choice === undefined || qty.trim() === '') return fail;
  const base = toBaseQty(qty, choice.baseQty);
  if (base === null) return fail;
  if (type === 'receipt' && trimQty(base) === '0') return fail;
  return { ok: true, qty: base };
}

export type CountPreview =
  | { readonly kind: 'first' }
  | { readonly kind: 'same' }
  | { readonly kind: 'delta'; readonly delta: string };

/** Sayım önizlemesi: ilk sayım, fark yok veya işaretli fark (sayılan − mevcut, temel birim). */
export function countPreview(
  countedBase: string,
  item: Pick<StockItem, 'counted' | 'onHand'>,
): CountPreview {
  const delta = countDelta(countedBase, item.onHand ?? '0');
  if (trimQty(delta) === '0') return item.counted ? { kind: 'same' } : { kind: 'first' };
  return { kind: 'delta', delta };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Son kullanma tarihi metni YYYY-AA-GG ve takvimde var mı (K3: tarih seçici paketi yok). */
export function isExpiryDate(text: string): boolean {
  const match = DATE_PATTERN.exec(text.trim());
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth =
    [
      31,
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ][month - 1] ?? 0;
  return day <= daysInMonth;
}

export interface MovementDraft {
  readonly type: MovementInput['type'];
  readonly qty: string;
  readonly unit: string;
  readonly lotNo: string;
  readonly expiry: string;
  readonly note: string;
}

export type DraftResult =
  | { readonly ok: true; readonly body: MovementInput }
  | { readonly ok: false; readonly field: 'qty'; readonly error: QtyError }
  | { readonly ok: false; readonly field: 'expiry'; readonly error: 'expiry_invalid' };

/**
 * Sayfadaki taslaktan istek gövdesi. Parti, son kullanma yalnız mal girişinde; boş alan
 * gönderilmez. Uzunluklar `@b2b/shared` sınırlarına kesilir (alan da `maxLength` taşır).
 */
export function buildMovement(
  draft: MovementDraft,
  item: Packs & Pick<StockItem, 'variantId'>,
  warehouseId: string,
): DraftResult {
  const choice = unitChoices(item).find((c) => c.value === draft.unit);
  const qty = baseQtyOf(draft.type, draft.qty, choice);
  if (!qty.ok) return { ok: false, field: 'qty', error: qty.error };
  const receipt = draft.type === 'receipt';
  const expiry = draft.expiry.trim();
  if (receipt && expiry !== '' && !isExpiryDate(expiry)) {
    return { ok: false, field: 'expiry', error: 'expiry_invalid' };
  }
  const lotNo = draft.lotNo.trim().slice(0, STOCK_LOT_NO_MAX);
  const note = draft.note.trim().slice(0, STOCK_NOTE_MAX);
  return {
    ok: true,
    body: {
      warehouseId,
      variantId: item.variantId,
      type: draft.type,
      qty: qty.qty,
      ...(receipt && lotNo !== '' ? { lotNo } : {}),
      ...(receipt && expiry !== '' ? { expiryDate: expiry } : {}),
      ...(note !== '' ? { note } : {}),
    },
  };
}
