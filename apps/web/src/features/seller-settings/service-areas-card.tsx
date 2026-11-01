'use client';
// Hizmet bölgeleri (F2.6): aranabilir bölge listesi, seçilenler üstte çip olarak; tek "Kaydet"
// listenin tamamını gönderir (PUT). Seçim değişmediyse kaydet pasif.
import { filterRegionOptions } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, useRegionOptions } from '../admin-sellers/api';
import { Button, Card, TextInput } from '../ui/primitives';
import { useReplaceServiceAreas, useServiceAreas } from './api';
import { LoadFailed, StatusLine } from './status';

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

export function ServiceAreasCard({ businessId }: { businessId: string | undefined }) {
  const t = useTranslations('sellerSettings');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const regions = useRegionOptions(locale);
  const areas = useServiceAreas(businessId);
  const replace = useReplaceServiceAreas(businessId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (areas.data !== undefined) setSelected(new Set(areas.data));
  }, [areas.data]);

  const options = useMemo(() => regions.data ?? [], [regions.data]);
  const visible = useMemo(
    () => filterRegionOptions(options, query, locale),
    [options, query, locale],
  );
  const labelOf = useMemo(() => new Map(options.map((o) => [o.id, o.label])), [options]);

  if (areas.isError || regions.isError) {
    return (
      <LoadFailed
        onRetry={() => {
          void areas.refetch();
          void regions.refetch();
        }}
      />
    );
  }

  const loading = areas.data === undefined || regions.data === undefined;
  const dirty = areas.data !== undefined && !sameSet(selected, new Set(areas.data));

  const toggle = (id: string) => {
    setSaved(false);
    setMessage(undefined);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function onSave() {
    setMessage(undefined);
    setSaved(false);
    replace.mutate([...selected], {
      onSuccess: () => {
        setSaved(true);
      },
      onError: (error) => {
        setMessage(tErrors(error instanceof ApiError ? error.code : 'INTERNAL_ERROR'));
      },
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-6 sm:p-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">{t('areas.title')}</h2>
            <p className="text-sm text-slate-500">{t('areas.description')}</p>
          </div>
          <span className="text-xs font-medium text-indigo-600 tabular-nums">
            {t('areas.selected', { count: selected.size })}
          </span>
        </div>

        {selected.size > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t('areas.selected_list')}>
            {[...selected].map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    toggle(id);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
                  aria-label={t('areas.remove', { name: labelOf.get(id) ?? '' })}
                >
                  {labelOf.get(id) ?? '…'}
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <TextInput
          type="search"
          aria-label={t('areas.search')}
          placeholder={t('areas.search')}
          value={query}
          disabled={loading}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('loading')}</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('areas.no_match')}</p>
        ) : (
          <div
            role="group"
            aria-label={t('areas.title')}
            className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3"
          >
            {visible.map((option) => {
              const checked = selected.has(option.id);
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-200 ${
                    checked
                      ? 'border-indigo-300 bg-indigo-50/70 text-slate-900 shadow-sm'
                      : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={checked}
                    onChange={() => {
                      toggle(option.id);
                    }}
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </Card>

      <StatusLine error={message} saved={saved} savedText={t('saved')} />
      <Button disabled={!dirty || replace.isPending} onClick={onSave}>
        {t('save')}
      </Button>
    </div>
  );
}
