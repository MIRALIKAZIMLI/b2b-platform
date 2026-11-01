'use client';
// Perakendeci açılış sayfası (US-005 AC2; F2.3b). Yeni perakendecide toptancı ve ürün yoktur: boş
// durum kartı neden boş olduğunu anlatır. "Profilinizi tamamlayın" kartı doluluk yüzdesiyle,
// yalnız profili düzenleyebilene (`business.manage`) ve profil %100 değilken görünür.
// UX: kart Indigo→Violet yumuşak zeminli, ilerleme çubuğu ince ve animasyonlu; boş durum sakin,
// kesik kenarlıklı. Dashboard kartları US-056 (F6).
import { clampPercent } from '@b2b/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useShell } from '../shell/use-shell';
import { Card, PageHeader } from '../ui/primitives';
import { useBusinessProfile } from './api';

export function canManageBusiness(
  permissions: readonly { readonly code: string }[] | undefined,
): boolean {
  return (permissions ?? []).some((permission) => permission.code === 'business.manage');
}

export function ProfileCompletionCard({ percent }: { percent: number }) {
  const t = useTranslations('profile');
  const format = useFormatter();
  const value = clampPercent(percent);
  return (
    <section
      data-testid="profile-completion"
      aria-labelledby="profile-completion-title"
      className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm transition-all duration-200 hover:border-indigo-300 hover:shadow-md"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-violet-200/40 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h2 id="profile-completion-title" className="text-base font-semibold text-slate-900">
            {t('complete_title')}
          </h2>
          <p className="max-w-md text-sm text-slate-500">{t('complete_body')}</p>
        </div>
        <p className="shrink-0 text-3xl font-semibold tracking-tight text-indigo-600 tabular-nums">
          {format.number(value / 100, { style: 'percent' })}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={t('complete_percent', { percent: value })}
        className="relative mt-5 h-2 overflow-hidden rounded-full bg-slate-200/70"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
          style={{ width: `${String(value)}%` }}
        />
      </div>
    </section>
  );
}

export function BuyerHome() {
  const tShell = useTranslations('shell');
  const tHome = useTranslations('buyer.home');
  const { me, activeBusinessId } = useShell();
  const canManage = canManageBusiness(me?.activeBusiness?.permissions);
  const profile = useBusinessProfile(activeBusinessId, canManage);
  const percent = profile.data?.profileCompleteness;

  return (
    <div className="space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader title={tShell('menu.dashboard')} />
      {percent !== undefined && percent < 100 && <ProfileCompletionCard percent={percent} />}
      <Card className="border-dashed p-8 text-center hover:shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{tHome('empty_title')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{tHome('empty_body')}</p>
      </Card>
    </div>
  );
}
