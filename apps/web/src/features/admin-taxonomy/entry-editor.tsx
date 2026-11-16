'use client';
// Kategori ve faaliyet alanı düzenleyicisi (F3.2b-AC1, AC2, AC6): dört dilde ad (az/ru/tr zorunlu)
// ve sıra numarası. Alt kategoride üst kategori yalnız gösterilir; sonradan değişmez (F3.2a K4).
import {
  catalogNameValues,
  type TaxonomyFormBody,
  type TaxonomyFormErrors,
  taxonomyFormBody,
  type TaxonomyFormValues,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useState } from 'react';
import { NameFields } from '../admin-catalog/name-fields';
import { StatusLine } from '../seller-settings/status';
import { Button, Card, Field, TextInput } from '../ui/primitives';

export interface EntryEditorProps {
  readonly testId: string;
  readonly title: string;
  readonly hint: string;
  /** Alt kategoride üst kategorinin adı (salt okunur). */
  readonly parentName?: string | undefined;
  readonly initial?: { readonly name: unknown; readonly sortOrder: number } | undefined;
  readonly busy: boolean;
  readonly onCancel: () => void;
  /** Kaydet; hata olursa `fail` ile ekranda mesaj gösterilir. */
  readonly onSave: (body: TaxonomyFormBody, fail: (message: string) => void) => void;
}

export function EntryEditor({
  testId,
  title,
  hint,
  parentName,
  initial,
  busy,
  onCancel,
  onSave,
}: EntryEditorProps) {
  const t = useTranslations('adminTaxonomy');
  const [values, setValues] = useState<TaxonomyFormValues>(() => ({
    name: catalogNameValues(initial?.name),
    sortOrder: initial === undefined ? '' : String(initial.sortOrder),
  }));
  const [errors, setErrors] = useState<TaxonomyFormErrors>({});
  const [message, setMessage] = useState<string | undefined>();

  const change = (next: TaxonomyFormValues) => {
    setValues(next);
    setErrors({});
    setMessage(undefined);
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = taxonomyFormBody(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSave(result.body, setMessage);
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{hint}</p>
        </div>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
      <form noValidate onSubmit={onSubmit} className="space-y-6" data-testid={testId}>
        {parentName !== undefined && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm">
            <span className="text-slate-500">{t('field.parent')}: </span>
            <span className="font-medium break-words text-slate-900">{parentName}</span>
          </div>
        )}
        <NameFields
          prefix={testId}
          values={values.name}
          errors={errors}
          onChange={(name) => {
            change({ ...values, name });
          }}
        />
        <Field
          id={`${testId}-sort`}
          label={t('field.sort_order')}
          hint={t('sort_hint')}
          error={errors.sortOrder === undefined ? undefined : t('error.sort_order')}
          className="max-w-xs"
        >
          <TextInput
            id={`${testId}-sort`}
            name="sortOrder"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={values.sortOrder}
            invalid={errors.sortOrder !== undefined}
            aria-invalid={errors.sortOrder !== undefined}
            onChange={(event) => {
              change({ ...values, sortOrder: event.target.value });
            }}
          />
        </Field>
        <StatusLine error={message} saved={false} savedText="" />
        <Button type="submit" disabled={busy}>
          {t('save')}
        </Button>
      </form>
    </Card>
  );
}
