'use client';
// İşletme profili ve VÖEN (F2.4, US-006 AC1–AC3). UX kararları: VÖEN ayrı bir üst kartta, durum
// rozetiyle (yok / doğrulama bekliyor / doğrulandı) ve yazarken hukuki tip ipucuyla; işletme
// bilgileri altta ikinci kart. Tek "Kaydet" yalnız değişen alanları gönderir. Hatalar alanın
// altında; AC3 mesajı VÖEN alanında. Başarı satırı Emerald, kısa süreli değil kalıcı (ekran
// okuyucu `role="status"`). F2.10a: görünürlük ayarları formun altında ayrı kart
// (`privacy-card.tsx`). Kişisel veri ve logo düzenleme F2.10b.
import {
  type ProfileFieldErrors,
  type ProfileFormField,
  type ProfileFormValues,
  legalTypeHint,
  profileFailure,
  profileFormValues,
  validateProfile,
  voenStatus,
  type VoenStatus,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { ApiError, useRegionOptions } from '../admin-sellers/api';
import { useBusinessProfile } from '../buyer-registration/api';
import { canManageBusiness } from '../buyer-registration/buyer-home';
import { useShell } from '../shell/use-shell';
import { Button, Card, Field, PageHeader, SelectInput, TextInput } from '../ui/primitives';
import { useUpdateBusinessProfile } from './api';
import { PrivacyCard } from './privacy-card';

const BADGE: Record<VoenStatus, string> = {
  missing: 'border-slate-200 bg-slate-50 text-slate-600',
  pending: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export function VoenBadge({ status }: { status: VoenStatus }) {
  const t = useTranslations('businessProfile.status');
  return (
    <span
      data-testid="voen-status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE[status]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(status)}
    </span>
  );
}

export function BusinessProfilePage() {
  const t = useTranslations('businessProfile');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const { me, activeBusinessId } = useShell();
  const canManage = canManageBusiness(me?.activeBusiness?.permissions);
  const profile = useBusinessProfile(activeBusinessId, canManage);
  const regions = useRegionOptions(locale);
  const update = useUpdateBusinessProfile(activeBusinessId);
  const [initial, setInitial] = useState<ProfileFormValues>(() => profileFormValues(undefined));
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  // Sunucudaki profil geldiğinde (veya kaydedilince) form o değerlerle yeniden başlar.
  useEffect(() => {
    if (profile.data === undefined) return;
    const next = profileFormValues(profile.data);
    setInitial(next);
    setValues(next);
  }, [profile.data]);

  const set = (field: ProfileFormField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setErrors((prev) => (prev[field] === undefined ? prev : { ...prev, [field]: undefined }));
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    setSaved(false);
    const result = validateProfile(values, initial);
    if (!result.ok) {
      setErrors(result.fields);
      return;
    }
    setErrors({});
    if (Object.keys(result.body).length === 0) {
      setSaved(true);
      return;
    }
    update.mutate(result.body, {
      onSuccess: () => {
        setSaved(true);
      },
      onError: (error) => {
        const failure = profileFailure(
          error instanceof ApiError ? { code: error.code, details: error.details } : undefined,
        );
        if (failure.kind === 'fields') setErrors(failure.fields);
        else setGeneral(failure.code);
      },
    });
  }

  if (profile.isError) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:py-10">
        <Card className="space-y-4 p-8 text-center">
          <p role="alert" className="text-sm text-slate-600">
            {t('load_failed')}
          </p>
          <Button variant="secondary" onClick={() => void profile.refetch()}>
            {t('retry')}
          </Button>
        </Card>
      </div>
    );
  }

  const errorText = (field: ProfileFormField) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };
  const a11y = (field: ProfileFormField) =>
    errors[field] === undefined
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': `profile-${field}-error` };
  const text = (field: Exclude<ProfileFormField, 'regionId'>, extra: object = {}) => (
    <Field id={`profile-${field}`} label={t(`field.${field}`)} error={errorText(field)}>
      <TextInput
        id={`profile-${field}`}
        name={field}
        value={values[field]}
        invalid={errors[field] !== undefined}
        disabled={profile.data === undefined}
        {...extra}
        {...a11y(field)}
        onChange={(event) => {
          set(field, event.target.value);
        }}
      />
    </Field>
  );

  const status = voenStatus(profile.data);
  const hint = legalTypeHint(values.voen);
  const voenChanged = initial.voen !== '' && values.voen !== initial.voen;

  return (
    <div className="space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader title={t('title')} description={t('description')} />
      <form noValidate onSubmit={onSubmit} className="max-w-3xl space-y-6">
        <Card className="space-y-5 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t('section.voen')}</h2>
            {profile.data !== undefined && <VoenBadge status={status} />}
          </div>
          {status === 'missing' && <p className="text-sm text-slate-500">{t('voen_needed')}</p>}
          <Field
            id="profile-voen"
            label={t('field.voen')}
            hint={voenChanged ? t('voen_change_warning') : t('voen_hint')}
            error={errorText('voen')}
          >
            <TextInput
              id="profile-voen"
              name="voen"
              inputMode="numeric"
              maxLength={10}
              autoComplete="off"
              value={values.voen}
              invalid={errors.voen !== undefined}
              disabled={profile.data === undefined}
              {...a11y('voen')}
              onChange={(event) => {
                set('voen', event.target.value);
              }}
            />
          </Field>
          {hint !== undefined && errors.voen === undefined && (
            <p data-testid="voen-legal-type" className="text-xs font-semibold text-indigo-600">
              {t(`legal_type.${hint}`)}
            </p>
          )}
        </Card>

        <Card className="space-y-5 p-6 sm:p-8">
          <h2 className="text-base font-semibold text-slate-900">{t('section.business')}</h2>
          {text('legalName', { autoComplete: 'organization' })}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="profile-regionId" label={t('field.regionId')} error={errorText('regionId')}>
              <SelectInput
                id="profile-regionId"
                name="regionId"
                value={values.regionId}
                invalid={errors.regionId !== undefined}
                disabled={profile.data === undefined}
                {...a11y('regionId')}
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
            {text('businessPhone', { type: 'tel', autoComplete: 'tel' })}
          </div>
          {text('addressLine', { autoComplete: 'street-address' })}
        </Card>

        {general !== undefined && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {tErrors(general)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={update.isPending || profile.data === undefined}>
            {t('save')}
          </Button>
          {saved && (
            <p role="status" className="text-sm font-medium text-emerald-600">
              ✓ {t('saved')}
            </p>
          )}
        </div>
      </form>
      <div className="max-w-3xl">
        <PrivacyCard businessId={activeBusinessId} enabled={canManage} />
      </div>
    </div>
  );
}
