'use client';
// Sayfa düzeyinde görünürlük (F2.18b): perakendeci ekranını süper admin, operasyon ve destek
// görür (destek yalnız okur); diğer platform rolleri açılış sayfasına döner. Asıl kontrol API'de.
import { BUYER_ADMIN_READ_ROLES } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { landingPath } from '../shell/landing';
import { platformRoleAllows } from '../shell/menu';
import { useShell } from '../shell/use-shell';

export function BuyerAdminOnly({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const me = useShell().me;
  const allowed =
    me !== undefined && platformRoleAllows(BUYER_ADMIN_READ_ROLES, me.platformRole ?? null);

  useEffect(() => {
    if (me !== undefined && !allowed) router.replace(landingPath(locale, 'admin'));
  }, [me, allowed, locale, router]);

  if (!allowed) return <p role="status">{t('loading')}</p>;
  return <>{children}</>;
}
