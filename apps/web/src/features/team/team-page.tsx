'use client';
// Ekip ekranı (F2.7b, US-013), seller ve buyer alanında ortak. UX kararları: üstte başlık ve tek
// ana eylem "Dəvət et" (form sayfa içinde açılır, liste bağlamı kaybolmaz); altında üyeler kartı,
// en altta açık davetler kartı. Satır eylemleri ikincil düğme; çıkarma ve geri çekme iki adımlı
// onaylı (rose yalnız onay kutusunda). `team.manage` yoksa bilgi kartı (menüde de görünmez, AC5).
import { pickLocalizedText, type TimeZoneChain } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useRegionOptions } from '../admin-sellers/api';
import { DEFAULT_TIMEZONE } from '../admin-sellers/form';
import { useWarehouses } from '../seller-settings/api';
import { LoadFailed } from '../seller-settings/status';
import { useShell } from '../shell/use-shell';
import { Button, Card, PageHeader } from '../ui/primitives';
import { useJobTitles, useTeamInvitations, useTeamMembers, useTeamRoles } from './api';
import { InvitationList } from './invitation-list';
import { InviteCard } from './invite-card';
import { MemberList } from './member-list';
import type { ScopeOptions } from './scope-fields';

export function TeamPage() {
  const t = useTranslations('team');
  const locale = useLocale();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const permissions = shell.me?.activeBusiness?.permissions ?? [];
  const allowed = permissions.some((item) => item.code === 'team.manage');
  const isSeller = shell.me?.activeBusiness?.capability === 'seller';
  const canReadWarehouses = isSeller && permissions.some((item) => item.code === 'business.manage');
  const scoped = allowed ? businessId : undefined;

  const members = useTeamMembers(scoped);
  const invitations = useTeamInvitations(scoped);
  const roles = useTeamRoles(scoped);
  const jobTitles = useJobTitles(scoped);
  const warehouses = useWarehouses(canReadWarehouses ? scoped : undefined);
  const regions = useRegionOptions(locale);
  const [inviting, setInviting] = useState(false);

  const roleOptions = useMemo(
    () =>
      (roles.data ?? []).map((role) => ({
        id: role.id,
        label: pickLocalizedText(role.name, locale) ?? role.id,
      })),
    [roles.data, locale],
  );
  const titleOptions = useMemo(
    () =>
      (jobTitles.data ?? []).map((title) => ({
        id: title.id,
        label: pickLocalizedText(title.name, locale) ?? title.code,
        roleTemplateId: title.roleTemplateId,
      })),
    [jobTitles.data, locale],
  );
  const scopeOptions = useMemo<ScopeOptions>(
    () => ({
      warehouses: warehouses.data
        ?.filter((item) => item.status === 'active')
        .map((item) => ({ id: item.id, label: item.name })),
      // Şube listesi uç noktası F2.5'te (US-010); o zamana kadar şube kapsamlı rol atanamaz.
      branches: undefined,
      regions: regions.data ?? [],
    }),
    [warehouses.data, regions.data],
  );
  const timeZone: TimeZoneChain = {
    user: shell.me?.timezone ?? null,
    business: shell.me?.activeBusiness?.timezone ?? null,
    country: DEFAULT_TIMEZONE,
  };

  if (shell.me !== undefined && !allowed) {
    return (
      <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
        <PageHeader title={t('title')} />
        <Card className="max-w-xl p-8">
          <p role="alert" className="text-sm text-slate-600">
            {t('no_access')}
          </p>
        </Card>
      </div>
    );
  }

  const failed = members.isError || invitations.isError || roles.isError || jobTitles.isError;
  const ready = roles.data !== undefined && jobTitles.data !== undefined;

  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          !inviting && (
            <Button
              disabled={!ready}
              onClick={() => {
                setInviting(true);
              }}
            >
              {t('invite_open')}
            </Button>
          )
        }
      />
      {failed ? (
        <div className="max-w-4xl">
          <LoadFailed
            onRetry={() => {
              void members.refetch();
              void invitations.refetch();
              void roles.refetch();
              void jobTitles.refetch();
            }}
          />
        </div>
      ) : (
        <div className="max-w-4xl space-y-8">
          {inviting && ready && (
            <InviteCard
              businessId={businessId}
              roles={roles.data}
              roleOptions={roleOptions}
              jobTitles={titleOptions}
              scopeOptions={scopeOptions}
              onClose={() => {
                setInviting(false);
              }}
            />
          )}
          <MemberList
            businessId={businessId}
            members={ready ? members.data : undefined}
            roles={roles.data ?? []}
            roleOptions={roleOptions}
            jobTitles={titleOptions}
            scopeOptions={scopeOptions}
          />
          <InvitationList
            businessId={businessId}
            invitations={ready ? invitations.data : undefined}
            roleOptions={roleOptions}
            jobTitles={titleOptions}
            timeZone={timeZone}
          />
        </div>
      )}
    </div>
  );
}
