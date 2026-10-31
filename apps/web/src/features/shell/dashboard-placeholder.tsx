import { useTranslations } from 'next-intl';
import { PageHeader } from '../ui/primitives';

/** Açılış sayfası yer tutucusu; dashboard kartları US-056 (F6). */
export function DashboardPlaceholder() {
  const t = useTranslations('shell');
  return (
    <div className="px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader title={t('menu.dashboard')} description={t('dashboard_soon')} />
    </div>
  );
}
