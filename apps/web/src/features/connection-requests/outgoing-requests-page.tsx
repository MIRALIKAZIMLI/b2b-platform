'use client';
// Gönderilen bağlantı istekleri (F2.12b; US-021, openapi `GET .../outgoing`). UX kararları:
// - Üstte başlık + "Pərakəndəçi tap" (dizine) ikincil eylem; altında durum süzgeci (Hamısı,
//   Gözləyir, Qəbul edildi, Rədd edildi, Müddəti bitdi, Geri çəkildi) tek sekme çubuğu.
// - Liste tek kart içinde satırlar: ünvan (kapanmış işletmede silik not), durum rozeti, gönderilme
//   tarihi; bekleyende son yanıt tarihi; mesaj iki satıra kısalır; önerilen vade `tabular-nums`.
// - Boş durum süzgece göre iki metin; yükleniyor = iskelet satırlar; hata = yeniden dene.
// - F2.13b: bekleyen satırda "Geri çək" (sessiz tehlike) onay penceresi açar (US-022 AC1).
import { CONNECTION_REQUEST_STATUSES, type ConnectionRequestStatus } from '@b2b/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type OutgoingRequest, useOutgoingRequests } from './api';
import { ConfirmDialog } from './confirm-dialog';
import { useConnectionContext } from './context';

const FILTERS = ['all', ...CONNECTION_REQUEST_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

const TONE: Record<ConnectionRequestStatus, 'amber' | 'emerald' | 'slate'> = {
  pending: 'amber',
  accepted: 'emerald',
  rejected: 'slate',
  expired: 'slate',
  withdrawn: 'slate',
};

function RequestRow({
  item,
  onWithdraw,
}: {
  item: OutgoingRequest;
  onWithdraw: (item: OutgoingRequest) => void;
}) {
  const t = useTranslations('connections');
  const { formatDay, canSend } = useConnectionContext();
  return (
    <li className="flex flex-col gap-3 px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {item.buyerName === null ? (
          <p className="text-sm text-slate-400 italic">{t('outgoing.closed_business')}</p>
        ) : (
          <p className="truncate text-base font-semibold text-slate-900">{item.buyerName}</p>
        )}
        <p className="text-sm text-slate-500 tabular-nums">
          {item.createdAt !== undefined &&
            t('outgoing.sent_at', { date: formatDay(item.createdAt) })}
          {item.status === 'pending' && item.expiresAt !== undefined && (
            <> · {t('outgoing.expires_at', { date: formatDay(item.expiresAt) })}</>
          )}
        </p>
        {item.message !== null && item.message !== undefined && (
          <p className="line-clamp-2 max-w-2xl text-sm break-words text-slate-600">
            {item.message}
          </p>
        )}
        {item.proposedPaymentTermDays !== null && item.proposedPaymentTermDays !== undefined && (
          <p className="text-xs font-medium text-slate-500 tabular-nums">
            {t('outgoing.term', { days: item.proposedPaymentTermDays })}
          </p>
        )}
      </div>
      {item.status !== undefined && (
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <Badge tone={TONE[item.status]}>{t(`status.${item.status}`)}</Badge>
          {item.status === 'pending' && canSend && (
            <Button
              variant="quiet-danger"
              className="px-3 py-1.5"
              onClick={() => {
                onWithdraw(item);
              }}
            >
              {t('outgoing.withdraw')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      <Card className="divide-y divide-slate-100">
        {[0, 1, 2].map((key) => (
          <div key={key} className="space-y-2 px-6 py-5">
            <div className="h-4 w-48 animate-pulse rounded-full bg-slate-200/80" />
            <div className="h-3 w-64 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export function OutgoingRequestsPage() {
  const t = useTranslations('connections');
  const tErrors = useTranslations('errors');
  const { shell, locale, canSend } = useConnectionContext();
  const [filter, setFilter] = useState<Filter>('all');
  const [withdrawing, setWithdrawing] = useState<OutgoingRequest | undefined>();
  const list = useOutgoingRequests(
    canSend ? shell.activeBusinessId : undefined,
    filter === 'all' ? undefined : filter,
  );
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const directoryLink = (
    <Link
      href={`/${locale}/seller/directory`}
      className="inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
    >
      {t('outgoing.go_directory')}
    </Link>
  );

  if (shell.me !== undefined && !canSend) {
    return (
      <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
        <PageHeader title={t('outgoing.title')} />
        <Card className="max-w-xl p-8">
          <p role="alert" className="text-sm text-slate-600">
            {t('outgoing.no_access')}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader
        title={t('outgoing.title')}
        description={t('outgoing.description')}
        action={directoryLink}
      />
      <div
        role="tablist"
        aria-label={t('outgoing.filter_label')}
        className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur sm:inline-flex"
      >
        {FILTERS.map((key) => {
          const active = key === filter;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setFilter(key);
              }}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                active
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {key === 'all' ? t('outgoing.filter_all') : t(`status.${key}`)}
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
            {t('outgoing.retry')}
          </Button>
        </div>
      ) : list.data === undefined ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 bg-gradient-to-br from-white to-indigo-50/40 p-8">
          <h2 className="text-base font-semibold text-slate-900">{t('outgoing.empty_title')}</h2>
          <p className="max-w-xl text-sm text-slate-500">
            {filter === 'all' ? t('outgoing.empty') : t('outgoing.empty_filtered')}
          </p>
          {filter === 'all' && directoryLink}
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <RequestRow key={item.id} item={item} onWithdraw={setWithdrawing} />
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
                {list.isFetchingNextPage ? t('outgoing.loading') : t('outgoing.more')}
              </Button>
            </div>
          )}
        </div>
      )}
      {withdrawing?.id !== undefined && (
        <ConfirmDialog
          action="withdraw"
          targetId={withdrawing.id}
          name={withdrawing.buyerName ?? t('outgoing.closed_business')}
          onClose={() => {
            setWithdrawing(undefined);
          }}
        />
      )}
    </div>
  );
}
