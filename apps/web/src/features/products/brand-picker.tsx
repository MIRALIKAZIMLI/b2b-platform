'use client';
// Marka seçici (F3.3b-AC6, US-029 AC2, V5). Seçili marka çip olarak (onay bekliyorsa amber rozet).
// "Dəyiş" arama panelini açar: aktif markalar + toptancının kendi bekleyen talepleri. Tam eşleşme
// yoksa aranan ad için talep gönderilir ve talep hemen seçilir (ürün taslak kaydedilebilir,
// yayın onaydan sonra). Marka isteğe bağlıdır ("Brendsiz").
import { BRAND_NAME_MAX, productFieldErrors } from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { ApiError } from '../admin-sellers/api';
import { Badge, Button, TextInput } from '../ui/primitives';
import { useBrandOptions, useBrandRequests, useRequestBrand } from './api';

export interface BrandChoice {
  readonly id: string;
  readonly name: string;
  readonly status: 'requested' | 'active';
}

export function BrandPicker({
  businessId,
  value,
  disabled,
  error,
  onChange,
}: {
  businessId: string | undefined;
  value: BrandChoice | null;
  disabled: boolean;
  error: string | undefined;
  onChange: (choice: BrandChoice | null) => void;
}) {
  const t = useTranslations('products');
  const tErrors = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const options = useBrandOptions(query);
  const requests = useBrandRequests(open ? businessId : undefined);
  const request = useRequestBrand(businessId);
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim().slice(0, BRAND_NAME_MAX));
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  const needle = query.toLocaleLowerCase();
  const pending: BrandChoice[] = (requests.data ?? [])
    .filter((item) => item.status === 'requested')
    .filter((item) => needle === '' || item.name.toLocaleLowerCase().includes(needle))
    .map((item) => ({ id: item.id, name: item.name, status: 'requested' }));
  const active: BrandChoice[] = (options.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    status: 'active',
  }));
  const choices = [...pending, ...active];
  const exact = choices.some((item) => item.name.toLocaleLowerCase() === needle);

  const pick = (choice: BrandChoice | null) => {
    onChange(choice);
    setOpen(false);
    setSearch('');
    setMessage(undefined);
  };

  function sendRequest() {
    setMessage(undefined);
    request.mutate(query, {
      onSuccess: (created) => {
        pick({ id: created.id, name: created.name, status: 'requested' });
      },
      onError: (failure) => {
        const taken =
          failure instanceof ApiError && productFieldErrors(failure.details).name === 'taken';
        setMessage(taken ? t('brand.request_taken') : tErrors(errorCodeOf(failure)));
      },
    });
  }

  return (
    <div className="space-y-2">
      <p id="brand-label" className="block text-sm font-medium text-slate-900">
        {t('field.brand')}
      </p>
      {!open && (
        <div className="flex flex-wrap items-center gap-2" aria-labelledby="brand-label">
          {value === null ? (
            <span className="text-sm text-slate-500">{t('brand.none')}</span>
          ) : (
            <span
              data-testid="brand-selected"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
            >
              {value.name}
              {value.status === 'requested' && <Badge tone="amber">{t('brand.pending')}</Badge>}
            </span>
          )}
          {!disabled && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(true);
                }}
              >
                {value === null ? t('brand.choose') : t('brand.change')}
              </Button>
              {value !== null && (
                <Button
                  variant="quiet-danger"
                  onClick={() => {
                    pick(null);
                  }}
                >
                  {t('brand.clear')}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {open && (
        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex gap-2">
            <label htmlFor="brand-search" className="sr-only">
              {t('brand.search_label')}
            </label>
            <TextInput
              id="brand-search"
              type="search"
              autoComplete="off"
              autoFocus
              maxLength={BRAND_NAME_MAX}
              placeholder={t('brand.search_placeholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setMessage(undefined);
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setSearch('');
              }}
            >
              {t('cancel')}
            </Button>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label={t('brand.results')}>
            {choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  data-testid="brand-option"
                  onClick={() => {
                    pick(choice);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-200 hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
                >
                  <span className="break-words">{choice.name}</span>
                  {choice.status === 'requested' && (
                    <Badge tone="amber">{t('brand.pending')}</Badge>
                  )}
                </button>
              </li>
            ))}
            {options.isSuccess && choices.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">{t('brand.no_match')}</li>
            )}
          </ul>
          {query !== '' && !exact && options.isSuccess && (
            <div className="space-y-2 border-t border-slate-200/80 pt-3">
              <p className="text-xs text-slate-500">{t('brand.request_hint')}</p>
              <Button variant="secondary" disabled={request.isPending} onClick={sendRequest}>
                {t('brand.request', { name: query })}
              </Button>
            </div>
          )}
          {message !== undefined && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {message}
            </p>
          )}
        </div>
      )}
      {value?.status === 'requested' && !open && (
        <p className="text-xs text-amber-700">{t('brand.pending_hint')}</p>
      )}
      {error !== undefined && (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
