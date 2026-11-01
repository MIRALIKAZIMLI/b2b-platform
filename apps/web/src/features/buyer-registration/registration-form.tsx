'use client';
// Perakendeci kayıt formu (F2.3b, US-005 AC1, AC3, AC4; NFR-63). Telefon OTP ile doğrulandıktan
// sonra giriş kartının yerine gelir; kayıt anahtarı (`pendingToken`) yalnız bellekte, çağıranda.
// UX kararları: "son adım" hissi (üst etiket + doğrulanmış telefon); alanlar iki grupta (siz,
// işletme), faaliyet ve bölge geniş ekranda yan yana; onay kutusu açılır metinle aynı panelde,
// metin modal değil yerinde açılır. Hatalar alanın altında; genel hata formun sonunda. Sonuç
// durumları (numara kayıtlı, süre doldu, oturumsuz kayıt) formun yerine sakin bir bilgi kartıdır.
import {
  createIdempotencyKey,
  DATA_SHARING_TEXT_VERSION,
  emptyRegistration,
  type RegistrationField,
  type RegistrationFieldErrors,
  type RegistrationValues,
  registrationFailure,
  validateRegistration,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useRef, useState } from 'react';
import { useRegionOptions } from '../admin-sellers/api';
import { Button, Field, SelectInput, TextInput } from '../ui/primitives';
import { registerBuyer, useActivityTypeOptions } from './api';
import { ConsentText } from './consent-text';

type Notice = 'already' | 'expired' | 'done';
type TextField = 'fullName' | 'legalName';
type SelectField = 'activityTypeId' | 'regionId';

