'use client';
// Üye listesi (US-013 AC3–AC4): ad, telefon, unvan, rol, kapsam. Satırda "Düzenle" (rol / şube /
// depo / bölgeler) ve iki adımlı "Çıkar" onayı. Tek admin kendini düşüremez / çıkaramaz: API
// `409 LAST_ADMIN_PROTECTED` → genel mesaj. `assigned` rolde bölge yoksa uyarı rozeti (K4).
import {
  memberFormValues,
  type MemberErrors,
  type MemberFormValues,
  memberUpdateBody,
  roleScopeNeeds,
  teamFailure,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError, type Option } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Badge, Button, Card, Field, SelectInput } from '../ui/primitives';
import { type TeamMember, type TeamRole, useTeamMutations } from './api';
import { ScopeFields, scopeAvailable, type ScopeOptions } from './scope-fields';

const FIELDS = ['roleId', 'branchId', 'warehouseId', 'regionIds'];

type RowMode =
  | { readonly kind: 'edit'; readonly id: string; readonly values: MemberFormValues }
  | { readonly kind: 'remove'; readonly id: string };

const nameOf = (list: readonly Option[] | undefined, id: string | null) =>
  id === null ? undefined : list?.find((item) => item.id === id)?.label;

export function MemberList({
  businessId,
  members,
  roles,
  roleOptions,
  jobTitles,
  scopeOptions,
}: {
  businessId: string | undefined;
  members: readonly TeamMember[] | undefined;
  roles: readonly TeamRole[];
  roleOptions: readonly Option[];
  jobTitles: readonly Option[];
  scopeOptions: ScopeOptions;
}) {
  const t = useTranslations('team');
  const tErrors = useTranslations('errors');
  const { update } = useTeamMutations(businessId);
  const [mode, setMode] = useState<RowMode | undefined>();
  const [errors, setErrors] = useState<MemberErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | undefined>();

  const begin = () => {
    setMessage(undefined);
    setSaved(undefined);
    setErrors({});
  };
  const onError = (failure: unknown) => {
    const outcome = teamFailure(failure instanceof ApiError ? failure : undefined, FIELDS);
    if (outcome.kind === 'fields') setErrors(outcome.fields);
    else setMessage(outcome.kind === 'plan_limit' ? t('error.plan_limit') : tErrors(outcome.code));
  };

  function save(member: TeamMember, values: MemberFormValues) {
    begin();
    const needs = roleScopeNeeds(roles.find((role) => role.id === values.roleId));
    const result = memberUpdateBody(member, values, needs);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (Object.keys(result.body).length === 0) {
      setMode(undefined);
      return;
    }
    update.mutate(
      { id: member.id, body: result.body },
      {
        onSuccess: () => {
          setMode(undefined);
          setSaved(t('saved'));
        },
        onError,
      },
    );
  }

  function remove(member: TeamMember) {
    begin();
    update.mutate(
      { id: member.id, body: { status: 'removed' } },
      {
        onSuccess: () => {
          setMode(undefined);
          setSaved(t('removed', { name: member.fullName }));
        },
        onError: (failure) => {
          setMode(undefined);
          onError(failure);
        },
      },
    );
  }

  const list = members ?? [];
  const busy = update.isPending;

  return (
    <div className="space-y-4">
      <StatusLine error={message} saved={saved !== undefined} savedText={saved ?? ''} />
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{t('members.title')}</h2>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {t('members.count', { count: list.length })}
          </span>
        </div>
        {members === undefined ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">{t('loading')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((member) => {
              const role = roles.find((item) => item.id === member.roleId);
              const needs = roleScopeNeeds(role);
              const editing = mode?.kind === 'edit' && mode.id === member.id ? mode : undefined;
              const removing = mode?.kind === 'remove' && mode.id === member.id;
              const scope =
                nameOf(scopeOptions.branches, member.branchId) ??
                nameOf(scopeOptions.warehouses, member.warehouseId);
              return (
                <li
                  key={member.id}
                  data-testid="member-row"
                  className="px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-violet-100 text-sm font-semibold text-indigo-700"
                      >
                        {member.fullName.trim().charAt(0).toLocaleUpperCase()}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {member.fullName}
                          </p>
                          {member.isSelf && <Badge tone="slate">{t('you')}</Badge>}
                          {member.isBusinessAdmin && <Badge tone="emerald">{t('admin')}</Badge>}
                          {needs.regions && member.regionIds.length === 0 && (
                            <Badge tone="amber">{t('no_regions')}</Badge>
                          )}
                        </div>
                        <p className="truncate text-sm text-slate-500">
                          <span className="tabular-nums">{member.phone}</span>
                          {' · '}
                          {nameOf(jobTitles, member.jobTitleId) ?? '—'}
                          {' · '}
                          {nameOf(roleOptions, member.roleId) ?? '—'}
                          {scope !== undefined && ` · ${scope}`}
                          {needs.regions &&
                            member.regionIds.length > 0 &&
                            ` · ${t('regions_selected', { count: member.regionIds.length })}`}
                        </p>
                      </div>
                    </div>
                    {editing === undefined && !removing && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => {
                            begin();
                            setMode({
                              kind: 'edit',
                              id: member.id,
                              values: memberFormValues(member),
                            });
                          }}
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          variant="quiet-danger"
                          disabled={busy}
                          onClick={() => {
                            begin();
                            setMode({ kind: 'remove', id: member.id });
                          }}
                        >
                          {t('remove')}
                        </Button>
                      </div>
                    )}
                  </div>

                  {removing && (
                    <div
                      role="alertdialog"
                      aria-label={t('remove_confirm', { name: member.fullName })}
                      className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="text-sm text-slate-700">
                        {t('remove_confirm', { name: member.fullName })}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="quiet-danger"
                          className="border-rose-200 bg-white text-rose-700"
                          disabled={busy}
                          onClick={() => {
                            remove(member);
                          }}
                        >
                          {t('remove_yes')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setMode(undefined);
                          }}
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {editing !== undefined && (
                    <MemberEditor
                      member={member}
                      values={editing.values}
                      errors={errors}
                      roles={roles}
                      roleOptions={roleOptions}
                      scopeOptions={scopeOptions}
                      busy={busy}
                      onChange={(values) => {
                        setErrors({});
                        setMode({ kind: 'edit', id: member.id, values });
                      }}
                      onSave={() => {
                        save(member, editing.values);
                      }}
                      onCancel={() => {
                        begin();
                        setMode(undefined);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MemberEditor({
  member,
  values,
  errors,
  roles,
  roleOptions,
  scopeOptions,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  member: TeamMember;
  values: MemberFormValues;
  errors: MemberErrors;
  roles: readonly TeamRole[];
  roleOptions: readonly Option[];
  scopeOptions: ScopeOptions;
  busy: boolean;
  onChange: (values: MemberFormValues) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('team');
  const needs = roleScopeNeeds(roles.find((role) => role.id === values.roleId));
  const prefix = `member-${member.id}`;
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${prefix}-roleId`}
          label={t('field.roleId')}
          error={errors.roleId === undefined ? undefined : t(`error.${errors.roleId}`)}
        >
          <SelectInput
            id={`${prefix}-roleId`}
            name="roleId"
            value={values.roleId}
            invalid={errors.roleId !== undefined}
            aria-invalid={errors.roleId !== undefined}
            onChange={(event) => {
              onChange({ ...values, roleId: event.target.value });
            }}
          >
            {roleOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <ScopeFields
          idPrefix={prefix}
          needs={needs}
          options={scopeOptions}
          values={values}
          errors={errors}
          withRegions
          onChange={(patch) => {
            onChange({ ...values, ...patch });
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !scopeAvailable(needs, scopeOptions)} onClick={onSave}>
          {t('save')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
