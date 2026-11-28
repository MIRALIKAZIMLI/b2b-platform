'use client';
// Stok rejimi (F3.10; US-038 AC1, ADR-0018). UX kararları:
// - Ayarlarda ayrı "Stok" sekmesi; üç seçenek kartı (radyo): "İzlənmir" (`none`), "Var / yoxdur"
//   (`availability`, varsayılan), "Miqdar" (`quantity`, F3.11a'da iki adımlı geçişle; bugün kilitli
//   ve "Tezliklə" etiketli).
// - Kendi "Yadda saxla"sı yalnız `stockMode` gönderir; değişmemişse istek yok.
// - Seçilen kartın altında ne olacağını anlatan tek cümle: `none` iken işaretlerin saklandığı ve
//   `availability`'ye dönünce yeniden geçerli olduğu söylenir.
import {
  isSelectableStockMode,
  type SelectableStockMode,
  STOCK_MODES,
  sellerSetupFailure,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Badge, Button, Card } from '../ui/primitives';
import { useSellerProfile, useUpdateSellerProfile } from './api';
import { LoadFailed, StatusLine } from './status';

export function StockModeCard({ businessId }: { businessId: string | undefined }) {
  const t = useTranslations('sellerSettings');
  const tErrors = useTranslations('errors');
  const profile = useSellerProfile(businessId);
  const update = useUpdateSellerProfile(businessId);
  const [value, setValue] = useState<SelectableStockMode | undefined>();
  const [general, setGeneral] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const current = profile.data?.stockMode;

  useEffect(() => {
    if (current !== undefined && isSelectableStockMode(current)) setValue(current);
  }, [current]);

  if (profile.isError) {
    return <LoadFailed onRetry={() => void profile.refetch()} />;
  }
  const loading = profile.data === undefined;

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    setSaved(false);
    if (value === undefined || value === current) {
      setSaved(true);
      return;
    }
    update.mutate(
      { stockMode: value },
      {
        onSuccess: () => {
          setSaved(true);
        },
        onError: (error) => {
          const failure = sellerSetupFailure(error instanceof ApiError ? error : undefined);
          setGeneral(failure.kind === 'code' ? tErrors(failure.code) : t(`error.${failure.kind}`));
        },
      },
    );
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
            const selectable = isSelectableStockMode(mode);
            const checked = value === mode;
            return (
              <label
                key={mode}
                data-testid={`stock-mode-${mode}`}
                className={`relative flex flex-col gap-2 rounded-2xl border p-4 transition-all duration-200 ${
                  !selectable
                    ? 'cursor-not-allowed border-slate-200/80 bg-slate-50/60 opacity-70'
                    : checked
                      ? 'cursor-pointer border-indigo-300 bg-indigo-50/60 shadow-sm ring-1 ring-indigo-500/20'
                      : 'cursor-pointer border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="stock-mode"
                      value={mode}
                      checked={checked}
                      disabled={!selectable || loading}
                      onChange={() => {
                        if (isSelectableStockMode(mode)) {
                          setValue(mode);
                          setSaved(false);
                          setGeneral(undefined);
                        }
                      }}
                      className="h-4 w-4 border-slate-300 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                    />
                    <span className="text-sm font-semibold text-slate-900">
                      {t(`stock.mode.${mode}.title`)}
                    </span>
                  </span>
                  {!selectable && <Badge tone="slate">{t('stock.soon')}</Badge>}
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
            {t(`stock.effect.${value}`)}
          </p>
        )}
      </Card>
      <StatusLine error={general} saved={saved} savedText={t('saved')} />
      <Button type="submit" disabled={update.isPending || loading}>
        {t('save')}
      </Button>
    </form>
  );
}
