'use client';
// Davet formu (US-013 AC1–AC2). Unvan seçilince rol şablondan önerilir (değiştirilebilir); rolün
// gerektirdiği kapsam alanı görünür. Plan sınırı aşılınca plan mesajı (AC2). Bölgeler kabulden sonra
// üye satırında atanır (F2.7 K4).
import {
  EMPTY_INVITATION,
  type InvitationErrors,
  type InvitationField,
  type InvitationFormValues,
  roleScopeNeeds,
  suggestedRoleId,
  TEAM_FULL_NAME_MAX,
  teamFailure,
  validateInvitation,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useState } from 'react';
import { ApiError, type Option } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import { type TeamRole, useTeamMutations } from './api';
import { ScopeFields, scopeAvailable, type ScopeOptions } from './scope-fields';

const FIELDS: readonly InvitationField[] = [
  'phone',
  'fullName',
  'jobTitleId',
  'roleId',
  'branchId',
  'warehouseId',
];

export function InviteCard({
  businessId,
  roles,
  roleOptions,
  jobTitles,
  scopeOptions,
  onClose,
}: {
  businessId: string | undefined;
  roles: readonly TeamRole[];
  roleOptions: readonly Option[];
  jobTitles: readonly (Option & { roleTemplateId: string | null })[];
  scopeOptions: ScopeOptions;
  onClose: () => void;
}) {
  const t = useTranslations('team');
  const tErrors = useTranslations('errors');
  const { invite } = useTeamMutations(businessId);
  const [values, setValues] = useState<InvitationFormValues>(EMPTY_INVITATION);
  const [errors, setErrors] = useState<InvitationErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const needs = roleScopeNeeds(roles.find((role) => role.id === values.roleId));

  const set = (patch: Partial<InvitationFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setErrors({});
    setMessage(undefined);
    setSaved(undefined);
  };
  const error = (field: InvitationField) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    setSaved(undefined);
    const result = validateInvitation(values, needs);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    invite.mutate(result.body, {
      onSuccess: (data) => {
        setValues(EMPTY_INVITATION);
        setSaved(data.smsSent ? t('sent') : t('sent_no_sms'));
      },
      onError: (failure) => {
        const outcome = teamFailure(failure instanceof ApiError ? failure : undefined, FIELDS);
        if (outcome.kind === 'fields') setErrors(outcome.fields);
        else
          setMessage(outcome.kind === 'plan_limit' ? t('error.plan_limit') : tErrors(outcome.code));
      },
    });
  }

  return (
    <Card className="space-y-5 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{t('invite_title')}</h2>
          <p className="text-sm text-slate-500">{t('invite_hint')}</p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
      </div>
      <form noValidate onSubmit={onSubmit} className="space-y-5" data-testid="invite-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="invite-phone"
            label={t('field.phone')}
            hint={t('phone_hint')}
            error={error('phone')}
          >
            <TextInput
              id="invite-phone"
              name="phone"
              type="tel"
              autoComplete="off"
              inputMode="tel"
              value={values.phone}
              invalid={errors.phone !== undefined}
              aria-invalid={errors.phone !== undefined}
              onChange={(event) => {
                set({ phone: event.target.value });
              }}
            />
          </Field>
          <Field id="invite-fullName" label={t('field.fullName')} error={error('fullName')}>
            <TextInput
              id="invite-fullName"
              name="fullName"
              maxLength={TEAM_FULL_NAME_MAX}
              autoComplete="off"
              value={values.fullName}
              invalid={errors.fullName !== undefined}
              aria-invalid={errors.fullName !== undefined}
              onChange={(event) => {
                set({ fullName: event.target.value });
              }}
            />
          </Field>
          <Field id="invite-jobTitleId" label={t('field.jobTitleId')} error={error('jobTitleId')}>
            <SelectInput
              id="invite-jobTitleId"
              name="jobTitleId"
              value={values.jobTitleId}
              invalid={errors.jobTitleId !== undefined}
              aria-invalid={errors.jobTitleId !== undefined}
              onChange={(event) => {
                const title = jobTitles.find((item) => item.id === event.target.value);
                const roleId = suggestedRoleId(title, roles);
                set({
                  jobTitleId: event.target.value,
                  ...(roleId === undefined ? {} : { roleId }),
                });
              }}
            >
              <option value="">{t('choose')}</option>
              {jobTitles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            id="invite-roleId"
            label={t('field.roleId')}
            hint={t('role_hint')}
            error={error('roleId')}
          >
            <SelectInput
              id="invite-roleId"
              name="roleId"
              value={values.roleId}
              invalid={errors.roleId !== undefined}
              aria-invalid={errors.roleId !== undefined}
              onChange={(event) => {
                set({ roleId: event.target.value });
              }}
            >
              <option value="">{t('choose')}</option>
              {roleOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <ScopeFields
            idPrefix="invite"
            needs={needs}
            options={scopeOptions}
            values={values}
            errors={errors}
            withRegions={false}
            onChange={set}
          />
        </div>
        {needs.regions && <p className="text-xs text-slate-500">{t('regions_after_accept')}</p>}
        <StatusLine error={message} saved={saved !== undefined} savedText={saved ?? ''} />
        <Button type="submit" disabled={invite.isPending || !scopeAvailable(needs, scopeOptions)}>
          {t('send')}
        </Button>
      </form>
    </Card>
  );
}
