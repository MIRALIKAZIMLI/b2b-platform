import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { use } from 'react';
import { LoginForm } from '../../../../features/auth/login-form';
import { Card } from '../../../../features/ui/primitives';

/**
 * Perakendeci self-servis kaydı (US-005, SF-02; F2.3b): telefon → SMS kodu → işletme formu +
 * veri paylaşım onayı → oturum açılır, perakendeci alanına geçilir. Kayıtlı numara girişe döner.
 */
export default function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const t = useTranslations('register');
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/60 px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-lg space-y-6">
        <Card className="p-6 sm:p-8">
          <LoginForm intent="register" />
        </Card>
        <p className="text-center text-sm text-slate-500">
          {t('have_account')}{' '}
          <Link
            href={`/${locale}/login`}
            className="font-semibold text-indigo-600 transition-colors duration-200 hover:text-indigo-500"
          >
            {t('go_login')}
          </Link>
        </p>
      </div>
    </main>
  );
}
