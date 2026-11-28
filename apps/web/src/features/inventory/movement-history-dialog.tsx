'use client';
// Hareket geçmişi (F3.11b; US-039 AC1, AC7). Yeniden eskiye; tür, fark (koli + temel birim), parti,
// son kullanma, not ve tarih. Kayıtlar silinmez, değişmez (R35): pencere yalnız okur.
import { pickLocalizedText, trimQty } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/primitives';
import { type StockItem, useStockMovements } from './api';
import { useSignedQtyText } from './stock-qty';

export function MovementHistoryDialog({
  businessId,
  warehouseId,
  item,
  onClose,
}: {
  businessId: string | undefined;
  warehouseId: string;
  item: StockItem;
  onClose: () => void;
}) {
  const t = useTranslations('stock');
  const locale = useLocale();
  const id = useId();
  const signed = useSignedQtyText();
  const movements = useStockMovements(businessId, warehouseId, item.variantId);
  const rows = movements.data?.pages.flatMap((page) => page.items) ?? [];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onClose}>
      <div className="space-y-5" data-testid="stock-history">
        <div className="space-y-1">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900">
            {t('history.title')}
          </h2>
          <p className="text-sm text-slate-500">
            {pickLocalizedText(item.productName, locale) ?? item.sku} · {item.sku}
          </p>
        </div>
        {movements.isError ? (
          <p role="alert" className="text-sm text-rose-700">
            {t('history.failed')}
          </p>
        ) : movements.data === undefined ? (
          <p role="status" className="text-sm text-slate-500">
            {t('loading')}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('history.empty')}</p>
        ) : (
          <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
            {rows.map((row) => {
              const negative = row.onHandDelta.startsWith('-');
              const zero = trimQty(row.onHandDelta) === '0';
              return (
                <li key={row.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{t(`type.${row.type}`)}</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        zero ? 'text-slate-500' : negative ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {zero ? t('history.counted') : signed(row.onHandDelta, item)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {date.format(new Date(row.createdAt))}
                    {row.lotNo !== null && ` · ${t('history.lot', { lot: row.lotNo })}`}
                    {row.expiryDate !== null &&
                      ` · ${t('history.expiry', { date: row.expiryDate })}`}
                  </p>
                  {row.note !== null && <p className="text-xs text-slate-600">{row.note}</p>}
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex justify-end gap-2">
          {movements.hasNextPage && (
            <Button
              variant="secondary"
              disabled={movements.isFetchingNextPage}
              onClick={() => void movements.fetchNextPage()}
            >
              {t('more')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('history.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
