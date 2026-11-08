'use client';
// Özel rol düzenleyici (F2.8, US-014). UX kararları: kart sayfa içinde açılır (rol listesi bağlamı
// kaybolmaz). Yeni rolde önce şablon seçilir; ad ve izinler şablondan dolar, sonra açılıp kapatılır
// (AC1). İzinler modüle göre gruplu anahtar listesi; birden çok kapsamı olan izinde kapsam seçimi.
// Yalnız rolün yeteneğine ait izinler listelenir (AC2). Yöneticinin kendinde olmayan izni pasif ve
// açıklamalı (R3; sunucu da reddeder). Kaydet tek ana eylem, Vazgeç ikincil.
import {
  canGrantPermission,
  type GrantActor,
  groupPermissionsByModule,
  defaultPermissionScope,
  type LocalizedText,
  PERMISSIONS,
  type PermissionCode,
  permissionsForCapability,
  type PermissionScope,
  pickLocalizedText,
  ROLE_NAME_MAX,
  roleEditorBody,
  type RoleEditorErrors,
  type RoleEditorValues,
  roleEditorValues,
  roleFailure,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import { type RoleTemplate, type TeamRole, useRoleMutations } from './api';

export type RoleEditorMode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly role: TeamRole };

export function RoleEditor({
  businessId,
  capability,
  mode,
  templates,
  actor,
  onDone,
}: {
  businessId: string | undefined;
  capability: 'seller' | 'buyer';
  mode: RoleEditorMode;
  templates: readonly RoleTemplate[];
  actor: GrantActor;
  onDone: (saved: string) => void;
}) {
  const t = useTranslations('team');
  const tPerm = useTranslations('permissions');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const { create, update } = useRoleMutations(businessId);
  const editing = mode.kind === 'edit' ? mode.role : undefined;
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<RoleEditorValues>(() =>
    editing === undefined
      ? { name: '', permissions: {} }
      : roleEditorValues(pickLocalizedText(editing.name, locale) ?? '', editing.permissions),
  );
  const [errors, setErrors] = useState<RoleEditorErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const groups = useMemo(
    () => groupPermissionsByModule(permissionsForCapability(capability)),
    [capability],
  );
  const busy = create.isPending || update.isPending;
  const ready = editing !== undefined || templateId !== '';

  const change = (next: RoleEditorValues) => {
    setValues(next);
    setErrors({});
    setMessage(undefined);
  };

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    change(
      template === undefined
        ? { name: '', permissions: {} }
        : roleEditorValues(pickLocalizedText(template.name, locale) ?? '', template.permissions),
    );
  }

  function toggle(code: PermissionCode, on: boolean) {
    const rest = Object.fromEntries(
      Object.entries(values.permissions).filter(([key]) => key !== code),
    ) as RoleEditorValues['permissions'];
    change({
      ...values,
      permissions: on ? { ...rest, [code]: defaultScopeFor(code, actor) } : rest,
    });
  }

  function setScope(code: PermissionCode, scope: PermissionScope) {
    change({ ...values, permissions: { ...values.permissions, [code]: scope } });
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) {
      setErrors({ templateId: 'required' });
      return;
    }
    const base = (editing?.name ?? {}) as LocalizedText;
    const result = roleEditorBody(values, capability, locale, base);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const onError = (failure: unknown) => {
      const outcome = roleFailure(failure instanceof ApiError ? failure : undefined);
      setMessage(
        outcome.kind === 'role' ? t(`role.error.${outcome.reason}`) : tErrors(outcome.code),
      );
    };
    if (editing === undefined) {
      create.mutate(
        { templateId, ...result.body },
        {
          onSuccess: () => {
            onDone(t('role.created'));
          },
          onError,
        },
      );
    } else {
      update.mutate(
        { id: editing.id, body: result.body },
        {
          onSuccess: () => {
            onDone(t('role.updated'));
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
            {editing === undefined ? t('role.create_title') : t('role.edit_title')}
          </h2>
          <p className="text-sm text-slate-500">{t('role.editor_hint')}</p>
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
      <form noValidate onSubmit={onSubmit} className="space-y-6" data-testid="role-form">
        <div className="grid gap-4 sm:grid-cols-2">
          {editing === undefined && (
            <Field
              id="role-templateId"
              label={t('role.field.template')}
              hint={t('role.template_hint')}
              error={errors.templateId === undefined ? undefined : t(`error.${errors.templateId}`)}
            >
              <SelectInput
                id="role-templateId"
                name="templateId"
                value={templateId}
                invalid={errors.templateId !== undefined}
                aria-invalid={errors.templateId !== undefined}
                onChange={(event) => {
                  chooseTemplate(event.target.value);
                }}
              >
                <option value="">{t('choose')}</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {pickLocalizedText(item.name, locale) ?? item.code}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
          <Field
            id="role-name"
            label={t('role.field.name')}
            hint={t('role.name_hint')}
            error={errors.name === undefined ? undefined : t(`error.${errors.name}`)}
          >
            <TextInput
              id="role-name"
              name="name"
              maxLength={ROLE_NAME_MAX}
              autoComplete="off"
              disabled={!ready}
              value={values.name}
              invalid={errors.name !== undefined}
              aria-invalid={errors.name !== undefined}
              onChange={(event) => {
                change({ ...values, name: event.target.value });
              }}
            />
          </Field>
        </div>

        {ready && (
          <fieldset className="space-y-4" aria-describedby="role-permissions-hint">
            <legend className="text-sm font-medium text-slate-900">
              {t('role.field.permissions')}
            </legend>
            <p id="role-permissions-hint" className="text-xs text-slate-500">
              {errors.permissions === undefined ? (
                t('role.permissions_hint')
              ) : (
                <span role="alert" className="font-medium text-rose-600">
                  {t('role.error.no_permissions')}
                </span>
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
                        actor={actor}
                        disabledHint={t('role.not_grantable')}
                        scopeLabel={(scope) => t(`role.scope.${scope}`)}
                        onToggle={toggle}
                        onScope={setScope}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </fieldset>
        )}
        <StatusLine error={message} saved={false} savedText="" />
        <Button type="submit" disabled={busy}>
          {t('role.save')}
        </Button>
      </form>
    </Card>
  );
}

/** Aktörün verebileceği ilk kapsam (R3); yoksa iznin varsayılanı (satır zaten pasif olur). */
function defaultScopeFor(code: PermissionCode, actor: GrantActor): PermissionScope {
  return (
    PERMISSIONS[code].scopes.find((scope) => canGrantPermission(actor, code, scope)) ??
    defaultPermissionScope(code)
  );
}

function PermissionRow({
  code,
  label,
  scope,
  actor,
  disabledHint,
  scopeLabel,
  onToggle,
  onScope,
}: {
  code: PermissionCode;
  label: string;
  scope: PermissionScope | undefined;
  actor: GrantActor;
  disabledHint: string;
  scopeLabel: (scope: PermissionScope) => string;
  onToggle: (code: PermissionCode, on: boolean) => void;
  onScope: (code: PermissionCode, scope: PermissionScope) => void;
}) {
  const scopes = PERMISSIONS[code].scopes;
  const grantable = scopes.filter((item) => canGrantPermission(actor, code, item));
  const on = scope !== undefined;
  // Açık ama aktörü aşan izin (ör. yöneticinin düzenlediği rol) kapatılabilir, açılamaz.
  const locked = !on && grantable.length === 0;
  const id = `perm-${code.replaceAll('.', '-')}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition-colors duration-200 hover:bg-white">
      <label
        htmlFor={id}
        title={locked ? disabledHint : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 text-sm text-slate-700"
      >
        <input
          id={id}
          type="checkbox"
          data-testid="permission-toggle"
          className="size-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
          checked={on}
          disabled={locked}
          onChange={(event) => {
            onToggle(code, event.target.checked);
          }}
        />
        <span className={locked ? 'text-slate-400' : undefined}>{label}</span>
        {locked && <span className="sr-only">{disabledHint}</span>}
      </label>
      {on && scopes.length > 1 && (
        <select
          aria-label={label}
          className="rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
          value={scope}
          onChange={(event) => {
            const next = scopes.find((item) => item === event.target.value);
            if (next !== undefined) onScope(code, next);
          }}
        >
          {scopes.map((item) => (
            <option
              key={item}
              value={item}
              disabled={!canGrantPermission(actor, code, item) && item !== scope}
            >
              {scopeLabel(item)}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}
