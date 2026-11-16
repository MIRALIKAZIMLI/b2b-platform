// Ambalaj kuralları (F3.3a, US-030 AC2; kart K4). Miktarlar `numeric(14,3)` metni; hesap yalnız
// decimal.js ile (coding-guidelines §4.4: miktar da `number` değil). Saf fonksiyonlar: birim
// bilgisi çağırandan gelir. `checkOrderQuantity` sepet ve siparişte (F4) aynı kuralı uygular.
import { PACKAGING_LEVELS, type PackagingLevel } from '@b2b/shared';
import Decimal from 'decimal.js';

const Qty = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Kuralın ihtiyaç duyduğu ambalaj alanları (istek gövdesi veya veritabanı satırı). */
export interface PackagingShape {
  readonly level: PackagingLevel;
  readonly unitCode: string;
  readonly baseQty: string;
  readonly isSalesUnit: boolean;
  readonly minOrderQty: string;
  readonly orderMultiple: string;
}

export interface UnitFacts {
  readonly allowsDecimal: boolean;
}

export type FieldErrors = Record<string, string[]>;

function push(errors: FieldErrors, field: string, reason: string): void {
  const list = (errors[field] ??= []);
  if (!list.includes(reason)) list.push(reason);
}

function isInteger(value: Decimal): boolean {
  return value.isInteger();
}

const LEVEL_ORDER: ReadonlyMap<PackagingLevel, number> = new Map(
  PACKAGING_LEVELS.map((level, index) => [level, index]),
);

/**
 * Bir varyantın ambalaj listesindeki K4 ihlalleri; alan yolu `prefix.<j>.<alan>`.
 * Bilinmeyen birim burada denetlenmez (servis `not_found` / `inactive` verir); bilgisi olmayan
 * birimin ondalık kuralı atlanır.
 */
export function packagingProblems(
  packaging: readonly PackagingShape[],
  baseUnitCode: string,
  units: ReadonlyMap<string, UnitFacts>,
  prefix: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const seen = new Set<PackagingLevel>();
  const baseUnit = units.get(baseUnitCode);

  packaging.forEach((item, index) => {
    const at = `${prefix}.${String(index)}`;
    if (seen.has(item.level)) push(errors, `${at}.level`, 'duplicate');
    seen.add(item.level);

    const baseQty = new Qty(item.baseQty);
    if (item.level === 'unit') {
      if (!baseQty.eq(1)) push(errors, `${at}.baseQty`, 'must_be_one');
      if (item.unitCode !== baseUnitCode) push(errors, `${at}.unitCode`, 'must_match_base_unit');
    }
    if (baseUnit !== undefined && !baseUnit.allowsDecimal && !isInteger(baseQty)) {
      push(errors, `${at}.baseQty`, 'integer_required');
    }

    const min = new Qty(item.minOrderQty);
    const multiple = new Qty(item.orderMultiple);
    const unit = units.get(item.unitCode);
    if (unit !== undefined && !unit.allowsDecimal) {
      if (!isInteger(min)) push(errors, `${at}.minOrderQty`, 'integer_required');
      if (!isInteger(multiple)) push(errors, `${at}.orderMultiple`, 'integer_required');
    }
    if (min.lt(multiple) || !min.mod(multiple).isZero()) {
      push(errors, `${at}.minOrderQty`, 'not_multiple_of_order_multiple');
    }
  });

  // Seviye sırasıyla `baseQty` kesin artar (adet < iç paket < koli < palet).
  const ordered = packaging
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (LEVEL_ORDER.get(a.item.level) ?? 0) - (LEVEL_ORDER.get(b.item.level) ?? 0));
  for (let k = 1; k < ordered.length; k++) {
    const previous = ordered[k - 1];
    const current = ordered[k];
    if (previous === undefined || current === undefined) continue;
    if (previous.item.level === current.item.level) continue;
    if (!new Qty(current.item.baseQty).gt(new Qty(previous.item.baseQty))) {
      push(errors, `${prefix}.${String(current.index)}.baseQty`, 'not_increasing');
    }
  }

  if (!packaging.some((item) => item.isSalesUnit)) push(errors, prefix, 'sales_unit_required');
  return errors;
}

/** Satış birimi cinsinden miktarın temel birim karşılığı (ör. 3 koli × 24 = 72 adet). */
export function toBaseQty(packaging: Pick<PackagingShape, 'baseQty'>, qty: string): string {
  return new Qty(qty).mul(new Qty(packaging.baseQty)).toFixed();
}

export type OrderQuantityCheck =
  'ok' | 'invalid' | 'not_sales_unit' | 'below_minimum' | 'not_multiple' | 'integer_required';

/**
 * US-030 AC2: perakendeci yalnız satış biriminde, en az sipariş miktarından ve sipariş katlarında
 * sipariş verir. Ondalığa izin vermeyen birimde tam sayı.
 */
export function checkOrderQuantity(
  packaging: Pick<PackagingShape, 'isSalesUnit' | 'minOrderQty' | 'orderMultiple'>,
  unit: UnitFacts,
  qty: string,
): OrderQuantityCheck {
  if (!/^\d{1,11}(\.\d{1,3})?$/.test(qty)) return 'invalid';
  if (!packaging.isSalesUnit) return 'not_sales_unit';
  const value = new Qty(qty);
  if (value.lte(0)) return 'invalid';
  if (!unit.allowsDecimal && !value.isInteger()) return 'integer_required';
  if (value.lt(new Qty(packaging.minOrderQty))) return 'below_minimum';
  if (!value.mod(new Qty(packaging.orderMultiple)).isZero()) return 'not_multiple';
  return 'ok';
}
