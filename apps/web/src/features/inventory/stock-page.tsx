'use client';
// Depo stok ekranı (F3.11b; US-039 AC1, AC6, AC7). UX kararları:
// - Başlık altında mod şeridi: mod `quantity` değilse stok sayılabilir ama perakendeci görmez;
//   "Ayarlar > Stok"tan açılır (S5 = B iki adım).
// - Araç çubuğu: depo seçici (tek depo varsa yalnız ad), arama, süzgeç sekmeleri (Hamısı / Az qalan /
//   Sayılmayıb). Arama 300 ms bekler.
// - Masaüstünde tablo, dar ekranda kart: ürün + SKU, mövcud (koli + kalan, altında temel birim),
//   rezerv, satılabilir, durum rozeti. Satır eylemleri: Mal girişi, Sayım (yalnız `inventory.manage`),
//   Tarixçə (sayılmış satırda).
// - İşlem sonrası tek satırlık yeşil durum; liste yenilenir.
import {
  inventoryAccess,
  pickLocalizedText,
  STOCK_ITEM_FILTERS,
  type StockItemFilter,
  trimQty,
} from '@b2b/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LoadFailed } from '../seller-settings/status';
import { useShell } from '../shell/use-shell';
import { Badge, Button, Card, PageHeader, SelectInput, TextInput } from '../ui/primitives';
import { type StockItem, useStockItems, useStockMode, useStockWarehouses } from './api';
import { MovementDialog } from './movement-dialog';
import { MovementHistoryDialog } from './movement-history-dialog';
import { useQtyText } from './stock-qty';

type DialogState =
  { kind: 'receipt' | 'adjustment'; item: StockItem } | { kind: 'history'; item: StockItem };

