'use client';
// Rol düzeni (F1.13b): alanın kabuğu + yanlış alana gelinirse kendi açılış sayfasına yönlendirme.
// Bu yalnızca görünümdür; asıl kontrol API'dedir (productreport "Rol ve yetki" kuralları).
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useLogout } from '../../lib/session';
import { Button } from '../ui/primitives';
import { BusinessSelector } from './business-selector';
import { areaOf, landingPath } from './landing';
import type { ShellArea } from './menu';
import { ShellMenu } from './shell-menu';
import { useShell } from './use-shell';

export function AreaLayout({ area, children }: { area: ShellArea; children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const logout = useLogout();
  const shell = useShell();
  const me = shell.me;
  const current = me === undefined ? undefined : areaOf(me);
  const allowed =
    me !== undefined && (area === 'admin' ? (me.platformRole ?? null) !== null : current === area);

  useEffect(() => {
    if (!shell.sessionLoading && !shell.hasSession) {
      router.replace(`/${locale}/login`);
    } else if (me !== undefined && !allowed) {
      router.replace(current === undefined ? `/${locale}` : landingPath(locale, current));
    }
  }, [shell.sessionLoading, shell.hasSession, me, allowed, current, locale, router]);

  if (!allowed) {
    return (
      <p role="status" className="p-10 text-center text-sm text-slate-500">
        {t('common.loading')}
      </p>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/70 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BusinessSelector
            memberships={me.memberships ?? []}
            activeBusinessId={shell.activeBusinessId}
          />
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() => {
              logout.mutate(undefined, {
                onSettled: () => {
                  router.replace(`/${locale}/login`);
                },
              });
            }}
          >
            {t('common.logout')}
          </Button>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 lg:flex-row lg:gap-8">
        <ShellMenu
          area={area}
          permissions={(me.activeBusiness?.permissions ?? []).map((item) => item.code)}
          platformRole={me.platformRole ?? null}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
