'use client';
// Depo ekranında miktar gösterimi (F3.11b K1): API sayıları temel birimde verir; ekranda en büyük
// satış birimine ("koli") bölünür, kalan temel birimde yazılır ("12 koli + 6 əd · 294 əd").
// Birim kısaltması katalogdan (`/catalog/units`); bulunamazsa UN/ECE kodu.
import { pickLocalizedText, splitByUnit, trimQty } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type Unit, useUnits } from '../products/api';
import type { StockItem } from './api';

export function useUnitAbbr(): (code: string) => string {
  const locale = useLocale();
  const units = useUnits();
  const byCode = new Map<string, Unit>((units.data ?? []).map((unit) => [unit.code, unit]));
  return (code) => {
    const unit = byCode.get(code);
    return unit === undefined ? code : (pickLocalizedText(unit.abbreviation, locale) ?? code);
  };
}

/** "12 koli + 6 əd" (ambalajlı) ve "294 əd" (temel); ambalaj yoksa yalnız temel. */
export function useQtyText(): (
  baseQty: string,
  item: Pick<StockItem, 'baseUnitCode' | 'displayUnit'>,
) => { primary: string; base: string | null } {
  const t = useTranslations('stock');
  const abbr = useUnitAbbr();
  return (baseQty, item) => {
    const base = t('qty.amount', { qty: trimQty(baseQty), unit: abbr(item.baseUnitCode) });
    const display = item.displayUnit;
    if (display === null || trimQty(display.baseQty) === '1') return { primary: base, base: null };
    const split = splitByUnit(baseQty, display.baseQty);
    // Bir ambalajdan az (0 dahil) ise yalnız temel birim: "0 koli + 5 əd" yerine "5 əd".
    if (split === null || split.units === '0') return { primary: base, base: null };
    const units = t('qty.amount', { qty: split.units, unit: abbr(display.unitCode) });
    const primary =
      split.remainder === '0'
        ? units
        : t('qty.with_rest', {
            units,
            rest: t('qty.amount', { qty: split.remainder, unit: abbr(item.baseUnitCode) }),
          });
    return { primary, base };
  };
}

/** İşaretli fark ("+2 koli", "−8 əd"): mutlak değer ambalaja bölünür, işaret başa yazılır. */
export function useSignedQtyText(): (
  delta: string,
  item: Pick<StockItem, 'baseUnitCode' | 'displayUnit'>,
) => string {
  const qtyText = useQtyText();
  return (delta, item) => {
    const negative = delta.startsWith('-');
    const text = qtyText(negative ? delta.slice(1) : delta, item);
    const body = text.base === null ? text.primary : `${text.primary} (${text.base})`;
    return `${negative ? '−' : '+'}${body}`;
  };
}
