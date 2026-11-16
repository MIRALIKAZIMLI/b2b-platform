'use client';
// Dönüşüm oranları (F3.1, US-028 AC2). UX: "1 KGM = 1000 GRM" satırları; ekleme formu tek satır
// (kaynak birim → hedef birim, oran). Hedef listesinde yalnız kaynakla aynı türdeki birimler çıkar;
// kural API'de de (422). Aynı çift yeniden kaydedilirse oran güncellenir.
import {
  pickLocalizedText,
  type UnitFormErrors,
  unitConversionFormBody,
  unitFailure,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import { type AdminUnit, type UnitConversion, useUnitMutations } from './api';

export function ConversionsCard({
  units,
  conversions,
}: {
  units: readonly AdminUnit[];
  conversions: readonly UnitConversion[];
}) {
  const t = useTranslations('adminUnits');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const { saveConversion, removeConversion } = useUnitMutations();
  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [factor, setFactor] = useState('');
  const [errors, setErrors] = useState<UnitFormErrors>({});
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | undefined>();

  const from = units.find((unit) => unit.code === fromCode);
  const targets = units.filter((unit) => unit.kind === from?.kind && unit.code !== fromCode);
  const label = (code: string) => {
    const unit = units.find((item) => item.code === code);
    return unit === undefined ? code : (pickLocalizedText(unit.abbreviation, locale) ?? code);
  };
  const reset = () => {
    setErrors({});
    setError(undefined);
    setSaved(undefined);
  };
  const onError = (failure: unknown) => {
    const outcome = unitFailure(failure instanceof ApiError ? failure : undefined);
    setError(outcome.kind === 'unit' ? t(`failure.${outcome.reason}`) : tErrors(outcome.code));
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = unitConversionFormBody({ fromCode, toCode, factor });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    saveConversion.mutate(result.body, {
      onSuccess: () => {
        setFactor('');
        setSaved(t('conversion.saved'));
      },
      onError,
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="space-y-1 border-b border-slate-200/80 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{t('conversion.title')}</h2>
        <p className="text-sm text-slate-500">{t('conversion.description')}</p>
      </div>
      {conversions.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-slate-500">{t('conversion.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {conversions.map((item) => (
            <li
              key={`${item.fromCode}:${item.toCode}`}
              data-testid="unit-conversion-row"
              className="flex items-center justify-between gap-4 px-6 py-3 transition-colors duration-200 hover:bg-slate-50/70"
            >
              <p className="text-sm text-slate-900 tabular-nums">
                1 {label(item.fromCode)} <span className="text-slate-400">=</span>{' '}
                <span className="font-semibold">{item.factor}</span> {label(item.toCode)}
                <span className="ml-3 font-mono text-xs text-slate-400">
                  {item.fromCode} → {item.toCode}
                </span>
              </p>
              <Button
                variant="quiet-danger"
                disabled={removeConversion.isPending}
                onClick={() => {
                  reset();
                  removeConversion.mutate(item, {
                    onSuccess: () => {
                      setSaved(t('conversion.deleted'));
                    },
                    onError,
                  });
                }}
              >
                {t('conversion.delete')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        noValidate
        onSubmit={onSubmit}
        data-testid="unit-conversion-form"
        className="space-y-4 border-t border-slate-200/80 bg-slate-50/50 px-6 py-5"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field id="conversion-from" label={t('conversion.from')}>
            <SelectInput
              id="conversion-from"
              value={fromCode}
              onChange={(event) => {
                setFromCode(event.target.value);
                setToCode('');
                reset();
              }}
            >
              <option value="">{t('choose')}</option>
              {units.map((unit) => (
                <option key={unit.code} value={unit.code}>
                  {unit.code} · {pickLocalizedText(unit.name, locale) ?? unit.code}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            id="conversion-to"
            label={t('conversion.to')}
            error={errors.toCode === undefined ? undefined : t(`error.${errors.toCode}`)}
          >
            <SelectInput
              id="conversion-to"
              value={toCode}
              disabled={from === undefined}
              invalid={errors.toCode !== undefined}
              aria-invalid={errors.toCode !== undefined}
              onChange={(event) => {
                setToCode(event.target.value);
                reset();
              }}
            >
              <option value="">{t('choose')}</option>
              {targets.map((unit) => (
                <option key={unit.code} value={unit.code}>
                  {unit.code} · {pickLocalizedText(unit.name, locale) ?? unit.code}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            id="conversion-factor"
            label={t('conversion.factor')}
            error={errors.factor === undefined ? undefined : t(`error.factor_${errors.factor}`)}
          >
            <TextInput
              id="conversion-factor"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1000"
              value={factor}
              invalid={errors.factor !== undefined}
              aria-invalid={errors.factor !== undefined}
              onChange={(event) => {
                setFactor(event.target.value);
                reset();
              }}
            />
          </Field>
          <Button type="submit" disabled={saveConversion.isPending}>
            {t('conversion.save')}
          </Button>
        </div>
        <StatusLine error={error} saved={saved !== undefined} savedText={saved ?? ''} />
      </form>
    </Card>
  );
}
