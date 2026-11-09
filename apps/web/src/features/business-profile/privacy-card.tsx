'use client';
// Görünürlük ayarları (F2.10, US-007 AC1–AC3, ADR-0014). UX kararları: profil formunun altında
// ayrı kart ve ayrı "Kaydet" (iki form karışmaz). Üstte "Dizinde görün" ana anahtarı; altında
// kilitli "Her zaman görünür" satırları (ünvan, faaliyet alanı, şehir/rayon; anahtar yok, AC3) ve
// tek tek açılan alanlar. Anahtar `role="switch"`, açıkken Indigo; satırın tamamı tıklanır.
// "Dizinde görün" kapalıyken alanlar etkin kalır: tam telefon/VÖEN aramasında yine açık alanlar
// döner (ADR-0014 §3). Başarı Emerald satırı, hata kartın altında.
import {
  ALWAYS_VISIBLE_FIELDS,
  changedPrivacyKeys,
  DEFAULT_PRIVACY,
  PRIVACY_FIELD_KEYS,
  type PrivacyKey,
  type PrivacySettings,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Button, Card } from '../ui/primitives';
import { usePrivacySettings, useUpdatePrivacy } from './api';

function Switch({
  id,
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  description?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      data-testid={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className="group flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="space-y-0.5">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description !== undefined && (
          <span className="block text-xs text-slate-500">{description}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
          checked ? 'border-indigo-500 bg-indigo-500' : 'border-slate-200 bg-slate-100'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function PrivacyCard({
  businessId,
  enabled,
}: {
  businessId: string | undefined;
  enabled: boolean;
}) {
  const t = useTranslations('businessPrivacy');
  const tErrors = useTranslations('errors');
  const settings = usePrivacySettings(businessId, enabled);
  const update = useUpdatePrivacy(businessId);
  const [values, setValues] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [saved, setSaved] = useState(false);
  const [general, setGeneral] = useState<string | undefined>();

  useEffect(() => {
    if (settings.data !== undefined) setValues(settings.data);
  }, [settings.data]);

  if (settings.isError) {
    return (
      <Card className="space-y-4 p-6 text-center sm:p-8">
        <p role="alert" className="text-sm text-slate-600">
          {t('load_failed')}
        </p>
        <Button variant="secondary" onClick={() => void settings.refetch()}>
          {t('retry')}
        </Button>
      </Card>
    );
  }

  const loading = settings.data === undefined;
  const set = (key: PrivacyKey, next: boolean) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    setSaved(false);
    setGeneral(undefined);
  };
  const dirty = settings.data !== undefined && changedPrivacyKeys(settings.data, values).length > 0;

  function save() {
    setGeneral(undefined);
    update.mutate(values, {
      onSuccess: () => {
        setSaved(true);
      },
      onError: (error) => {
        setGeneral(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
      },
    });
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('description')}</p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-1">
        <Switch
          id="privacy-listedInDirectory"
          checked={values.listedInDirectory}
          disabled={loading}
          label={t('field.listedInDirectory')}
          description={t(values.listedInDirectory ? 'listed_on_hint' : 'listed_off_hint')}
          onChange={(next) => {
            set('listedInDirectory', next);
          }}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {t('always_title')}
        </h3>
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
          {ALWAYS_VISIBLE_FIELDS.map((field) => (
            <li
              key={field}
              data-testid={`privacy-always-${field}`}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-sm font-medium text-slate-900">{t(`always.${field}`)}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
                  <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
                </svg>
                {t('always_badge')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {t('optional_title')}
        </h3>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 p-1">
          {PRIVACY_FIELD_KEYS.map((key) => (
            <Switch
              key={key}
              id={`privacy-${key}`}
              checked={values[key]}
              disabled={loading}
              label={t(`field.${key}`)}
              {...(key === 'showPersonalContact'
                ? { description: t('personal_contact_hint') }
                : {})}
              onChange={(next) => {
                set(key, next);
              }}
            />
          ))}
        </div>
      </section>

      {general !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {tErrors(general)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          data-testid="privacy-save"
          disabled={loading || update.isPending || !dirty}
          onClick={save}
        >
          {t('save')}
        </Button>
        {saved && !dirty && (
          <p role="status" className="text-sm font-medium text-emerald-600">
            ✓ {t('saved')}
          </p>
        )}
      </div>
    </Card>
  );
}