export function BuyerRegistrationForm({
  pendingToken,
  phone,
  onSignedIn,
  onRestart,
}: {
  pendingToken: string;
  phone: string;
  onSignedIn: (accessToken: string) => Promise<void>;
  /** Telefon adımına dön (giriş veya yeniden doğrulama). */
  onRestart: () => void;
}) {
  const t = useTranslations('register');
  const tErrors = useTranslations('errors');
  const tConsent = useTranslations('dataSharing.v1');
  const locale = useLocale();
  const regions = useRegionOptions(locale);
  const activities = useActivityTypeOptions(locale);
  const [values, setValues] = useState<RegistrationValues>(emptyRegistration);
  const [errors, setErrors] = useState<RegistrationFieldErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState(false);
  // Aynı anahtar yeniden denemede korunur (zayıf ağ → tek işletme); sunucu kesin yanıt verince yenilenir.
  const idempotencyKey = useRef(createIdempotencyKey());

  const set = <K extends RegistrationField>(field: K, value: RegistrationValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Düzeltilen alanın hatası hemen kalkar; diğerleri gönderene kadar kalır.
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      return { ...prev, [field]: undefined };
    });
  };

  async function submit() {
    const result = validateRegistration(values, locale);
    if (!result.ok) {
      setErrors(result.fields);
      return;
    }
    setErrors({});
    const outcome = await registerBuyer(pendingToken, result.body, idempotencyKey.current);
    if (outcome.kind === 'signed_in') {
      await onSignedIn(outcome.accessToken);
      return;
    }
    if (outcome.kind === 'registered') {
      setNotice('done');
      return;
    }
    idempotencyKey.current = createIdempotencyKey();
    const failure = registrationFailure(outcome.error);
    if (failure.kind === 'already_registered') setNotice('already');
    else if (failure.kind === 'expired') setNotice('expired');
    else if (failure.kind === 'fields') setErrors(failure.fields);
    else setGeneral(failure.code);
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    setBusy(true);
    submit()
      .catch(() => {
        setGeneral('INTERNAL_ERROR');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (notice !== undefined) {
    const copy = {
      already: { title: t('already_title'), body: t('already_body'), action: t('go_login') },
      done: { title: t('done_title'), body: t('done_body'), action: t('go_login') },
      expired: { title: t('expired'), body: undefined, action: t('restart') },
    }[notice];
    return (
      <div className="space-y-6 text-center" data-testid={`register-notice-${notice}`}>
        <div
          className={
            notice === 'done'
              ? 'mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/20'
              : 'mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/20'
          }
        >
          <span aria-hidden="true" className="text-lg font-semibold text-white">
            {notice === 'done' ? '✓' : 'i'}
          </span>
        </div>
        <div className="space-y-2">
          <h2 role="status" className="text-xl font-semibold tracking-tight text-slate-900">
            {copy.title}
          </h2>
          {copy.body !== undefined && <p className="text-sm text-slate-500">{copy.body}</p>}
        </div>
        <Button className="w-full" onClick={onRestart}>
          {copy.action}
        </Button>
      </div>
    );
  }

  const errorText = (field: RegistrationField) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };
  const a11y = (field: RegistrationField) =>
    errors[field] === undefined
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': `register-${field}-error` };

  const text = (field: TextField, autoComplete: string) => (
    <Field id={`register-${field}`} label={t(`field.${field}`)} error={errorText(field)}>
      <TextInput
        id={`register-${field}`}
        name={field}
        value={values[field]}
        invalid={errors[field] !== undefined}
        autoComplete={autoComplete}
        {...a11y(field)}
        onChange={(event) => {
          set(field, event.target.value);
        }}
      />
    </Field>
  );

  const select = (field: SelectField, options: readonly { id: string; label: string }[]) => (
    <Field id={`register-${field}`} label={t(`field.${field}`)} error={errorText(field)}>
      <SelectInput
        id={`register-${field}`}
        name={field}
        value={values[field]}
        invalid={errors[field] !== undefined}
        {...a11y(field)}
        onChange={(event) => {
          set(field, event.target.value);
        }}
      >
        <option value="">{t('choose')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </Field>
  );

  const listError = regions.error ?? activities.error;

  return (
    <form onSubmit={onSubmit} aria-busy={busy} noValidate className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('form_title')}</h1>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <span
            aria-hidden="true"
            className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white"
          >
            ✓
          </span>
          {t('form_subtitle', { phone })}
        </p>
      </header>

      <fieldset className="space-y-4">
        <legend className="mb-4 text-sm font-semibold text-slate-900">{t('section_you')}</legend>
        {text('fullName', 'name')}
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200/80 pt-8">
        <legend className="sr-only">{t('section_business')}</legend>
        <p aria-hidden="true" className="text-sm font-semibold text-slate-900">
          {t('section_business')}
        </p>
        {text('legalName', 'organization')}
        <div className="grid gap-4 sm:grid-cols-2">
          {select('activityTypeId', activities.data ?? [])}
          {select('regionId', regions.data ?? [])}
        </div>
      </fieldset>

      <div
        className={
          errors.consent === undefined
            ? 'space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'
            : 'space-y-3 rounded-2xl border border-rose-200 bg-rose-50/50 p-4'
        }
      >
        <label htmlFor="register-consent" className="flex cursor-pointer items-start gap-3">
          <input
            id="register-consent"
            name="consent"
            type="checkbox"
            checked={values.consent}
            {...a11y('consent')}
            onChange={(event) => {
              set('consent', event.target.checked);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-indigo-600"
          />
          <span className="text-sm text-slate-700">{tConsent('accept')}</span>
        </label>
        {errors.consent !== undefined && (
          <p id="register-consent-error" role="alert" className="text-xs font-medium text-rose-600">
            {errorText('consent')}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={showText}
            aria-controls="register-consent-text"
            onClick={() => {
              setShowText((open) => !open);
            }}
            className="text-sm font-semibold text-indigo-600 transition-colors duration-200 hover:text-indigo-500"
          >
            {showText ? t('consent_hide') : t('consent_read')}
          </button>
          <span className="text-xs text-slate-400 tabular-nums">
            {t('consent_version', { version: DATA_SHARING_TEXT_VERSION })}
          </span>
        </div>
        {showText && <ConsentText id="register-consent-text" />}
      </div>

      {listError !== null && (
        <p role="alert" className="text-sm text-rose-600">
          {tErrors('INTERNAL_ERROR')}
        </p>
      )}
      {general !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {tErrors(general)}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
