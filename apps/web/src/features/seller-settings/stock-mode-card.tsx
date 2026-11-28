'use client';
// Stok rejimi (F3.10; US-038 AC1, ADR-0018) + miktarlı stok (F3.11b; US-039 AC6, S5 = B, S2 = A,
// S1 = A). UX kararları:
// - Ayarlarda ayrı "Stok" sekmesi; üç seçenek kartı (radyo): "İzlənmir" (`none`), "Var / yoxdur"
//   (`availability`, varsayılan), "Miqdar" (`quantity`).
// - "Miqdar" seçilip kaydedilince iki adımlı geçişin ikinci adımı (`POST /stock-mode/quantity`):
//   sayılmamış ürün varsa sunucu 409 + sayı döner; onay penceresi "N məhsul sayılmayıb, Stokda yoxdur
//   görünəcək" der, onaylanınca `confirmUncounted: true` ile açılır. Moddan çıkış PATCH ile.
// - "Son X koli" eşiği (S1 = A) aynı kartta, satış biriminde tam sayı; yalnız değişen alan gider.
// - Seçilen kartın altında ne olacağını anlatan tek cümle; miktarlı modda depo ekranına bağlantı.
import {
  isSelectableStockMode,
  LOW_STOCK_THRESHOLD_PATTERN,
  type StockMode,
  STOCK_MODES,
  sellerSetupFailure,
} from '@b2b/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useEffect, useId, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { useActivateQuantity } from '../inventory/api';
import { Dialog } from '../ui/dialog';
import { Button, Card, Field, TextInput } from '../ui/primitives';
import { useSellerProfile, useUpdateSellerProfile } from './api';
import { LoadFailed, StatusLine } from './status';

function uncountedCount(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.code !== 'STOCK_UNCOUNTED_VARIANTS') return undefined;
  const details = error.details;
  if (typeof details === 'object' && details !== null && 'uncountedCount' in details) {
    const n = details.uncountedCount;
    if (typeof n === 'number') return n;
  }
  return 0;
}

export function StockModeCard({ businessId }: { businessId: string | undefined }) {
  const t = useTranslations('sellerSettings');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const dialogId = useId();
  const profile = useSellerProfile(businessId);
  const update = useUpdateSellerProfile(businessId);
  const activate = useActivateQuantity(businessId);
  const [value, setValue] = useState<StockMode | undefined>();
  const [threshold, setThreshold] = useState('');
  const [thresholdError, setThresholdError] = useState<string>();
  const [general, setGeneral] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<number>();
  const current = profile.data?.stockMode;
  const currentThreshold = profile.data?.lowStockDisplayThreshold;

  useEffect(() => {
    if (current !== undefined) setValue(current);
  }, [current]);
  useEffect(() => {
    if (currentThreshold !== undefined) setThreshold(currentThreshold);
  }, [currentThreshold]);

  if (profile.isError) {
    return <LoadFailed onRetry={() => void profile.refetch()} />;
  }
  const loading = profile.data === undefined;
  const pending = update.isPending || activate.isPending;

  function fail(error: unknown) {
    const failure = sellerSetupFailure(error instanceof ApiError ? error : undefined);
    setGeneral(failure.kind === 'code' ? tErrors(failure.code) : t(`error.${failure.kind}`));
  }

  function runActivation(confirmUncounted: boolean) {
    activate.mutate(confirmUncounted, {
      onSuccess: () => {
        setConfirm(undefined);
        setSaved(true);
      },
      onError: (error) => {
        const count = uncountedCount(error);
        if (count !== undefined && !confirmUncounted) {
          setConfirm(count);
          return;
        }
        setConfirm(undefined);
        fail(error);
      },
    });
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    setThresholdError(undefined);
    setSaved(false);
    const nextThreshold = threshold.trim();
    if (!LOW_STOCK_THRESHOLD_PATTERN.test(nextThreshold)) {
      setThresholdError(t('stock.threshold.invalid'));
      return;
    }
    const body = {
      ...(value !== undefined && value !== current && isSelectableStockMode(value)
        ? { stockMode: value }
        : {}),
      ...(nextThreshold !== currentThreshold ? { lowStockDisplayThreshold: nextThreshold } : {}),
    };
    const wantsQuantity = value === 'quantity' && current !== 'quantity';
    const afterPatch = () => {
      if (wantsQuantity) runActivation(false);
      else setSaved(true);
    };
    if (Object.keys(body).length === 0) {
      afterPatch();
      return;
    }
    update.mutate(body, { onSuccess: afterPatch, onError: fail });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-5 p-6 sm:p-8">
        <div className="space-y-1">
          <h2 id="stock-mode-title" className="text-base font-semibold text-slate-900">
            {t('stock.title')}
          </h2>
          <p className="text-sm text-slate-500">{t('stock.description')}</p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="stock-mode-title"
          className="grid gap-3 sm:grid-cols-3"
        >
          {STOCK_MODES.map((mode) => {
            const checked = value === mode;
            return (
              <label
                key={mode}
                data-testid={`stock-mode-${mode}`}
                className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition-all duration-200 ${
                  checked
                    ? 'border-indigo-300 bg-indigo-50/60 shadow-sm ring-1 ring-indigo-500/20'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="stock-mode"
                    value={mode}
                    checked={checked}
                    disabled={loading}
                    onChange={() => {
                      setValue(mode);
                      setSaved(false);
                      setGeneral(undefined);
                    }}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                  />
                  <span className="text-sm font-semibold text-slate-900">
                    {t(`stock.mode.${mode}.title`)}
                  </span>
                </span>
                <span className="text-xs leading-relaxed text-slate-500">
                  {t(`stock.mode.${mode}.hint`)}
                </span>
              </label>
            );
          })}
        </div>
        {value !== undefined && (
          <p className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
            {t(`stock.effect.${value}`)}{' '}
            {value === 'quantity' && (
              <Link
                href={`/${locale}/seller/stock`}
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t('stock.open_stock')}
              </Link>
            )}
          </p>
        )}
        <div className="max-w-xs">
          <Field
            id="stock-threshold"
            label={t('stock.threshold.label')}
            hint={t('stock.threshold.hint')}
            error={thresholdError}
          >
            <TextInput
              id="stock-threshold"
              inputMode="numeric"
              value={threshold}
              disabled={loading}
              invalid={thresholdError !== undefined}
              onChange={(event) => {
                setThreshold(event.target.value);
                setThresholdError(undefined);
                setSaved(false);
              }}
            />
          </Field>
        </div>
      </Card>
      <StatusLine error={general} saved={saved} savedText={t('saved')} />
      <Button type="submit" disabled={pending || loading}>
        {t('save')}
      </Button>
      {confirm !== undefined && (
        <Dialog
          labelledBy={`${dialogId}-title`}
          describedBy={`${dialogId}-desc`}
          onClose={() => {
            setConfirm(undefined);
          }}
        >
          <div className="space-y-5" data-testid="stock-uncounted-confirm">
            <h2 id={`${dialogId}-title`} className="text-lg font-semibold text-slate-900">
              {t('stock.confirm.title')}
            </h2>
            <p id={`${dialogId}-desc`} className="text-sm text-slate-600">
              {t('stock.confirm.body', { count: confirm })}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href={`/${locale}/seller/stock`}
                className="inline-flex items-center rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md"
              >
                {t('stock.confirm.count_first')}
              </Link>
              <Button
                disabled={activate.isPending}
                data-testid="stock-uncounted-confirm-submit"
                onClick={() => {
                  runActivation(true);
                }}
              >
                {t('stock.confirm.submit')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </form>
  );
}
