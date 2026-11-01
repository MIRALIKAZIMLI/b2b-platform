'use client';
// Satıcı profili (F2.6): tanıtım metni (az / ru / tr sekmeli), minimum sipariş tutarı (işletme para
// birimiyle), teslim fotoğrafı zorunluluğu. Tek "Kaydet" yalnız değişen alanları gönderir.
import {
  SELLER_DESCRIPTION_LANGUAGES,
  SELLER_DESCRIPTION_MAX,
  type SellerDescriptionLanguage,
  type SellerProfileErrors,
  type SellerProfileFormValues,
  sellerProfileFormValues,
  sellerSetupFailure,
  validateSellerProfile,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Button, Card, Field, TextArea, TextInput } from '../ui/primitives';
import { useSellerProfile, useUpdateSellerProfile } from './api';
import { LoadFailed, StatusLine } from './status';

export function SellerProfileCard({
  businessId,
  currency,
}: {
  businessId: string | undefined;
  currency: string | null | undefined;
}) {
  const t = useTranslations('sellerSettings');
  const tErrors = useTranslations('errors');
  const profile = useSellerProfile(businessId);
  const update = useUpdateSellerProfile(businessId);
  const [initial, setInitial] = useState<SellerProfileFormValues>(() =>
    sellerProfileFormValues(undefined),
  );
  const [values, setValues] = useState<SellerProfileFormValues>(initial);
  const [language, setLanguage] = useState<SellerDescriptionLanguage>('az');
  const [errors, setErrors] = useState<SellerProfileErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data === undefined) return;
    const next = sellerProfileFormValues(profile.data);
    setInitial(next);
    setValues(next);
  }, [profile.data]);

  if (profile.isError) {
    return <LoadFailed onRetry={() => void profile.refetch()} />;
  }

  const loading = profile.data === undefined;
  const change = (next: Partial<SellerProfileFormValues>) => {
    setValues((prev) => ({ ...prev, ...next }));
    setSaved(false);
    setErrors({});
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    setSaved(false);
    const result = validateSellerProfile(values, initial);
    if (!result.ok) {
      setErrors(result.errors);
      const firstLanguage = SELLER_DESCRIPTION_LANGUAGES.find(
        (code) => result.errors[`description.${code}`] !== undefined,
      );
      if (firstLanguage !== undefined) setLanguage(firstLanguage);
      return;
    }
    if (Object.keys(result.body).length === 0) {
      setSaved(true);
      return;
    }
    update.mutate(result.body, {
      onSuccess: () => {
        setSaved(true);
      },
      onError: (error) => {
        const failure = sellerSetupFailure(error instanceof ApiError ? error : undefined);
        setGeneral(failure.kind === 'code' ? tErrors(failure.code) : t(`error.${failure.kind}`));
      },
    });
  }

  const descriptionError = errors[`description.${language}`];
  const amountError = errors.minOrderAmount;

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-5 p-6 sm:p-8">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{t('profile.title')}</h2>
          <p className="text-sm text-slate-500">{t('profile.description')}</p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span id="seller-description-label" className="text-sm font-medium text-slate-900">
              {t('profile.about')}
            </span>
            <div
              role="tablist"
              aria-labelledby="seller-description-label"
              className="inline-flex rounded-xl border border-slate-200/80 bg-slate-50 p-1"
            >
              {SELLER_DESCRIPTION_LANGUAGES.map((code) => {
                const active = code === language;
                const filled = values.description[code].trim() !== '';
                return (
                  <button
                    key={code}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setLanguage(code);
                    }}
                    className={`relative rounded-lg px-3 py-1.5 text-xs font-semibold uppercase transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {code}
                    {filled && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <TextArea
            id="seller-description"
            aria-labelledby="seller-description-label"
            rows={5}
            maxLength={SELLER_DESCRIPTION_MAX}
            placeholder={t('profile.about_placeholder')}
            value={values.description[language]}
            disabled={loading}
            invalid={descriptionError !== undefined}
            onChange={(event) => {
              change({ description: { ...values.description, [language]: event.target.value } });
            }}
          />
          <div className="flex justify-between gap-3 text-xs">
            {descriptionError === undefined ? (
              <span className="text-slate-500">{t('profile.about_hint')}</span>
            ) : (
              <span role="alert" className="font-medium text-rose-600">
                {t(`error.${descriptionError}`)}
              </span>
            )}
            <span className="text-slate-400 tabular-nums">
              {values.description[language].length} / {SELLER_DESCRIPTION_MAX}
            </span>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="seller-min-order"
            label={t('profile.min_order')}
            hint={t('profile.min_order_hint')}
            error={amountError === undefined ? undefined : t(`error.${amountError}`)}
          >
            <div className="relative">
              <TextInput
                id="seller-min-order"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={values.minOrderAmount}
                disabled={loading}
                invalid={amountError !== undefined}
                {...(amountError === undefined
                  ? {}
                  : { 'aria-invalid': true, 'aria-describedby': 'seller-min-order-error' })}
                onChange={(event) => {
                  change({ minOrderAmount: event.target.value });
                }}
              />
              {currency && (
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-semibold text-slate-400">
                  {currency}
                </span>
              )}
            </div>
          </Field>

          <label
            htmlFor="seller-delivery-photo"
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 transition-all duration-200 hover:border-slate-300"
          >
            <input
              id="seller-delivery-photo"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              checked={values.requireDeliveryPhoto}
              disabled={loading}
              onChange={(event) => {
                change({ requireDeliveryPhoto: event.target.checked });
              }}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-slate-900">
                {t('profile.delivery_photo')}
              </span>
              <span className="block text-xs text-slate-500">
                {t('profile.delivery_photo_hint')}
              </span>
            </span>
          </label>
        </div>
      </Card>

      <StatusLine error={general} saved={saved} savedText={t('saved')} />
      <Button type="submit" disabled={update.isPending || loading}>
        {t('save')}
      </Button>
    </form>
  );
}