export function StockPage() {
  const t = useTranslations('stock');
  const locale = useLocale();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const access = inventoryAccess((shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code));
  const mode = useStockMode(businessId);
  const warehouses = useStockWarehouses(businessId);
  const [warehouseId, setWarehouseId] = useState<string>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StockItemFilter>('all');
  const [dialog, setDialog] = useState<DialogState>();
  const [done, setDone] = useState<string>();
  const qtyText = useQtyText();

  useEffect(() => {
    const list = warehouses.data ?? [];
    if (warehouseId !== undefined && list.some((w) => w.id === warehouseId)) return;
    setWarehouseId((list.find((w) => w.isDefault) ?? list[0])?.id);
  }, [warehouses.data, warehouseId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  const items = useStockItems(businessId, { warehouseId, q, filter });
  const rows = items.data?.pages.flatMap((page) => page.items) ?? [];
  const warehouseList = warehouses.data ?? [];

  const name = (item: StockItem) => pickLocalizedText(item.productName, locale) ?? item.sku;

  function status(item: StockItem) {
    if (!item.counted) return <Badge tone="slate">{t('status.uncounted')}</Badge>;
    if (item.available !== null && trimQty(item.available) === '0') {
      return <Badge tone="amber">{t('status.out')}</Badge>;
    }
    if (item.low) return <Badge tone="amber">{t('status.low')}</Badge>;
    return <Badge tone="emerald">{t('status.in')}</Badge>;
  }

  function actions(item: StockItem) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {access.manage && (
          <>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              data-testid={`stock-receipt-${item.sku}`}
              onClick={() => {
                setDone(undefined);
                setDialog({ kind: 'receipt', item });
              }}
            >
              {t('action.receipt')}
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              data-testid={`stock-count-${item.sku}`}
              onClick={() => {
                setDone(undefined);
                setDialog({ kind: 'adjustment', item });
              }}
            >
              {t('action.count')}
            </Button>
          </>
        )}
        {item.counted && (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => {
              setDialog({ kind: 'history', item });
            }}
          >
            {t('action.history')}
          </Button>
        )}
      </div>
    );
  }

  function qtyCell(value: string | null, item: StockItem) {
    if (value === null) return <span className="text-slate-400">—</span>;
    const text = qtyText(value, item);
    return (
      <span className="flex flex-col">
        <span className="font-medium whitespace-nowrap text-slate-900 tabular-nums">
          {text.primary}
        </span>
        {text.base !== null && (
          <span className="text-xs text-slate-500 tabular-nums">{text.base}</span>
        )}
      </span>
    );
  }

  const body = (() => {
    if (warehouses.isError) return <LoadFailed onRetry={() => void warehouses.refetch()} />;
    if (warehouses.data !== undefined && warehouseList.length === 0) {
      return (
        <Card className="p-8 text-center text-sm text-slate-600">
          <p>{t('no_warehouse')}</p>
        </Card>
      );
    }
    if (items.isError) return <LoadFailed onRetry={() => void items.refetch()} />;
    if (items.data === undefined) {
      return (
        <Card className="p-8 text-center text-sm text-slate-500">
          <p role="status">{t('loading')}</p>
        </Card>
      );
    }
    if (rows.length === 0) {
      return (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium text-slate-900">{t(`empty.${filter}`)}</p>
          {filter === 'all' && q === '' && (
            <p className="mt-1 text-sm text-slate-500">
              <Link
                href={`/${locale}/seller/products`}
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t('empty.products_link')}
              </Link>
            </p>
          )}
        </Card>
      );
    }
    return (
      <Card className="overflow-hidden">
        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-slate-200/80 bg-slate-50/60 text-xs font-medium tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-3">{t('col.product')}</th>
              <th className="px-5 py-3">{t('col.on_hand')}</th>
              <th className="px-5 py-3">{t('col.reserved')}</th>
              <th className="px-5 py-3">{t('col.available')}</th>
              <th className="px-5 py-3">{t('col.status')}</th>
              <th className="px-5 py-3">
                <span className="sr-only">{t('col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((item) => (
              <tr
                key={item.variantId}
                data-testid={`stock-row-${item.sku}`}
                className="transition-colors hover:bg-slate-50/60"
              >
                <td className="px-5 py-4">
                  <span className="block font-medium text-slate-900">{name(item)}</span>
                  <span className="block text-xs text-slate-500">{item.sku}</span>
                </td>
                <td className="px-5 py-4" data-testid={`stock-on-hand-${item.sku}`}>
                  {qtyCell(item.onHand, item)}
                </td>
                <td className="px-5 py-4">{qtyCell(item.reserved, item)}</td>
                <td className="px-5 py-4">{qtyCell(item.available, item)}</td>
                <td className="px-5 py-4">{status(item)}</td>
                <td className="px-5 py-4">{actions(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-slate-100 md:hidden">
          {rows.map((item) => (
            <li key={item.variantId} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{name(item)}</p>
                  <p className="text-xs text-slate-500">{item.sku}</p>
                </div>
                {status(item)}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">{t('col.on_hand')}</dt>
                  <dd>{qtyCell(item.onHand, item)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{t('col.available')}</dt>
                  <dd>{qtyCell(item.available, item)}</dd>
                </div>
              </dl>
              {actions(item)}
            </li>
          ))}
        </ul>
        {items.hasNextPage && (
          <div className="border-t border-slate-100 p-4 text-center">
            <Button
              variant="secondary"
              disabled={items.isFetchingNextPage}
              onClick={() => void items.fetchNextPage()}
            >
              {t('more')}
            </Button>
          </div>
        )}
      </Card>
    );
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {mode.data !== undefined && mode.data !== 'quantity' && (
        <p
          data-testid="stock-mode-banner"
          className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-violet-50/60 px-4 py-3 text-sm text-indigo-800"
        >
          {t('mode_banner')}{' '}
          <Link
            href={`/${locale}/seller/settings?tab=stock`}
            className="font-semibold underline-offset-2 hover:underline"
          >
            {t('mode_banner_link')}
          </Link>
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {warehouseList.length > 1 ? (
          <div className="sm:w-56">
            <label htmlFor="stock-warehouse" className="sr-only">
              {t('warehouse')}
            </label>
            <SelectInput
              id="stock-warehouse"
              value={warehouseId ?? ''}
              onChange={(event) => {
                setWarehouseId(event.target.value);
              }}
            >
              {warehouseList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectInput>
          </div>
        ) : (
          warehouseList[0] !== undefined && (
            <p className="text-sm font-medium text-slate-700">{warehouseList[0].name}</p>
          )
        )}
        <div className="sm:flex-1">
          <label htmlFor="stock-search" className="sr-only">
            {t('search')}
          </label>
          <TextInput
            id="stock-search"
            type="search"
            value={search}
            placeholder={t('search')}
            maxLength={100}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        <div
          role="tablist"
          aria-label={t('filter_label')}
          className="inline-flex rounded-xl border border-slate-200/80 bg-slate-50/60 p-1"
        >
          {STOCK_ITEM_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              data-testid={`stock-filter-${key}`}
              onClick={() => {
                setFilter(key);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                filter === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t(`filter.${key}`)}
            </button>
          ))}
        </div>
      </div>
      {done !== undefined && (
        <p role="status" className="text-sm font-medium text-emerald-600">
          ✓ {done}
        </p>
      )}
      {body}
      {dialog !== undefined && warehouseId !== undefined && dialog.kind !== 'history' && (
        <MovementDialog
          businessId={businessId}
          warehouseId={warehouseId}
          item={dialog.item}
          type={dialog.kind}
          onClose={() => {
            setDialog(undefined);
          }}
          onDone={(note) => {
            setDialog(undefined);
            setDone(note);
          }}
        />
      )}
      {dialog?.kind === 'history' && warehouseId !== undefined && (
        <MovementHistoryDialog
          businessId={businessId}
          warehouseId={warehouseId}
          item={dialog.item}
          onClose={() => {
            setDialog(undefined);
          }}
        />
      )}
    </div>
  );
}
