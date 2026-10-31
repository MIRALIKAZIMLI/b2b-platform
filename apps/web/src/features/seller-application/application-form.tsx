'use client';
// Kimliksiz toptancı başvuru formu (F2.2b, US-008 AC1, AC3).
// UX kararları: tek sütunlu sakin bir kart (mobilde de taşmaz), alanlar iki grupta (işletme,
// yetkili); zorunlu olmayan not en sonda. Hatalar alanın altında, genel hata (ör. hız sınırı)
// formun sonunda. Başarıda form kaybolur, ne olacağını anlatan onay kartı görünür.
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { type SyntheticEvent, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { useRegionOptions } from '../admin-sellers/api';
import { Button, Card, Field, SelectInput, TextArea, TextInput } from '../ui/primitives';
import { useSubmitApplication } from './api';
import {
  type ApplicationField,
  type ApplicationFieldErrors,
  type ApplicationFormValues,
  applicationApiErrors,
  emptyApplicationForm,
  validateApplicationForm,
} from './form';

type TextField = Exclude<ApplicationField, 'regionId' | 'categoryNote'>;

export function SellerApplicationForm() {
  const t = useTranslations('sellerApplication');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const regions = useRegionOptions(locale);
  const submit = useSubmitApplication();
  const [values, setValues] = useState<ApplicationFormValues>(emptyApplicationForm);
  const [errors, setErrors] = useState<ApplicationFieldErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const set = (field: ApplicationField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    const result = validateApplicationForm(values);
    if (!result.ok) {
      setErrors(result.fields);
      return;
    }
    setErrors({});
    submit.mutate(result.body, {
      onSuccess: () => {
        setDone(true);
      },
      onError: (failure) => {
        const mapped = applicationApiErrors(failure);
        setErrors(mapped.fields);
        setGeneral(mapped.general);
      },
    });
  }

  if (done) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/20">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 role="status" className="mt-6 text-xl font-semibold text-slate-900">
          {t('done_title')}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{t('done_body')}</p>
        <Link
          href={`/${locale}/login`}
          className="mt-8 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-500"
        >
          {t('back_to_login')}
        </Link>
      </Card>
    );
  }

  const errorText = (field: ApplicationField) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };
  const control = (field: ApplicationField) => ({
    id: `application-${field}`,
    name: field,
    value: values[field],
    invalid: errors[field] !== undefined,
    ...(errors[field] === undefined
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': `application-${field}-error` }),
  });
  const text = (
    field: TextField,
    extra: { type?: string; autoComplete?: string; inputMode?: 'numeric' | 'tel' } = {},
  ) => (
    <Field id={`application-${field}`} label={t(`field.${field}`)} error={errorText(field)}>
      <TextInput
        {...control(field)}
        type={extra.type ?? 'text'}
        autoComplete={extra.autoComplete ?? 'off'}
        {...(extra.inputMode === undefined ? {} : { inputMode: extra.inputMode })}
        onChange={(event) => {
          set(field, event.target.value);
        }}
      />
    </Field>
  );

  return (
    <Card className="p-6 sm:p-8">
      <form onSubmit={onSubmit} aria-busy={submit.isPending} noValidate className="space-y-8">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">{t('section_business')}</legend>
          {text('legalName', { autoComplete: 'organization' })}
          {text('voen', { inputMode: 'numeric' })}
          <Field
            id="application-regionId"
            label={t('field.regionId')}
            error={errorText('regionId')}
          >
            <SelectInput
              {...control('regionId')}
              onChange={(event) => {
                set('regionId', event.target.value);
              }}
            >
              <option value="">{t('choose')}</option>
              {(regions.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </Field>
        </fieldset>

        <fieldset className="space-y-4 border-t border-slate-200/80 pt-8">
          <legend className="sr-only">{t('section_contact')}</legend>
          <p aria-hidden="true" className="text-sm font-semibold text-slate-900">
            {t('section_contact')}
          </p>
          {text('contactName', { autoComplete: 'name' })}
          {text('phone', { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
          <Field
            id="application-categoryNote"
            label={t('field.categoryNote')}
            hint={t('category_hint')}
            error={errorText('categoryNote')}
          >
            <TextArea
              {...control('categoryNote')}
              rows={3}
              maxLength={500}
              onChange={(event) => {
                set('categoryNote', event.target.value);
              }}
            />
          </Field>
        </fieldset>

        {regions.isError && (
          <p role="alert" className="text-sm text-rose-600">
            {tErrors(errorCodeOf(regions.error))}
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
        <Button type="submit" disabled={submit.isPending} className="w-full">
          {submit.isPending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </Card>
  );
}
