import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { use } from 'react';
import { LoginForm } from '../../../../features/auth/login-form';
import { SELLER_MODE, sellerEntry } from '../../../../features/seller-application/entry';
import { Card } from '../../../../features/ui/primitives';

/**
 * Giriş: telefon → SMS kodu → (platform rolü) TOTP (US-001, US-002, SF-01; F1.13a).
 * US-008 AC2: `onboarding.seller_mode = manual` → toptancı için kayıt seçeneği yok, yalnızca
 * "Toptancı olmak istiyorum" başvuru bağlantısı (F2.2b). Perakendeci kayıt bağlantısı (F2.3b).
 */
export default function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const t = useTranslations('sellerApplication');
  const tRegister = useTranslations('register');
  const entry = sellerEntry(SELLER_MODE, locale);
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-md space-y-6">
        <Card className="p-6 sm:p-8">
          <LoginForm />
        </Card>
        {/* F2.3b: perakendeci kendi kaydolur (US-005). */}
        <Link
          href={`/${locale}/register`}
          data-testid="buyer-register-link"
          className="group block rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 to-violet-50/60 p-5 shadow-sm backdrop-blur transition-all duration-200 hover:border-indigo-300 hover:shadow-md"
        >
          <span className="block text-sm font-semibold text-slate-900">
            {tRegister('entry_title')}
            <span
              aria-hidden="true"
              className="ml-1 inline-block text-indigo-600 transition-transform duration-200 group-hover:translate-x-0.5"
            >
              →
            </span>
          </span>
          <span className="mt-1 block text-sm text-slate-500">{tRegister('entry_body')}</span>
        </Link>
        <Link
          href={entry.href}
          data-testid="seller-application-link"
          className="group block rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm backdrop-blur transition-all duration-200 hover:border-slate-300 hover:shadow-md"
        >
          <span className="block text-sm font-semibold text-slate-900">
            {t('entry_title')}
            <span
              aria-hidden="true"
              className="ml-1 inline-block text-indigo-600 transition-transform duration-200 group-hover:translate-x-0.5"
            >
              →
            </span>
          </span>
          <span className="mt-1 block text-sm text-slate-500">{t('entry_body')}</span>
        </Link>
      </div>
    </main>
  );
}
