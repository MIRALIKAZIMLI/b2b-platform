'use client';
// Dört dilde metin alanları (ad veya kısaltma; US-028 AC1): az, ru, tr zorunlu, en isteğe bağlı.
import {
  CATALOG_LANGS,
  type CatalogLang,
  type CatalogNameValues,
  type UnitFormErrors,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { Field, TextInput } from '../ui/primitives';

export function LocalizedFields({
  field,
  max,
  values,
  errors,
  onChange,
}: {
  field: 'name' | 'abbreviation';
  max: number;
  values: CatalogNameValues;
  errors: UnitFormErrors;
  onChange: (next: CatalogNameValues) => void;
}) {
  const t = useTranslations('adminUnits');
  const tCatalog = useTranslations('adminCatalog');
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-slate-900">{t(`field.${field}`)}</legend>
      <div className="grid gap-4 sm:grid-cols-4">
        {CATALOG_LANGS.map((lang: CatalogLang) => {
          const id = `unit-${field}-${lang}`;
          const error = errors[`${field}.${lang}`];
          return (
            <Field
              key={lang}
              id={id}
              label={tCatalog(`lang.${lang}`)}
              error={error === undefined ? undefined : t(`error.${error}`)}
            >
              <TextInput
                id={id}
                name={`${field}.${lang}`}
                maxLength={max}
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
