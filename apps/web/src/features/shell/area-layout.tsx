'use client';
// Rol düzeni (F1.13b): alanın kabuğu + yanlış alana gelinirse kendi açılış sayfasına yönlendirme.
// Bu yalnızca görünümdür; asıl kontrol API'dedir (productreport "Rol ve yetki" kuralları).
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useLogout } from '../../lib/session';
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

  if (!allowed) return <p role="status">{t('common.loading')}</p>;

  return (
    <>
      <header>
        <BusinessSelector
          memberships={me.memberships ?? []}
          activeBusinessId={shell.activeBusinessId}
        />
        <button
          type="button"
          onClick={() => {
            logout.mutate(undefined, {
              onSettled: () => {
                router.replace(`/${locale}/login`);
              },
            });
          }}
        >
          {t('common.logout')}
        </button>
      </header>
      <ShellMenu
        area={area}
        permissions={(me.activeBusiness?.permissions ?? []).map((item) => item.code)}
        platformRole={me.platformRole ?? null}
      />
      <main>{children}</main>
    </>
  );
}
