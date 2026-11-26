'use client';
// Toptancının fiyat listeleri (F3.6b, US-034 AC1). UX kararları:
// - Başlık + "Yeni siyahı" (yalnız `pricing.manage`). Altında tek satırlık indigo not: fiyatlar ürün
//   sayfasında girilir (ürünlere bağlantı).
// - Tek kartta satırlar: ad + "Standart"/"Arxiv" rozeti; para birimi · ƏDV daxil/xaric oran ·
//   fiyat sayısı. Sıra: standart, aktifler ada göre, arşivliler sonda.
// - Satır eylemleri sağda: Düzəliş et, Standart et, Arxivlə (standart listede yok, K3), Bərpa et.
//   Arşiv geri alınabildiği için onay sorulmaz; müşteriye atanmış listede API 409 (K2 = A) mesajı
//   sayfanın üstünde `role="alert"`.
// - Boş: ilk listenin standart olacağını söyler.
import {
  type PriceListStatus,
  priceListActions,
  priceListFailureKey,
  pricingAccess,
  sortPriceLists,
} from '@b2b/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadFailed } from '../seller-settings/status';
import { useShell } from '../shell/use-shell';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type PriceList, usePriceListMutations, usePriceLists } from './api';
import { PriceListDialog } from './price-list-dialog';

export function PricesPage() {
  const t = useTranslations('prices');
  const tAll = useTranslations();
  const locale = useLocale();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const access = pricingAccess((shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code));
  const lists = usePriceLists(businessId);
  const { update } = usePriceListMutations(businessId);
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; list: PriceList }>();
  const [failure, setFailure] = useState<string>();
  const [done, setDone] = useState<string>();
  const items = sortPriceLists(lists.data ?? [], locale);
  const defaultCurrency = items[0]?.currency;

  function act(
    list: PriceList,
    body: { isDefault: true } | { status: PriceListStatus },
    note: string,
  ) {
    setFailure(undefined);
    setDone(undefined);
    update.mutate(
      { id: list.id, body },
      {
        onSuccess: () => {
          setDone(note);
        },
        onError: (error) => {
          setFailure(tAll(priceListFailureKey(error)));
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        action={
          access.manage ? (
            <Button
              onClick={() => {
                setDialog({ mode: 'create' });
              }}
            >
              {t('create_open')}
            </Button>
          ) : undefined
        }
      />
      <p className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-violet-50/60 px-4 py-3 text-sm text-indigo-800">
        {t('items_hint')}{' '}
        <Link
          href={`/${locale}/seller/products`}
          className="font-semibold underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600"
        >
          {t('items_hint_link')}
        </Link>
      </p>
      {failure !== undefined && (
        <p
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-700"
        >
          {failure}
        </p>
      )}
      {done !== undefined && (
        <p role="status" className="text-sm font-medium text-emerald-600">
          ✓ {done}
        </p>
      )}
      {lists.isError ? (
        <LoadFailed onRetry={() => void lists.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          {lists.isPending && (
            <ul aria-busy="true" className="divide-y divide-slate-100">
              {[0, 1].map((key) => (
                <li key={key} className="space-y-2 px-6 py-5">
                  <div className="h-4 w-1/4 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-3 w-1/3 animate-pulse rounded-lg bg-slate-100" />
                </li>
              ))}
            </ul>
          )}
          {lists.isSuccess &&
            (items.length === 0 ? (
              <div className="space-y-2 px-6 py-14 text-center">
                <p className="text-sm font-medium text-slate-900">{t('empty')}</p>
                <p className="text-sm text-slate-500">{t('empty_hint')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((list) => (
                  <PriceListRow
                    key={list.id}
                    list={list}
                    canManage={access.manage}
                    busy={update.isPending}
                    onEdit={() => {
                      setDialog({ mode: 'edit', list });
                    }}
                    onMakeDefault={() => {
                      act(list, { isDefault: true }, t('done.default', { name: list.name }));
                    }}
                    onArchive={() => {
                      act(list, { status: 'archived' }, t('done.archived', { name: list.name }));
                    }}
                    onRestore={() => {
                      act(list, { status: 'active' }, t('done.restored', { name: list.name }));
                    }}
                  />
                ))}
              </ul>
            ))}
        </Card>
      )}
      {dialog !== undefined && (
        <PriceListDialog
          businessId={businessId}
          list={dialog.mode === 'edit' ? dialog.list : undefined}
          first={items.length === 0}
          defaultCurrency={defaultCurrency}
          onClose={() => {
            setDialog(undefined);
          }}
          onSaved={(name) => {
            setFailure(undefined);
            setDone(t('done.saved', { name }));
            setDialog(undefined);
          }}
        />
      )}
    </div>
  );
}

function PriceListRow({
  list,
  canManage,
  busy,
  onEdit,
  onMakeDefault,
  onArchive,
  onRestore,
}: {
  list: PriceList;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onMakeDefault: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const t = useTranslations('prices');
  const actions = priceListActions(list, canManage);
  return (
    <li
      data-testid="price-list-row"
      data-name={list.name}
      className="flex flex-col gap-4 px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`text-base font-semibold break-words ${
              list.status === 'archived' ? 'text-slate-500' : 'text-slate-900'
            }`}
          >
            {list.name}
          </p>
          {list.isDefault && <Badge tone="emerald">{t('badge.default')}</Badge>}
          {list.status === 'archived' && <Badge tone="slate">{t('badge.archived')}</Badge>}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 tabular-nums">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
            {list.currency}
          </span>
          <span>
            {list.vatIncluded
              ? t('vat_included_rate', { rate: list.vatRate })
              : t('vat_excluded_rate', { rate: list.vatRate })}
          </span>
          <span className="text-slate-300">·</span>
          <span>{t('item_count', { count: list.itemCount })}</span>
        </p>
      </div>
      {(actions.canEdit || actions.canRestore) && (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {actions.canEdit && (
            <Button variant="secondary" disabled={busy} onClick={onEdit}>
              {t('action.edit')}
            </Button>
          )}
          {actions.canMakeDefault && (
            <Button variant="secondary" disabled={busy} onClick={onMakeDefault}>
              {t('action.make_default')}
            </Button>
          )}
          {actions.canArchive && (
            <Button variant="quiet-danger" disabled={busy} onClick={onArchive}>
              {t('action.archive')}
            </Button>
          )}
          {actions.canRestore && (
            <Button variant="secondary" disabled={busy} onClick={onRestore}>
              {t('action.restore')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
