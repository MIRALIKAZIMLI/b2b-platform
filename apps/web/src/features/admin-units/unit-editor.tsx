'use client';
// Birim düzenleyici (F3.1, US-028 AC1). Yeni birimde UN/ECE kodu ve tür seçilir (sonradan değişmez,
// K1); ad ve kısaltma dört dilde; "ondalık miktar" anahtarı (ör. 1,5 kq). Kaydedilen aktif birim
// toptancıların ürün formunda hemen seçilebilir (ipucu metni).
import {
  CATALOG_NAME_MAX,
  catalogNameValues,
  type CatalogNameValues,
  UNIT_ABBREVIATION_MAX,
  UNIT_KINDS,
  type UnitFormErrors,
  unitFailure,
  unitFormBody,
  type UnitFormValues,
  type UnitKind,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import { type AdminUnit, useUnitMutations } from './api';
import { LocalizedFields } from './localized-fields';

export type UnitEditorMode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly unit: AdminUnit };

const EMPTY: CatalogNameValues = { az: '', ru: '', tr: '', en: '' };

export function UnitEditor({
  mode,
  onDone,
}: {
  mode: UnitEditorMode;
  onDone: (saved: string) => void;
}) {
  const t = useTranslations('adminUnits');
  const tErrors = useTranslations('errors');
  const { create, update } = useUnitMutations();
  const editing = mode.kind === 'edit' ? mode.unit : undefined;
  const [values, setValues] = useState<UnitFormValues>(() =>
    editing === undefined
      ? { code: '', kind: 'count', name: EMPTY, abbreviation: EMPTY, allowsDecimal: false }
      : {
          code: editing.code,
          kind: editing.kind,
          name: catalogNameValues(editing.name),
          abbreviation: catalogNameValues(editing.abbreviation),
          allowsDecimal: editing.allowsDecimal,
        },
  );
  const [errors, setErrors] = useState<UnitFormErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const busy = create.isPending || update.isPending;

  const change = (next: UnitFormValues) => {
    setValues(next);
    setErrors({});
    setMessage(undefined);
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = unitFormBody(values, editing === undefined ? 'create' : 'edit');
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const onError = (failure: unknown) => {
      const outcome = unitFailure(failure instanceof ApiError ? failure : undefined);
      setMessage(outcome.kind === 'unit' ? t(`failure.${outcome.reason}`) : tErrors(outcome.code));
    };
    if (editing === undefined) {
      create.mutate(result.body as Parameters<typeof create.mutate>[0], {
        onSuccess: () => {
          onDone(t('created'));
        },
        onError,
      });
    } else {
      update.mutate(
        { code: editing.code, body: result.body },
        {
          onSuccess: () => {
            onDone(t('updated'));
          },
          onError,
        },
      );
    }
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            {editing === undefined ? t('create_title') : t('edit_title')}
          </h2>
          <p className="text-sm text-slate-500">{t('editor_hint')}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            onDone('');
          }}
        >
          {t('cancel')}
        </Button>
      </div>
      <form noValidate onSubmit={onSubmit} className="space-y-6" data-testid="unit-form">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="unit-code"
            label={t('field.code')}
            hint={editing === undefined ? t('code_hint') : t('code_locked')}
            error={errors.code === undefined ? undefined : t(`error.code_${errors.code}`)}
          >
            <TextInput
              id="unit-code"
              name="code"
              autoComplete="off"
              spellCheck={false}
              maxLength={3}
              disabled={editing !== undefined}
              value={values.code}
              invalid={errors.code !== undefined}
              aria-invalid={errors.code !== undefined}
              onChange={(event) => {
                change({ ...values, code: event.target.value.toUpperCase() });
              }}
            />
          </Field>
          <Field id="unit-kind" label={t('field.kind')}>
            <SelectInput
              id="unit-kind"
              name="kind"
              disabled={editing !== undefined}
              value={values.kind}
              onChange={(event) => {
                const kind = UNIT_KINDS.find((item) => item === event.target.value) ?? 'count';
                change({ ...values, kind: kind satisfies UnitKind });
              }}
            >
              {UNIT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`kind.${kind}`)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-900">{t('field.decimal')}</span>
            <label
              htmlFor="unit-decimal"
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm transition-all duration-200 hover:border-slate-300"
            >
              <input
                id="unit-decimal"
                type="checkbox"
                className="size-4 rounded border-slate-300 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                checked={values.allowsDecimal}
                onChange={(event) => {
                  change({ ...values, allowsDecimal: event.target.checked });
                }}
              />
              <span className="text-sm text-slate-700">{t('decimal_label')}</span>
            </label>
          </div>
        </div>
        <LocalizedFields
          field="name"
          max={CATALOG_NAME_MAX}
          values={values.name}
          errors={errors}
          onChange={(name) => {
            change({ ...values, name });
          }}
        />
        <LocalizedFields
          field="abbreviation"
          max={UNIT_ABBREVIATION_MAX}
          values={values.abbreviation}
          errors={errors}
          onChange={(abbreviation) => {
            change({ ...values, abbreviation });
          }}
        />
        <StatusLine error={message} saved={false} savedText="" />
        <Button type="submit" disabled={busy}>
          {t('save')}
        </Button>
      </form>
    </Card>
  );
}
