'use client';
// Sayfa düzeyinde görünürlük (F2.19 T1): ayar ekranını yalnız süper admin görür; diğer platform
// rolleri açılış sayfasına döner. Asıl kontrol API'de (`@RequirePlatformRole`).
import { SETTINGS_ADMIN_ROLES } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { landingPath } from '../shell/landing';
import { platformRoleAllows } from '../shell/menu';
import { useShell } from '../shell/use-shell';

export function SettingsAdminOnly({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const me = useShell().me;
  const allowed =
    me !== undefined && platformRoleAllows(SETTINGS_ADMIN_ROLES, me.platformRole ?? null);

  useEffect(() => {
    if (me !== undefined && !allowed) router.replace(landingPath(locale, 'admin'));
  }, [me, allowed, locale, router]);

  if (!allowed) return <p role="status">{t('loading')}</p>;
  return <>{children}</>;
}
