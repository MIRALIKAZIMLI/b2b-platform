'use client';
// Şube formu (yeni ve düzenleme ortak). Onay kuralı üç seçenekli kart grubu (radyo); eşik yalnız
// `above_amount`'ta görünür (para birimi yanında). Konum: elle enlem/boylam veya "Konumumu kullan"
// (tarayıcı konumu; Mimar kararı S2, harita paketi yok). Konum isteğe bağlıdır.
import {
  BRANCH_ADDRESS_MAX,
  BRANCH_APPROVAL_RULES,
  BRANCH_NAME_MAX,
  type BranchErrors,
  type BranchFormValues,
  formatCoordinate,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useState } from 'react';
import type { Option } from '../admin-sellers/api';
import { Button, Field, SelectInput, TextInput } from '../ui/primitives';

type LocateState = 'idle' | 'locating' | 'denied' | 'unavailable';

export function BranchForm({
  idPrefix,
  values,
  errors,
  regions,
  currency,
  busy,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  values: BranchFormValues;
  errors: BranchErrors;
  regions: readonly Option[];
  currency: string | undefined;
  busy: boolean;
  submitLabel: string;
  onChange: (next: BranchFormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('branches');
  const [locate, setLocate] = useState<LocateState>('idle');
  const error = (field: keyof BranchFormValues) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };
  const set = (patch: Partial<BranchFormValues>) => {
    onChange({ ...values, ...patch });
  };

  function locateMe() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocate('unavailable');
      return;
    }
    setLocate('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocate('idle');
        set({
          lat: formatCoordinate(position.coords.latitude),
          lng: formatCoordinate(position.coords.longitude),
        });
      },
      (failure) => {
        setLocate(failure.code === failure.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-name`} label={t('field.name')} error={error('name')}>
          <TextInput
            id={`${idPrefix}-name`}
            maxLength={BRANCH_NAME_MAX}
            value={values.name}
            invalid={errors.name !== undefined}
            aria-invalid={errors.name !== undefined}
            onChange={(event) => {
              set({ name: event.target.value });
            }}
          />
        </Field>
        <Field id={`${idPrefix}-region`} label={t('field.region')} error={error('regionId')}>
          <SelectInput
            id={`${idPrefix}-region`}
            value={values.regionId}
            invalid={errors.regionId !== undefined}
            aria-invalid={errors.regionId !== undefined}
            onChange={(event) => {
              set({ regionId: event.target.value });
            }}
          >
            <option value="">{t('choose')}</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field
          id={`${idPrefix}-address`}
          label={t('field.address')}
          error={error('addressLine')}
          className="sm:col-span-2"
        >
          <TextInput
            id={`${idPrefix}-address`}
            maxLength={BRANCH_ADDRESS_MAX}
            autoComplete="street-address"
            value={values.addressLine}
            invalid={errors.addressLine !== undefined}
            aria-invalid={errors.addressLine !== undefined}
            onChange={(event) => {
              set({ addressLine: event.target.value });
            }}
          />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-900">{t('field.rule')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {BRANCH_APPROVAL_RULES.map((rule) => {
            const checked = values.approvalRule === rule;
            return (
              <label
                key={rule}
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-all duration-200 focus-within:ring-2 focus-within:ring-indigo-500/40 ${
                  checked
                    ? 'border-indigo-300 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${idPrefix}-rule`}
                    value={rule}
                    checked={checked}
                    className="size-4 border-slate-300 text-indigo-600"
                    onChange={() => {
                      set({ approvalRule: rule });
                    }}
                  />
                  <span className="text-sm font-semibold text-slate-900">
                    {t(`rule.${rule}.title`)}
                  </span>
                </span>
                <span className="text-xs text-slate-500">{t(`rule.${rule}.hint`)}</span>
              </label>
            );
          })}
        </div>
        {values.approvalRule === 'above_amount' && (
          <Field
            id={`${idPrefix}-threshold`}
            label={t('field.threshold')}
            hint={t('threshold_hint')}
            error={error('approvalThreshold')}
            className="sm:max-w-xs"
          >
            <div className="relative">
              <TextInput
                id={`${idPrefix}-threshold`}
                inputMode="decimal"
                value={values.approvalThreshold}
                invalid={errors.approvalThreshold !== undefined}
                aria-invalid={errors.approvalThreshold !== undefined}
                onChange={(event) => {
                  set({ approvalThreshold: event.target.value });
                }}
              />
              {currency !== undefined && (
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-slate-500">
                  {currency}
                </span>
              )}
            </div>
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-900">
          {t('field.location')} <span className="font-normal text-slate-500">{t('optional')}</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field id={`${idPrefix}-lat`} label={t('field.lat')} error={error('lat')}>
            <TextInput
              id={`${idPrefix}-lat`}
              inputMode="decimal"
              placeholder="40.409264"
              value={values.lat}
              invalid={errors.lat !== undefined}
              aria-invalid={errors.lat !== undefined}
              onChange={(event) => {
                set({ lat: event.target.value });
              }}
            />
          </Field>
          <Field id={`${idPrefix}-lng`} label={t('field.lng')} error={error('lng')}>
            <TextInput
              id={`${idPrefix}-lng`}
              inputMode="decimal"
              placeholder="49.867092"
              value={values.lng}
              invalid={errors.lng !== undefined}
              aria-invalid={errors.lng !== undefined}
              onChange={(event) => {
                set({ lng: event.target.value });
              }}
            />
          </Field>
          <div className="sm:pt-7">
            <Button
              type="button"
              variant="secondary"
              disabled={locate === 'locating'}
              onClick={locateMe}
            >
              {locate === 'locating' ? t('locating') : t('use_my_location')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-500" role={locate === 'idle' ? undefined : 'status'}>
          {locate === 'denied'
            ? t('location_denied')
            : locate === 'unavailable'
              ? t('location_unavailable')
              : t('location_hint')}
        </p>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel !== undefined && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
