'use client';
// Açık davetler (US-013 AC1–AC2): telefon, unvan, rol, bitiş tarihi; iki adımlı "Geri çek".
// Geri çekilen davet `users.max` yerini boşaltır (F2.7 K2).
import { formatDate, type TimeZoneChain, teamFailure } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError, type Option } from '../admin-sellers/api';
import { StatusLine } from '../seller-settings/status';
import { Button, Card } from '../ui/primitives';
import { type TeamInvitation, useTeamMutations } from './api';

const nameOf = (list: readonly Option[], id: string) => list.find((item) => item.id === id)?.label;

export function InvitationList({
  businessId,
  invitations,
  roleOptions,
  jobTitles,
  timeZone,
}: {
  businessId: string | undefined;
  invitations: readonly TeamInvitation[] | undefined;
  roleOptions: readonly Option[];
  jobTitles: readonly Option[];
  timeZone: TimeZoneChain;
}) {
  const t = useTranslations('team');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const { revoke } = useTeamMutations(businessId);
  const [confirming, setConfirming] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const list = invitations ?? [];

  function onRevoke(id: string) {
    setMessage(undefined);
    setSaved(false);
    revoke.mutate(id, {
      onSuccess: () => {
        setConfirming(undefined);
        setSaved(true);
      },
      onError: (failure) => {
        setConfirming(undefined);
        const outcome = teamFailure(failure instanceof ApiError ? failure : undefined, []);
        setMessage(outcome.kind === 'code' ? tErrors(outcome.code) : t('error.plan_limit'));
      },
    });
  }

  return (
    <div className="space-y-4">
      <StatusLine error={message} saved={saved} savedText={t('revoked')} />
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{t('invitations.title')}</h2>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {t('invitations.count', { count: list.length })}
          </span>
        </div>
        {invitations === undefined ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">{t('loading')}</p>
        ) : list.length === 0 ? (
          <div className="space-y-1 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">{t('invitations.empty')}</p>
            <p className="text-sm text-slate-500">{t('invitations.empty_hint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((invitation) => (
              <li
                key={invitation.id}
                data-testid="invitation-row"
                className="flex flex-col gap-3 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-900 tabular-nums">
                    {invitation.phone}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {nameOf(jobTitles, invitation.jobTitleId) ?? '—'}
                    {' · '}
                    {nameOf(roleOptions, invitation.roleId) ?? '—'}
                    {' · '}
                    {t('invitations.expires', {
                      date: formatDate(invitation.expiresAt, locale, timeZone),
                    })}
                  </p>
                </div>
                {confirming === invitation.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-600">{t('revoke_confirm')}</span>
                    <Button
                      variant="quiet-danger"
                      className="border-rose-200 bg-white text-rose-700"
                      disabled={revoke.isPending}
                      onClick={() => {
                        onRevoke(invitation.id);
                      }}
                    >
                      {t('revoke_yes')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setConfirming(undefined);
                      }}
                    >
                      {t('cancel')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="quiet-danger"
                    disabled={revoke.isPending}
                    onClick={() => {
                      setMessage(undefined);
                      setSaved(false);
                      setConfirming(invitation.id);
                    }}
                  >
                    {t('revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
