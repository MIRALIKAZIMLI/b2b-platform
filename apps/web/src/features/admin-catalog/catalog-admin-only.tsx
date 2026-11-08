'use client';
// Sayfa düzeyinde görünürlük (F2.9b, V1): katalog ekranlarını yalnız süper admin ve içerik ekibi
// görür; diğer platform rolleri platform açılış sayfasına döner. Asıl kontrol API'dedir
// (`@RequirePlatformRole`).
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { landingPath } from '../shell/landing';
import { CATALOG_ADMIN_ROLES, platformRoleAllows } from '../shell/menu';
import { useShell } from '../shell/use-shell';

export function CatalogAdminOnly({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const me = useShell().me;
  const allowed =
    me !== undefined && platformRoleAllows(CATALOG_ADMIN_ROLES, me.platformRole ?? null);

  useEffect(() => {
    if (me !== undefined && !allowed) router.replace(landingPath(locale, 'admin'));
  }, [me, allowed, locale, router]);

  if (!allowed) return <p role="status">{t('loading')}</p>;
  return <>{children}</>;
}
