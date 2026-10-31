import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { use } from 'react';
import { SellerApplicationForm } from '../../../../features/seller-application/application-form';

/** "Toptancı olmak istiyorum" (F2.2b, US-008 AC1): kimliksiz başvuru formu. */
export default function SellerApplicationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const t = useTranslations('sellerApplication');
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-xl space-y-8">
        <header className="space-y-3 text-center">
          <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </header>
        <SellerApplicationForm />
        <p className="text-center text-sm text-slate-500">
          {t('have_account')}{' '}
          <Link
            href={`/${locale}/login`}
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            {t('login')}
          </Link>
        </p>
      </div>
    </main>
  );
}
