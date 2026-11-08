'use client';
// Unvan düzenleyici (F2.9b, US-012 AC1). Yeni unvanda kod ve yetenek seçilir (değişmez, V5); rol
// şablonu yalnız aynı yeteneğin şablonlarından seçilir. Kaydedilen aktif unvan işletmelerin davet
// ekranında hemen görünür (ipucu metni).
import {
  type CatalogFormErrors,
  catalogFailure,
  catalogNameValues,
  type CatalogNameValues,
  jobTitleFormBody,
  type JobTitleFormValues,
  pickLocalizedText,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import { type AdminJobTitle, type AdminRoleTemplate, useJobTitleMutations } from './api';
import { NameFields } from './name-fields';

export type JobTitleEditorMode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly title: AdminJobTitle };

const EMPTY_NAME: CatalogNameValues = { az: '', ru: '', tr: '', en: '' };

export function JobTitleEditor({
  mode,
  templates,
  onDone,
}: {
  mode: JobTitleEditorMode;
  templates: readonly AdminRoleTemplate[];
  onDone: (saved: string) => void;
}) {
  const t = useTranslations('adminCatalog');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const { create, update } = useJobTitleMutations();
  const editing = mode.kind === 'edit' ? mode.title : undefined;
  const [values, setValues] = useState<JobTitleFormValues>(() =>
    editing === undefined
      ? { code: '', capability: 'seller', name: EMPTY_NAME, roleTemplateId: '' }
      : {
          code: editing.code,
          capability: editing.capability,
          name: catalogNameValues(editing.name),
          roleTemplateId: editing.roleTemplateId ?? '',
        },
  );
  const [errors, setErrors] = useState<CatalogFormErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const busy = create.isPending || update.isPending;
  const options = templates.filter((item) => item.capability === values.capability);

  const change = (next: JobTitleFormValues) => {
    setValues(next);
    setErrors({});
    setMessage(undefined);
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = jobTitleFormBody(values, editing === undefined ? 'create' : 'edit');
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const onError = (failure: unknown) => {
      const outcome = catalogFailure(failure instanceof ApiError ? failure : undefined);
      setMessage(
        outcome.kind === 'catalog' ? t(`failure.${outcome.reason}`) : tErrors(outcome.code),
      );
    };
    if (editing === undefined) {
      create.mutate(result.body as Parameters<typeof create.mutate>[0], {
        onSuccess: () => {
          onDone(t('title.created'));
        },
        onError,
      });
    } else {
      update.mutate(
        { id: editing.id, body: result.body },
        {
          onSuccess: () => {
            onDone(t('title.updated'));
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
            {editing === undefined ? t('title.create_title') : t('title.edit_title')}
          </h2>
          <p className="text-sm text-slate-500">{t('title.editor_hint')}</p>
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
      <form noValidate onSubmit={onSubmit} className="space-y-6" data-testid="job-title-form">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="title-code"
            label={t('field.code')}
            hint={editing === undefined ? t('code_hint') : t('code_locked')}
            error={errors.code === undefined ? undefined : t(`error.code_${errors.code}`)}
          >
            <TextInput
              id="title-code"
              name="code"
              autoComplete="off"
              spellCheck={false}
              disabled={editing !== undefined}
              value={values.code}
              invalid={errors.code !== undefined}
              aria-invalid={errors.code !== undefined}
              onChange={(event) => {
                change({ ...values, code: event.target.value });
              }}
            />
          </Field>
          <Field id="title-capability" label={t('field.capability')}>
            <SelectInput
              id="title-capability"
              name="capability"
              disabled={editing !== undefined}
              value={values.capability}
              onChange={(event) => {
                const capability = event.target.value === 'buyer' ? 'buyer' : 'seller';
                change({ ...values, capability, roleTemplateId: '' });
              }}
            >
              <option value="seller">{t('capability.seller')}</option>
              <option value="buyer">{t('capability.buyer')}</option>
            </SelectInput>
          </Field>
          <Field
            id="title-template"
            label={t('field.template')}
            hint={t('title.template_hint')}
            error={
              errors.roleTemplateId === undefined ? undefined : t(`error.${errors.roleTemplateId}`)
            }
          >
            <SelectInput
              id="title-template"
              name="roleTemplateId"
              value={values.roleTemplateId}
              invalid={errors.roleTemplateId !== undefined}
              aria-invalid={errors.roleTemplateId !== undefined}
              onChange={(event) => {
                change({ ...values, roleTemplateId: event.target.value });
              }}
            >
              <option value="">{t('choose')}</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {pickLocalizedText(item.name, locale) ?? item.code}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <NameFields
          prefix="title"
          values={values.name}
          errors={errors}
          onChange={(name) => {
            change({ ...values, name });
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
