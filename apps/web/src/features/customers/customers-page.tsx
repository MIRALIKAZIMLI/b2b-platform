'use client';
// Toptancının müşterileri (F2.14b; US-024, openapi `GET /api/v1/connections`). UX kararları:
// - Başlık + açıklama; altında iki sekme: Aktiv / Ləğv edilib (varsayılan Aktiv). Temsilci
//   (`assigned`) aynı ekranı yalnız kendisine atanmış müşterilerle görür (sunucu süzer).
// - Liste tek kart içinde satırlar: ünvan, bağlantı tarihi; sağda koşul özeti (limit `tabular-nums`,
//   vade, temsilci) ve durum. Koşulu atanmamış aktif satırda amber "Şərtlər təyin edilməyib" rozeti
//   (US-024 AC1); varsayılan fiyat listesi geçerli olduğu alt satırda yazar.
// - Ana eylem satır başına "Şərtləri təyin et / dəyiş" (yalnız `connections.terms.manage`); pencere
//   öneriyle dolu açılır (US-024 AC3). İptal edilmiş satırda eylem yok.
// - Boş: sekmeye göre iki metin + dizine bağlantı; yükleniyor = iskelet; hata = yeniden dene.
// F2.15b (US-025): aynı ekran perakendecide "Toptancılarım" (`side = buyer`): temsilci sütunu ve
// koşul eylemi yok. Aktif satırda sessiz tehlike düğmesi "Ləğv et" (`connections.cancel`) iptal
// penceresini açar; iptal edilmiş satırda kimin iptal ettiği yazar (gerekçe yok, K2 = A). Perakendecide
// "yeniden bağlan" hiçbir yerde yok (US-025 AC6).
import {
  connectionEndedLabel,
  CREDIT_LIMIT_CURRENCY,
  type ConnectionStatus,
  customersAccess,
  formatMoney,
} from '@b2b/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { useConnectionContext } from '../connection-requests/context';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type ConnectionItem, useConnections, useSalesReps } from './api';
import { CancelDialog } from './cancel-dialog';
import { TermsDialog } from './terms-dialog';

const TABS: readonly ConnectionStatus[] = ['active', 'cancelled'];

type Side = 'seller' | 'buyer';

