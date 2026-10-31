'use client';
// Toptancı açma formu (F2.1b, US-009 AC1, AC4). Alan hataları istemcide Zod ile, sunucuda
// `422 details` ve `409 VOEN_ALREADY_REGISTERED` ile alanın altında. Başarıda SMS gittiyse listeye;
// gitmediyse uyarı + "Yeniden gönder".
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, type SyntheticEvent, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import {
  clearSelectedApplication,
  selectedApplication,
  sellerFormFromApplication,
} from '../admin-seller-applications/handoff';
import {
  type Option,
  useCreateSeller,
  usePlanOptions,
  useRegionOptions,
  useResendActivation,
} from './api';
import {
  apiFormErrors,
  emptySellerForm,
  type FieldErrors,
  type SellerField,
  type SellerFormValues,
  validateSellerForm,
} from './form';

type TextField = Exclude<SellerField, 'serviceAreaRegionIds'>;

/** `applicationId` (F2.2b): başvurudan açma; başvuru bellekte varsa form onunla dolar. */
export function SellerForm({ applicationId }: { applicationId?: string } = {}) {
  const t = useTranslations('adminSellers.form');
  const tList = useTranslations('adminSellers');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const regions = useRegionOptions(locale);
  const plans = usePlanOptions(locale);
  const create = useCreateSeller();
  const resend = useResendActivation();
  const [values, setValues] = useState<SellerFormValues>(() => {
    const application =
      applicationId === undefined ? undefined : selectedApplication(applicationId);
    return application === undefined ? emptySellerForm() : sellerFormFromApplication(application);
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  /** SMS gitmedi: işletme açıldı, admin yeniden gönderir. */
  const [unsent, setUnsent] = useState<{ businessId: string; resent: boolean } | undefined>();

  const set = (field: TextField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    const result = validateSellerForm(values);
    if (!result.ok) {
      setErrors(result.fields);
      return;
    }
    setErrors({});
    const body = applicationId === undefined ? result.body : { ...result.body, applicationId };
    create.mutate(body, {
      onSuccess: (created) => {
        clearSelectedApplication();
        if (created.activationSmsSent) router.push(`/${locale}/admin/sellers`);
        else setUnsent({ businessId: created.businessId, resent: false });
      },
      onError: (failure) => {
        const mapped = apiFormErrors(failure);
        setErrors(mapped.fields);
        setGeneral(mapped.general);
      },
    });
  }

  if (unsent !== undefined) {
    return (
      <>
        <h1>{t('title')}</h1>
        <p role="status">{t('created')}</p>
        {!unsent.resent && <p role="alert">{tList('sms_not_sent')}</p>}
        {unsent.resent && <p role="status">{tList('resend_done')}</p>}
        {resend.isError && <p role="alert">{tErrors(errorCodeOf(resend.error))}</p>}
        <button
          type="button"
          disabled={resend.isPending}
          onClick={() => {
            resend.mutate(unsent.businessId, {
              onSuccess: (result) => {
                setUnsent({ businessId: unsent.businessId, resent: result.activationSmsSent });
              },
            });
          }}
        >
          {tList('resend')}
        </button>
        <p>
          <Link href={`/${locale}/admin/sellers`}>{t('back_to_list')}</Link>
        </p>
      </>
    );
  }

  const fieldError = (field: SellerField): ReactNode => {
    const reason = errors[field];
    return reason === undefined ? null : (
      <span id={`seller-${field}-error`} role="alert">
        {t(`error.${reason}`)}
      </span>
    );
  };
  const aria = (field: SellerField) =>
    errors[field] === undefined
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': `seller-${field}-error` };

  const text = (
    field: TextField,
    label: string,
    extra: { type?: string; autoComplete?: string } = {},
  ) => (
    <p>
      <label>
        {label}
        <input
          name={field}
          type={extra.type ?? 'text'}
          autoComplete={extra.autoComplete ?? 'off'}
          value={values[field]}
          onChange={(event) => {
            set(field, event.target.value);
          }}
          {...aria(field)}
        />
      </label>
      {fieldError(field)}
    </p>
  );

  const choice = (field: 'regionId' | 'planId', label: string, options: readonly Option[]) => (
    <p>
      <label>
        {label}
        <select
          name={field}
          value={values[field]}
          onChange={(event) => {
            set(field, event.target.value);
          }}
          {...aria(field)}
        >
          <option value="">{t('choose')}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {fieldError(field)}
    </p>
  );

  const regionList = regions.data ?? [];

  return (
    <form onSubmit={onSubmit} aria-busy={create.isPending} noValidate>
      <h1>{t('title')}</h1>
      {applicationId !== undefined && <p role="status">{t('from_application')}</p>}
      {text('legalName', t('legal_name'), { autoComplete: 'organization' })}
      {text('voen', t('voen'))}
      {choice('regionId', t('region'), regionList)}
      {text('addressLine', t('address'), { autoComplete: 'street-address' })}
      {text('ownerName', t('owner_name'))}
      {text('ownerPhone', t('owner_phone'), { type: 'tel' })}
      {choice('planId', t('plan'), plans.data ?? [])}
      <p>
        <label>
          {t('service_areas')}
          <select
            name="serviceAreaRegionIds"
            multiple
            value={values.serviceAreaRegionIds}
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions, (option) => option.value);
              setValues((prev) => ({ ...prev, serviceAreaRegionIds: selected }));
            }}
            {...aria('serviceAreaRegionIds')}
          >
            {regionList.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {fieldError('serviceAreaRegionIds')}
      </p>
      {text('currency', t('currency'))}
      {text('timezone', t('timezone'))}
      {(regions.isError || plans.isError) && (
        <p role="alert">{tErrors(errorCodeOf(regions.error ?? plans.error))}</p>
      )}
      {general !== undefined && <p role="alert">{tErrors(general)}</p>}
      <button type="submit" disabled={create.isPending}>
        {t('submit')}
      </button>
      <p>
        <Link href={`/${locale}/admin/sellers`}>{t('back_to_list')}</Link>
      </p>
    </form>
  );
}
