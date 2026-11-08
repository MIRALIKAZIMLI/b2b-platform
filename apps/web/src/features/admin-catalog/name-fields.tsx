'use client';
// Dört dilde ad alanları (US-012 AC1): az, ru, tr zorunlu; en isteğe bağlı (ADR-0007).
import {
  CATALOG_LANGS,
  CATALOG_NAME_MAX,
  type CatalogFormErrors,
  type CatalogLang,
  type CatalogNameValues,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { Field, TextInput } from '../ui/primitives';

export function NameFields({
  prefix,
  values,
  errors,
  onChange,
}: {
  prefix: string;
  values: CatalogNameValues;
  errors: CatalogFormErrors;
  onChange: (next: CatalogNameValues) => void;
}) {
  const t = useTranslations('adminCatalog');
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-slate-900">{t('field.name')}</legend>
      <p className="text-xs text-slate-500">{t('name_hint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {CATALOG_LANGS.map((lang: CatalogLang) => {
          const id = `${prefix}-name-${lang}`;
          const error = errors[`name.${lang}`];
          return (
            <Field
              key={lang}
              id={id}
              label={t(`lang.${lang}`)}
              error={error === undefined ? undefined : t(`error.${error}`)}
            >
              <TextInput
                id={id}
                name={`name.${lang}`}
                maxLength={CATALOG_NAME_MAX}
                autoComplete="off"
                value={values[lang]}
                invalid={error !== undefined}
                aria-invalid={error !== undefined}
                onChange={(event) => {
                  onChange({ ...values, [lang]: event.target.value });
                }}
              />
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}
