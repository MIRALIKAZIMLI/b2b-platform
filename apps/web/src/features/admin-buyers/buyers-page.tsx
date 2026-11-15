'use client';
// Perakendeciler (F2.18b; US-015, US-016). UX kararları:
// - Üstte dört sekme (Hamısı · VÖEN yoxlaması · Passiv · Dayandırılıb); "VÖEN yoxlaması" moderasyon
//   kuyruğudur. Satırda ünvan + rozetler (VÖEN durumu, askı/pasif), altında VÖEN · hukuki tip ·
//   bölge · kayıt tarihi; sağda profil doluluğu ve "Aç".
// - Kayıt penceresi tek yerde: ayrıntı, e-taxes bağlantısı, doğrula/reddet ve durum eylemleri.
//   Yıkıcı eylemler (askıya al, sil) pencerede ikinci adımda gerekçe + onay kutusu ister.
// - Durum işleminin sonucu (askıya alındı / arşivlendi / kalıcı silindi) listenin üstünde yeşil satır.
// - Destek rolü yalnız görür: pencerede eylem düğmesi yok, yerine kısa açıklama.
import { BUYER_ADMIN_FILTERS, type BuyerAdminFilter } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { useRegionOptions } from '../admin-sellers/api';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type AdminBuyer, useBuyers } from './api';
import { BuyerDialog } from './buyer-dialog';
import { VoenBadge } from './voen-badge';
import { useFormatDay } from './use-format';

export function BuyersPage() {
  const t = useTranslations('adminBuyers');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const formatDay = useFormatDay();
  const [filter, setFilter] = useState<BuyerAdminFilter>('all');
  const [openId, setOpenId] = useState<string | undefined>();
  const [done, setDone] = useState<string | undefined>();
  const list = useBuyers(filter);
  const regions = useRegionOptions(locale);
  const regionNames = useMemo(
    () => new Map((regions.data ?? []).map((item) => [item.id, item.label])),
    [regions.data],
  );
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <div
        role="tablist"
        aria-label={t('filters_label')}
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur"
      >
        {BUYER_ADMIN_FILTERS.map((key) => {
          const selected = key === filter;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setFilter(key);
              }}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                selected
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {t(`filter.${key}`)}
            </button>
          );
        })}
      </div>

      {done !== undefined && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-3 text-sm font-medium text-emerald-700"
        >
          ✓ {done}
        </p>
      )}

      {list.isError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{tErrors(errorCodeOf(list.error))}</span>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : list.data === undefined ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <Card className="space-y-2 bg-gradient-to-br from-white to-indigo-50/40 p-8">
          <h2 className="text-base font-semibold text-slate-900">{t('empty_title')}</h2>
          <p className="max-w-xl text-sm text-slate-500">{t(`empty.${filter}`)}</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {items.map((buyer) => (
                <BuyerRow
                  key={buyer.id}
                  buyer={buyer}
                  region={regionNames.get(buyer.regionId) ?? ''}
                  created={formatDay(buyer.createdAt)}
                  onOpen={() => {
                    setDone(undefined);
                    setOpenId(buyer.id);
                  }}
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

      {openId !== undefined && (
        <BuyerDialog
          id={openId}
          regionName={(regionId) => regionNames.get(regionId) ?? ''}
          onClose={() => {
            setOpenId(undefined);
          }}
          onFinished={(text) => {
            setOpenId(undefined);
            setDone(text);
          }}
        />
      )}
    </div>
  );
}

function BuyerRow({
  buyer,
  region,
  created,
  onOpen,
}: {
  buyer: AdminBuyer;
  region: string;
  created: string;
  onOpen: () => void;
}) {
  const t = useTranslations('adminBuyers');
  const meta = [
    buyer.voen,
    buyer.legalType === null ? null : t(`legal_type.${buyer.legalType}`),
    region === '' ? null : region,
    t('row.created', { date: created }),
  ].filter((part): part is string => part !== null);
  return (
    <li
      data-testid="buyer-row"
      data-id={buyer.id}
      className="flex flex-col gap-4 px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-semibold text-slate-900">{buyer.legalName}</p>
          <VoenBadge buyer={buyer} />
          {buyer.status !== 'active' && <Badge tone="slate">{t(`status.${buyer.status}`)}</Badge>}
        </div>
        <p className="text-sm text-slate-500 tabular-nums">{meta.join(' · ')}</p>
      </div>
      <div className="flex items-center gap-4 sm:shrink-0">
        <div
          className="w-28"
          aria-label={t('row.completeness', { value: buyer.profileCompleteness })}
        >
          <div className="flex justify-between text-xs text-slate-500 tabular-nums">
            <span>{t('row.profile')}</span>
            <span>{buyer.profileCompleteness}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
              style={{ width: `${String(buyer.profileCompleteness)}%` }}
            />
          </div>
        </div>
        <Button variant="secondary" onClick={onOpen}>
          {t('row.open')}
        </Button>
      </div>
    </li>
  );
}

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {[0, 1, 2].map((key) => (
          <div key={key} className="space-y-2 px-6 py-5">
            <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-72 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </Card>
    </div>
  );
}