function CustomerRow({
  item,
  side,
  repName,
  canManage,
  canCancel,
  onEdit,
  onCancel,
}: {
  item: ConnectionItem;
  side: Side;
  repName: string | undefined;
  canManage: boolean;
  canCancel: boolean;
  onEdit: (item: ConnectionItem) => void;
  onCancel: (item: ConnectionItem) => void;
}) {
  const t = useTranslations('customers');
  const { formatDay, locale } = useConnectionContext();
  const active = item.status === 'active';
  const limit =
    item.terms.creditLimit === null
      ? t('row.no_limit')
      : formatMoney(
          { amount: item.terms.creditLimit, currency: CREDIT_LIMIT_CURRENCY.code },
          locale,
          CREDIT_LIMIT_CURRENCY,
        );
  return (
    <li className="flex flex-col gap-4 px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {item.counterpartyName === null ? (
            <p className="text-sm text-slate-400 italic">{t('closed_business')}</p>
          ) : (
            <p className="truncate text-base font-semibold text-slate-900">
              {item.counterpartyName}
            </p>
          )}
          {active && !item.termsAssigned && <Badge tone="amber">{t('row.not_assigned')}</Badge>}
          {!active && <Badge tone="slate">{t('row.cancelled')}</Badge>}
        </div>
        <p className="text-sm text-slate-500 tabular-nums">
          {t('row.since', { date: formatDay(item.startedAt) })}
          {item.endedAt !== null && <> · {t('row.ended', { date: formatDay(item.endedAt) })}</>}
        </p>
        {!active && item.endedBySide !== null && (
          <p className="text-xs text-slate-500">
            {t(`row.${connectionEndedLabel(item.endedBySide, side)}`)}
          </p>
        )}
        {active && !item.termsAssigned && (
          <p className="text-xs text-slate-500">{t('row.default_price_list')}</p>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
        <dl
          className={`grid gap-4 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm shadow-sm backdrop-blur ${
            side === 'seller' ? 'grid-cols-3 sm:min-w-[22rem]' : 'grid-cols-2 sm:min-w-[15rem]'
          }`}
        >
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">{t('row.credit_limit')}</dt>
            <dd className="truncate font-semibold text-slate-900 tabular-nums">{limit}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">{t('row.payment_term')}</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {t('row.days', { days: item.terms.paymentTermDays })}
            </dd>
          </div>
          {side === 'seller' && (
            <div className="min-w-0">
              <dt className="text-xs text-slate-500">{t('row.sales_rep')}</dt>
              <dd className="truncate font-semibold text-slate-900">
                {item.terms.salesRepMembershipId === null ||
                item.terms.salesRepMembershipId === undefined
                  ? t('row.no_rep')
                  : (repName ?? t('row.rep_unknown'))}
              </dd>
            </div>
          )}
        </dl>
        {active && canManage && (
          <Button
            variant={item.termsAssigned ? 'secondary' : 'primary'}
            onClick={() => {
              onEdit(item);
            }}
          >
            {item.termsAssigned ? t('row.edit') : t('row.assign')}
          </Button>
        )}
        {active && canCancel && (
          <Button
            variant="quiet-danger"
            onClick={() => {
              onCancel(item);
            }}
          >
            {t('row.cancel')}
          </Button>
        )}
      </div>
    </li>
  );
}

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      <Card className="divide-y divide-slate-100">
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex items-center justify-between gap-6 px-6 py-5">
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded-full bg-slate-200/80" />
              <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="hidden h-12 w-80 animate-pulse rounded-2xl bg-slate-100 sm:block" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export function CustomersPage({ side = 'seller' }: { side?: Side }) {
  const t = useTranslations('customers');
  // Sayfa düzeyi metinler tarafa göre (`customers` / `suppliers`); satır metinleri ortak.
  const tPage = useTranslations(side === 'seller' ? 'customers' : 'suppliers');
  const tErrors = useTranslations('errors');
  const { shell, locale } = useConnectionContext();
  const codes = (shell.me?.activeBusiness?.permissions ?? []).map((item) => item.code);
  const access = customersAccess(codes);
  const [tab, setTab] = useState<ConnectionStatus>('active');
  const [editing, setEditing] = useState<ConnectionItem | undefined>();
  const [cancelling, setCancelling] = useState<ConnectionItem | undefined>();
  const list = useConnections(access.view ? shell.activeBusinessId : undefined, tab);
  const manage = side === 'seller' && access.manage;
  const reps = useSalesReps(manage ? shell.activeBusinessId : undefined);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const repNames = useMemo(
    () => new Map((reps.data?.items ?? []).map((item) => [item.membershipId, item.fullName])),
    [reps.data],
  );
  const directoryLink =
    side === 'seller' && codes.includes('directory.search') ? (
      <Link
        href={`/${locale}/seller/directory`}
        className="inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
      >
        {t('go_directory')}
      </Link>
    ) : undefined;

  if (shell.me !== undefined && !access.view) {
    return (
      <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
        <PageHeader title={tPage('title')} />
        <Card className="max-w-xl p-8">
          <p role="alert" className="text-sm text-slate-600">
            {tPage('no_access')}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader
        title={tPage('title')}
        description={tPage('description')}
        action={directoryLink}
      />
      <div
        role="tablist"
        aria-label={t('tabs_label')}
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur"
      >
        {TABS.map((key) => {
          const selected = key === tab;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setTab(key);
              }}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                selected
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {t(`tab.${key}`)}
            </button>
          );
        })}
      </div>

      {list.isError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            {tErrors(list.error instanceof ApiError ? list.error.code : 'INTERNAL_ERROR')}
          </span>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : list.data === undefined ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 bg-gradient-to-br from-white to-indigo-50/40 p-8">
          <h2 className="text-base font-semibold text-slate-900">{tPage('empty_title')}</h2>
          <p className="max-w-xl text-sm text-slate-500">
            {tab === 'active' ? tPage('empty_active') : tPage('empty_cancelled')}
          </p>
          {tab === 'active' && directoryLink}
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <CustomerRow
                  key={item.id}
                  item={item}
                  repName={
                    item.terms.salesRepMembershipId === null ||
                    item.terms.salesRepMembershipId === undefined
                      ? undefined
                      : repNames.get(item.terms.salesRepMembershipId)
                  }
                  side={side}
                  canManage={manage}
                  canCancel={access.cancel}
                  onEdit={setEditing}
                  onCancel={setCancelling}
                />
              ))}
            </ul>
          </Card>
          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? t('loading') : t('more')}
              </Button>
            </div>
          )}
        </div>
      )}
      {cancelling !== undefined && (
        <CancelDialog
          connectionId={cancelling.id}
          name={cancelling.counterpartyName ?? t('closed_business')}
          side={side}
          onClose={() => {
            setCancelling(undefined);
          }}
        />
      )}
      {editing !== undefined && (
        <TermsDialog
          connection={editing}
          onClose={() => {
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
