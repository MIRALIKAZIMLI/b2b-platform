'use client';
// Fiyat listesi penceresi (F3.6b, US-034 AC1). UX kararları:
// - Alanlar: ad, para birimi (yalnız yeni listede; sonra değişmez, K6), ƏDV dahil/hariç (iki
//   seçenekli düğme grubu), ƏDV oranı (%). Yeni listede "standart et" kutusu; ilk liste her zaman
//   standart olur ve kutu yerine bu bilgi yazılır.
// - Para birimi mevcut listelerden, yoksa AZN ile dolar. Sunucu `CURRENCY_MISMATCH` dönerse beklenen
//   para birimi alana yazılır ve mesaj gösterilir.
// - Düzenlemede yalnız değişen alanlar gönderilir; değişiklik yoksa pencere kapanır.
import {
  PRICE_LIST_NAME_MAX,
  type PriceListFormField,
  priceListFailureKey,
  priceListFormBody,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useId, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { DEFAULT_CURRENCY } from '../admin-sellers/form';
import { Dialog } from '../ui/dialog';
import { Button, Field, TextInput } from '../ui/primitives';
import { type PriceList, type PriceListPatch, usePriceListMutations } from './api';

export function PriceListDialog({
  businessId,
  list,
  first,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  businessId: string | undefined;
  list: PriceList | undefined;
  first: boolean;
  defaultCurrency: string | undefined;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const t = useTranslations('prices');
  const tAll = useTranslations();
  const titleId = useId();
  const { create, update } = usePriceListMutations(businessId);
  const [key] = useState(() => globalThis.crypto.randomUUID());
  const [name, setName] = useState(list?.name ?? '');
  const [currency, setCurrency] = useState(list?.currency ?? defaultCurrency ?? DEFAULT_CURRENCY);
  const [vatIncluded, setVatIncluded] = useState(list?.vatIncluded ?? true);
  const [vatRate, setVatRate] = useState(list?.vatRate ?? '18');
  const [makeDefault, setMakeDefault] = useState(false);
  const [invalid, setInvalid] = useState<readonly PriceListFormField[]>([]);
  const [failure, setFailure] = useState<string>();
  const busy = create.isPending || update.isPending;

  function fail(error: unknown) {
    if (error instanceof ApiError && error.code === 'CURRENCY_MISMATCH') {
      const expected = (error.details as { expected?: unknown } | undefined)?.expected;
      const currencyText = typeof expected === 'string' ? expected : '';
      if (currencyText !== '') setCurrency(currencyText);
      setFailure(t('error.currency_mismatch', { currency: currencyText }));
      return;
    }
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
      const details = (error.details ?? {}) as Record<string, unknown>;
      const fields = (['name', 'currency', 'vatRate'] as const).filter((field) => field in details);
      if (fields.length > 0) {
        setInvalid(fields);
        return;
      }
    }
    setFailure(tAll(priceListFailureKey(error)));
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFailure(undefined);
    const result = priceListFormBody({ name, currency, vatIncluded, vatRate });
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    const body = result.body;
    if (list === undefined) {
      create.mutate(
        { body: makeDefault && !first ? { ...body, isDefault: true } : body, key },
        {
          onSuccess: (saved) => {
            onSaved(saved.name);
          },
          onError: fail,
        },
      );
      return;
    }
    const patch: PriceListPatch = {
      ...(body.name === list.name ? {} : { name: body.name }),
      ...(body.vatIncluded === list.vatIncluded ? {} : { vatIncluded: body.vatIncluded }),
      ...(Number(body.vatRate) === Number(list.vatRate) ? {} : { vatRate: body.vatRate }),
    };
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    update.mutate(
      { id: list.id, body: patch },
      {
        onSuccess: (saved) => {
          onSaved(saved.name);
        },
        onError: fail,
      },
    );
  }

  const error = (field: PriceListFormField) =>
    invalid.includes(field) ? t(`invalid.${field}`, { max: PRICE_LIST_NAME_MAX }) : undefined;
  const clear = (field: PriceListFormField) => {
    setInvalid((prev) => prev.filter((item) => item !== field));
  };

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
            {t('eyebrow')}
          </p>
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {list === undefined ? t('dialog.create_title') : t('dialog.edit_title')}
          </h2>
        </div>
        <Field id="price-list-name" label={t('field.name')} error={error('name')}>
          <TextInput
            id="price-list-name"
            data-autofocus
            autoComplete="off"
            maxLength={PRICE_LIST_NAME_MAX}
            value={name}
            invalid={error('name') !== undefined}
            aria-describedby={error('name') === undefined ? undefined : 'price-list-name-error'}
            placeholder={t('field.name_placeholder')}
            onChange={(event) => {
              setName(event.target.value);
              clear('name');
            }}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="price-list-currency"
            label={t('field.currency')}
            hint={list === undefined ? t('field.currency_hint') : t('field.currency_locked')}
            error={error('currency')}
          >
            <TextInput
              id="price-list-currency"
              autoComplete="off"
              maxLength={3}
              value={currency}
              disabled={list !== undefined}
              invalid={error('currency') !== undefined}
              onChange={(event) => {
                setCurrency(event.target.value.toUpperCase());
                clear('currency');
              }}
            />
          </Field>
          <Field
            id="price-list-vat-rate"
            label={t('field.vat_rate')}
            hint={t('field.vat_rate_hint')}
            error={error('vatRate')}
          >
            <TextInput
              id="price-list-vat-rate"
              inputMode="decimal"
              autoComplete="off"
              value={vatRate}
              invalid={error('vatRate') !== undefined}
              aria-describedby={
                error('vatRate') === undefined ? undefined : 'price-list-vat-rate-error'
              }
              onChange={(event) => {
                setVatRate(event.target.value);
                clear('vatRate');
              }}
            />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-900">{t('field.vat_mode')}</legend>
          <div className="inline-flex w-full rounded-xl bg-slate-100/80 p-1 sm:w-auto">
            {([true, false] as const).map((value) => {
              const selected = vatIncluded === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setVatIncluded(value);
                  }}
                  className={`flex-1 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none sm:flex-none ${
                    selected
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {value ? t('vat_included') : t('vat_excluded')}
                </button>
              );
            })}
          </div>
        </fieldset>
        {list === undefined &&
          (first ? (
            <p className="text-xs text-slate-500">{t('dialog.first_default')}</p>
          ) : (
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(event) => {
                  setMakeDefault(event.target.checked);
                }}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
              />
              {t('dialog.make_default')}
            </label>
          ))}
        {failure !== undefined && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700"
          >
            {failure}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('dialog.saving') : t('dialog.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
