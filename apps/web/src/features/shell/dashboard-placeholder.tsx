import { useTranslations } from 'next-intl';

/** Açılış sayfası yer tutucusu; dashboard kartları US-056 (F6). */
export function DashboardPlaceholder() {
  const t = useTranslations('shell');
  return (
    <>
      <h1>{t('menu.dashboard')}</h1>
      <p>{t('dashboard_soon')}</p>
    </>
  );
}
