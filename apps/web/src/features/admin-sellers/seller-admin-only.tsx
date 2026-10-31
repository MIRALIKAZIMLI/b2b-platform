'use client';
// Sayfa düzeyinde görünürlük (F2.1b-AC5): toptancı ekranlarını yalnız S1 rolleri (super_admin,
// operations) görür; diğer platform rolleri platform açılış sayfasına döner. İşletme kullanıcısını
// `(admin)` düzeni zaten kendi alanına yönlendirir. Asıl kontrol API'dedir (`@RequirePlatformRole`).
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { landingPath } from '../shell/landing';
import { platformRoleAllows, SELLER_ADMIN_ROLES } from '../shell/menu';
import { useShell } from '../shell/use-shell';

export function SellerAdminOnly({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const me = useShell().me;
  const allowed =
    me !== undefined && platformRoleAllows(SELLER_ADMIN_ROLES, me.platformRole ?? null);

  useEffect(() => {
    if (me !== undefined && !allowed) router.replace(landingPath(locale, 'admin'));
  }, [me, allowed, locale, router]);

  if (!allowed) return <p role="status">{t('loading')}</p>;
  return <>{children}</>;
}
