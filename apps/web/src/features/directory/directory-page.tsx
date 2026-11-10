'use client';
// Perakendeci dizini (F2.11b; US-019, US-020). UX kararları:
// - İki mod, tek sekme çubuğu: "Süzgəclə axtar" (ünvan, bölge, faaliyet, doğrulanmış) ve
//   "Telefon / VÖEN ilə tap" (tek kutu; tam numara veya 10 haneli VÖEN tanınmadan istek gitmez).
// - Filtre değişince liste 300 ms sonra yenilenir (yazarken her harfte istek yok; hız sınırı).
// - Sonuçlar kart ızgarası (geniş ekranda iki sütun); "Daha çox" sonraki sayfayı ekler.
// - Boş durumlar ayrı: hizmet bölgesi yok (ayarlara bağlantı), bölge atanmamış (admine sor),
//   sonuç yok. Hız sınırı (429) kalan saniyeyle; yükleniyor = iskelet kartlar.
// - Dışa aktarma bilerek yok (US-019 AC4).
import { parseExactLookup } from '@b2b/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { ApiError, useRegionOptions } from '../admin-sellers/api';
import { useActivityTypeOptions } from '../buyer-registration/api';
import { useShell } from '../shell/use-shell';
import { Button, Card, Field, PageHeader, SelectInput, TextInput } from '../ui/primitives';
import {
  type DirectoryFilters,
  EMPTY_FILTERS,
  retryAfterOf,
  useDirectorySearch,
  useExactLookup,
} from './api';
import { BuyerCard } from './buyer-card';

const MODES = ['filter', 'exact'] as const;
type Mode = (typeof MODES)[number];

function useDebounced<T>(value: T, ms: number): T {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrent(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return current;
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
      {[0, 1, 2, 3].map((key) => (
        <div
          key={key}
          className="h-36 animate-pulse rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-100 shadow-sm"
        />
      ))}
    </div>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-3 bg-gradient-to-br from-white to-indigo-50/40 p-8">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="max-w-xl text-sm text-slate-500">{body}</p>
      {action}
    </Card>
  );
}

function ErrorNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations('directory');
  const tErrors = useTranslations('errors');
  const wait = retryAfterOf(error);
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>
        {wait !== undefined
          ? t('rate_limited', { seconds: wait })
          : tErrors(error instanceof ApiError ? error.code : 'INTERNAL_ERROR')}
      </span>
      <Button variant="secondary" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}

function FilterMode({ businessId }: { businessId: string | undefined }) {
  const t = useTranslations('directory');
  const locale = useLocale();
  const regions = useRegionOptions(locale);
  const activities = useActivityTypeOptions(locale);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const debounced = useDebounced(filters, 300);
  const search = useDirectorySearch(businessId, debounced);
  const items = useMemo(
    () => search.data?.pages.flatMap((page) => page.items) ?? [],
    [search.data],
  );
  const emptyReason = search.data?.pages[0]?.emptyReason ?? null;
  const set = (patch: Partial<DirectoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-6">
      <Card className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="directory-q" label={t('filter.q')} className="sm:col-span-2 lg:col-span-1">
          <TextInput
            id="directory-q"
            type="search"
            value={filters.q}
            maxLength={100}
            placeholder={t('filter.q_placeholder')}
            onChange={(event) => {
              set({ q: event.target.value });
            }}
          />
        </Field>
        <Field id="directory-region" label={t('filter.region')}>
          <SelectInput
            id="directory-region"
            value={filters.regionId}
            onChange={(event) => {
              set({ regionId: event.target.value });
            }}
          >
            <option value="">{t('filter.region_default')}</option>
            {(regions.data ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="directory-activity" label={t('filter.activity')}>
          <SelectInput
            id="directory-activity"
            value={filters.activityTypeId}
            onChange={(event) => {
              set({ activityTypeId: event.target.value });
            }}
          >
            <option value="">{t('filter.activity_all')}</option>
            {(activities.data ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <label className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-300">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(event) => {
              set({ verifiedOnly: event.target.checked });
            }}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
          />
          {t('filter.verified')}
        </label>
      </Card>

      {search.isError ? (
        <ErrorNotice error={search.error} onRetry={() => void search.refetch()} />
      ) : search.data === undefined ? (
        <SkeletonCards />
      ) : emptyReason === 'no_service_areas' ? (
        <Notice
          title={t('empty.no_service_areas_title')}
          body={t('empty.no_service_areas')}
          action={
            <Link
              href={`/${locale}/seller/settings`}
              className="rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
            >
              {t('empty.go_settings')}
            </Link>
          }
        />
      ) : emptyReason === 'no_assigned_regions' ? (
        <Notice title={t('empty.no_regions_title')} body={t('empty.no_assigned_regions')} />
      ) : items.length === 0 ? (
        <Notice title={t('empty.none_title')} body={t('empty.none')} />
      ) : (
        <div className="space-y-6">
          <ul className="grid gap-4 lg:grid-cols-2">
            {items.map((buyer) => (
              <li key={buyer.id}>
                <BuyerCard buyer={buyer} />
              </li>
            ))}
          </ul>
          {search.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                disabled={search.isFetchingNextPage}
                onClick={() => void search.fetchNextPage()}
              >
                {search.isFetchingNextPage ? t('loading') : t('more')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExactMode({ businessId }: { businessId: string | undefined }) {
  const t = useTranslations('directory');
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState<ReturnType<typeof parseExactLookup>>();
  const [invalid, setInvalid] = useState(false);
  const lookup = useExactLookup(businessId, submitted);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseExactLookup(input);
    setInvalid(parsed === undefined);
    setSubmitted(parsed);
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field
            id="directory-exact"
            label={t('exact.label')}
            hint={t('exact.hint')}
            error={invalid ? t('exact.invalid') : undefined}
            className="flex-1"
          >
            <TextInput
              id="directory-exact"
              inputMode="tel"
              autoComplete="off"
              value={input}
              invalid={invalid}
              aria-describedby={invalid ? 'directory-exact-error' : undefined}
              placeholder="+994 50 123 45 67 · 1234567891"
              onChange={(event) => {
                setInput(event.target.value);
                setInvalid(false);
              }}
            />
          </Field>
          <Button type="submit" className="sm:mb-[22px]">
            {t('exact.submit')}
          </Button>
        </form>
      </Card>

      {submitted === undefined ? null : lookup.isError ? (
        <ErrorNotice error={lookup.error} onRetry={() => void lookup.refetch()} />
      ) : lookup.data === undefined ? (
        <SkeletonCards />
      ) : lookup.data.items.length === 0 ? (
        <Notice title={t('empty.none_title')} body={t('exact.none')} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {lookup.data.items.map((buyer) => (
            <li key={buyer.id}>
              <BuyerCard buyer={buyer} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DirectoryPage() {
  const t = useTranslations('directory');
  const { activeBusinessId } = useShell();
  const [mode, setMode] = useState<Mode>('filter');

  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader title={t('title')} description={t('description')} />
      <div
        role="tablist"
        aria-label={t('title')}
        className="inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur"
      >
        {MODES.map((key) => {
          const active = key === mode;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`directory-tab-${key}`}
              aria-selected={active}
              aria-controls="directory-panel"
              onClick={() => {
                setMode(key);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                active
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {t(`mode.${key}`)}
            </button>
          );
        })}
      </div>
      <section id="directory-panel" role="tabpanel" aria-labelledby={`directory-tab-${mode}`}>
        {mode === 'filter' ? (
          <FilterMode businessId={activeBusinessId} />
        ) : (
          <ExactMode businessId={activeBusinessId} />
        )}
      </section>
    </div>
  );
}
