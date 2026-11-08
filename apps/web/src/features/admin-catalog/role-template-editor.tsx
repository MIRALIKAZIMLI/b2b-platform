'use client';
// Rol şablonu düzenleyici (F2.9b, US-012). UX kararları: kart listenin üstünde sayfa içinde açılır.
// Yeni şablonda kod ve yetenek seçilir (sonradan değişmez, V5); düzenlemede bunlar salt okunur
// gösterilir. İzinler yalnız şablonun yeteneğine ait olanlar, modüle göre gruplu anahtar listesi;
// birden çok kapsamı olan izinde kapsam seçimi. İşletme admin şablonunda izinler kilitli (V6).
// Kaydetme sonrası sürüm ve "kopyalar değişmedi, adminlere bildirim" bilgisi gösterilir (AC2).
import {
  type CatalogFormErrors,
  catalogFailure,
  catalogNameValues,
  type CatalogNameValues,
  defaultPermissionScope,
  groupPermissionsByModule,
  PERMISSIONS,
  type PermissionCode,
  permissionsForCapability,
  type PermissionScope,
  roleEditorValues,
  templateFormBody,
  type TemplateFormValues,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Badge, Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import { type AdminRoleTemplate, useTemplateMutations } from './api';
import { NameFields } from './name-fields';

export type TemplateEditorMode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly template: AdminRoleTemplate };

const EMPTY_NAME: CatalogNameValues = { az: '', ru: '', tr: '', en: '' };

function initialValues(mode: TemplateEditorMode): TemplateFormValues {
  if (mode.kind === 'create') {
    return { code: '', capability: 'seller', name: EMPTY_NAME, permissions: {} };
  }
  const { template } = mode;
  return {
    code: template.code,
    capability: template.capability,
    name: catalogNameValues(template.name),
    permissions: roleEditorValues('', template.permissions).permissions,
  };
}

