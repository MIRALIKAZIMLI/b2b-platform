'use client';
// Ana sayfa (F1.13b): oturum yoksa giriş; varsa seçili işletmenin (veya platform rolünün) açılış
// sayfası. Hiçbir alan yoksa (üyelik yok) bilgi mesajı.
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { areaOf, landingPath } from './landing';
import { useShell } from './use-shell';

export function HomeRedirect() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const shell = useShell();
  const area = shell.me === undefined ? undefined : areaOf(shell.me);

  useEffect(() => {
    if (!shell.sessionLoading && !shell.hasSession) router.replace(`/${locale}/login`);
    else if (area !== undefined) router.replace(landingPath(locale, area));
  }, [shell.sessionLoading, shell.hasSession, area, locale, router]);

  if (shell.me !== undefined && area === undefined) return <p>{t('shell.no_business')}</p>;
  return <p role="status">{t('common.loading')}</p>;
}
