// Miktar metni (F3.11d K2 = web F3.11b K1): "12 koli + 6 əd" ve altında "294 əd". Birim kısaltması
// katalogdan (`/catalog/units`); bulunamazsa UN/ECE kodu.
import { pickLocalizedText } from '@b2b/shared';
import { useTranslation } from 'react-i18next';
import type { StockItem } from './api';
import { useUnits } from './queries';
import { qtyParts } from './stock-form';

export function useUnitAbbr(): (code: string) => string {
  const { i18n } = useTranslation();
  const units = useUnits();
  const byCode = new Map((units.data ?? []).map((unit) => [unit.code, unit]));
  return (code) => {
    const unit = byCode.get(code);
    return unit === undefined
      ? code
      : (pickLocalizedText(unit.abbreviation, i18n.language) ?? code);
  };
}

type QtyItem = Pick<StockItem, 'baseUnitCode' | 'displayUnit'>;

export function useQtyText(): (
  baseQty: string,
  item: QtyItem,
) => {
  primary: string;
  base: string | null;
} {
  const { t } = useTranslation();
  const abbr = useUnitAbbr();
  return (baseQty, item) => {
    const parts = qtyParts(baseQty, item);
    const base = t('stock.qty.amount', { qty: parts.base, unit: abbr(item.baseUnitCode) });
    if (parts.packed === null) return { primary: base, base: null };
    const units = t('stock.qty.amount', {
      qty: parts.packed.units,
      unit: abbr(parts.packed.unitCode),
    });
    const primary =
      parts.packed.rest === '0'
        ? units
        : t('stock.qty.with_rest', {
            units,
            rest: t('stock.qty.amount', { qty: parts.packed.rest, unit: abbr(item.baseUnitCode) }),
          });
    return { primary, base };
  };
}

/** İşaretli fark ("+2 koli (24 əd)", "−8 əd"). */
export function useSignedQtyText(): (delta: string, item: QtyItem) => string {
  const qtyText = useQtyText();
  return (delta, item) => {
    const negative = delta.startsWith('-');
    const text = qtyText(negative ? delta.slice(1) : delta, item);
    const body = text.base === null ? text.primary : `${text.primary} (${text.base})`;
    return `${negative ? '−' : '+'}${body}`;
  };
}
