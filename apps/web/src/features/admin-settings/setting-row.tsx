'use client';
// Tek ayar satırı (F2.19): okunur ad, anahtar, geçerli değer + kaynak rozeti; satır içi düzenleyici.
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { useFormatDay } from '../admin-buyers/use-format';
import { Badge, Button, SelectInput, TextInput } from '../ui/primitives';
import { type AdminSettingItem, type SettingsTarget, useUpdateSetting } from './api';
import { checkDraft, draftOf } from './model';

export function SettingRow({
  item,
  target,
  label,
}: {
  item: AdminSettingItem;
  target: SettingsTarget;
  label: string;
}) {
  const t = useTranslations('adminSettings');
  const tErrors = useTranslations('errors');
  const formatDay = useFormatDay();
  const update = useUpdateSetting();
  const [draft, setDraft] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  const own = item.value !== null;
  const current = own ? item.value : item.inheritedValue;
  const show = (value: unknown) => {
    if (item.kind === 'bool') return t(value === true ? 'bool.true' : 'bool.false');
    const text = draftOf(item.kind, value);
    return text === '' ? t('empty_value') : text;
  };
  const check = draft === undefined ? undefined : checkDraft(item.key, item.kind, draft);
  const invalid = check !== undefined && !check.ok;
  const inputId = `setting-${item.key}`;

  const save = () => {
    if (check?.ok !== true) return;
    update.mutate(
      { ...target, key: item.key, value: check.value },
      {
        onSuccess: () => {
          setDraft(undefined);
          setSaved(true);
        },
      },
    );
  };

  return (
    <div className="space-y-3 px-5 py-4 transition-colors duration-200 hover:bg-slate-50/60 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="truncate font-mono text-xs text-slate-400">{item.key}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span
            className={`font-mono text-sm tabular-nums ${own ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
          >
            {show(current)}
          </span>
          {own ? (
            <Badge tone="emerald">{t('source.here')}</Badge>
          ) : (
            <Badge tone="slate">{t(`source.${item.inheritedFrom}`)}</Badge>
          )}
          {saved && draft === undefined && (
            <span role="status" className="text-xs font-medium text-emerald-600">
              {t('saved')}
            </span>
          )}
          {draft === undefined && (
            <Button
              variant="secondary"
              className="px-3 py-1.5"
              aria-label={`${t('edit')}: ${label}`}
              onClick={() => {
                setSaved(false);
                update.reset();
                setDraft(draftOf(item.kind, current));
              }}
            >
              {t('edit')}
            </Button>
          )}
        </div>
      </div>
      {own && draft === undefined && (
        <p className="text-xs text-slate-500">
          {t('overrides_hint', {
            value: show(item.inheritedValue),
            source: t(`source.${item.inheritedFrom}`),
          })}
          {item.updatedAt !== null && ` · ${t('updated_at', { date: formatDay(item.updatedAt) })}`}
        </p>
      )}
      {draft !== undefined && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-700">
            {t('value_label')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              {item.kind === 'bool' || item.kind === 'enum' ? (
                <SelectInput
                  id={inputId}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                >
                  {(item.kind === 'bool' ? ['true', 'false'] : (item.options ?? [])).map(
                    (option) => (
                      <option key={option} value={option}>
                        {item.kind === 'bool' ? t(`bool.${option}`) : option}
                      </option>
                    ),
                  )}
                </SelectInput>
              ) : (
                <TextInput
                  id={inputId}
                  autoFocus
                  inputMode={item.kind === 'int' ? 'numeric' : undefined}
                  value={draft}
                  invalid={invalid}
                  aria-invalid={invalid}
                  aria-describedby={`${inputId}-hint`}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') save();
                    if (event.key === 'Escape') setDraft(undefined);
                  }}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button disabled={invalid || update.isPending} onClick={save}>
                {update.isPending ? t('saving') : t('save')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(undefined);
                }}
              >
                {t('cancel')}
              </Button>
            </div>
          </div>
          <p
            id={`${inputId}-hint`}
            role={invalid || update.isError ? 'alert' : undefined}
            className={`text-xs ${invalid || update.isError ? 'font-medium text-rose-600' : 'text-slate-500'}`}
          >
            {update.isError
              ? tErrors(errorCodeOf(update.error))
              : invalid
                ? t('invalid')
                : hintOf(item, t)}
          </p>
        </div>
      )}
    </div>
  );
}

function hintOf(
  item: AdminSettingItem,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  switch (item.kind) {
    case 'int':
      return t('hint.int', { min: item.min ?? '', max: item.max ?? '' });
    case 'int_list':
      return t('hint.int_list', { min: item.min ?? '', max: item.max ?? '' });
    case 'version':
      return t('hint.version');
    case 'url':
      return t('hint.url');
    case 'country_codes':
      return t('hint.country_codes');
    default:
      return '';
  }
}