export function RoleTemplateEditor({
  mode,
  onDone,
}: {
  mode: TemplateEditorMode;
  onDone: (saved: string) => void;
}) {
  const t = useTranslations('adminCatalog');
  const tPerm = useTranslations('permissions');
  const tErrors = useTranslations('errors');
  const { create, update } = useTemplateMutations();
  const editing = mode.kind === 'edit' ? mode.template : undefined;
  const locked = editing?.isBusinessAdmin === true;
  const [values, setValues] = useState<TemplateFormValues>(() => initialValues(mode));
  const [errors, setErrors] = useState<CatalogFormErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const groups = useMemo(
    () => groupPermissionsByModule(permissionsForCapability(values.capability)),
    [values.capability],
  );
  const busy = create.isPending || update.isPending;

  const change = (next: TemplateFormValues) => {
    setValues(next);
    setErrors({});
    setMessage(undefined);
  };

  function toggle(code: PermissionCode, on: boolean) {
    const rest = Object.fromEntries(
      Object.entries(values.permissions).filter(([key]) => key !== code),
    ) as TemplateFormValues['permissions'];
    change({
      ...values,
      permissions: on ? { ...rest, [code]: defaultPermissionScope(code) } : rest,
    });
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = templateFormBody(values, editing === undefined ? 'create' : 'edit');
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
          onDone(t('template.created'));
        },
        onError,
      });
      return;
    }
    // V6: admin şablonunda izinler gönderilmez (yalnız ad).
    const body = locked ? { name: result.body.name } : result.body;
    update.mutate(
      { id: editing.id, body: body as Parameters<typeof update.mutate>[0]['body'] },
      {
        onSuccess: (saved) => {
          onDone(
            saved.version > editing.version
              ? t('template.new_version', { version: saved.version })
              : t('template.updated'),
          );
        },
        onError,
      },
    );
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            {editing === undefined ? t('template.create_title') : t('template.edit_title')}
          </h2>
          <p className="text-sm text-slate-500">{t('template.editor_hint')}</p>
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
      <form noValidate onSubmit={onSubmit} className="space-y-6" data-testid="template-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="template-code"
            label={t('field.code')}
            hint={editing === undefined ? t('code_hint') : t('code_locked')}
            error={errors.code === undefined ? undefined : t(`error.code_${errors.code}`)}
          >
            <TextInput
              id="template-code"
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
          <Field id="template-capability" label={t('field.capability')}>
            <SelectInput
              id="template-capability"
              name="capability"
              disabled={editing !== undefined}
              value={values.capability}
              onChange={(event) => {
                const capability = event.target.value === 'buyer' ? 'buyer' : 'seller';
                // Yetenek değişince başka yeteneğin izinleri temizlenir (AC1 doğrulaması).
                change({ ...values, capability, permissions: {} });
              }}
            >
              <option value="seller">{t('capability.seller')}</option>
              <option value="buyer">{t('capability.buyer')}</option>
            </SelectInput>
          </Field>
        </div>

        <NameFields
          prefix="template"
          values={values.name}
          errors={errors}
          onChange={(name) => {
            change({ ...values, name });
          }}
        />

        <fieldset className="space-y-4" aria-describedby="template-permissions-hint">
          <legend className="flex items-center gap-2 text-sm font-medium text-slate-900">
            {t('field.permissions')}
            {locked && <Badge tone="amber">{t('template.locked_badge')}</Badge>}
          </legend>
          <p id="template-permissions-hint" className="text-xs text-slate-500">
            {errors.permissions !== undefined ? (
              <span role="alert" className="font-medium text-rose-600">
                {t('error.no_permissions')}
              </span>
            ) : locked ? (
              t('template.locked_hint')
            ) : (
              t('template.permissions_hint')
            )}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <div
                key={group.module}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4"
              >
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {tPerm(`module.${group.module}`)}
                </h3>
                <ul className="space-y-1">
                  {group.codes.map((code) => (
                    <PermissionRow
                      key={code}
                      code={code}
                      label={tPerm(code)}
                      scope={values.permissions[code]}
                      disabled={locked}
                      scopeLabel={(scope) => t(`scope.${scope}`)}
                      onToggle={toggle}
                      onScope={(item, scope) => {
                        change({
                          ...values,
                          permissions: { ...values.permissions, [item]: scope },
                        });
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </fieldset>
        <StatusLine error={message} saved={false} savedText="" />
        <Button type="submit" disabled={busy}>
          {t('save')}
        </Button>
      </form>
    </Card>
  );
}

function PermissionRow({
  code,
  label,
  scope,
  disabled,
  scopeLabel,
  onToggle,
  onScope,
}: {
  code: PermissionCode;
  label: string;
  scope: PermissionScope | undefined;
  disabled: boolean;
  scopeLabel: (scope: PermissionScope) => string;
  onToggle: (code: PermissionCode, on: boolean) => void;
  onScope: (code: PermissionCode, scope: PermissionScope) => void;
}) {
  const scopes = PERMISSIONS[code].scopes;
  const on = scope !== undefined;
  const id = `tpl-perm-${code.replaceAll('.', '-')}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition-colors duration-200 hover:bg-white">
      <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-3 text-sm text-slate-700">
        <input
          id={id}
          type="checkbox"
          data-testid="template-permission-toggle"
          data-permission={code}
          className="size-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
          checked={on}
          disabled={disabled}
          onChange={(event) => {
            onToggle(code, event.target.checked);
          }}
        />
        <span>{label}</span>
      </label>
      {on && scopes.length > 1 && (
        <select
          aria-label={label}
          disabled={disabled}
          className="rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
          value={scope}
          onChange={(event) => {
            const next = scopes.find((item) => item === event.target.value);
            if (next !== undefined) onScope(code, next);
          }}
        >
          {scopes.map((item) => (
            <option key={item} value={item}>
              {scopeLabel(item)}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}
