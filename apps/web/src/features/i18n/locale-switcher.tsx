'use client';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ME_KEY, webApi } from '../../lib/session';

type LanguageCode = 'az' | 'ru' | 'tr' | 'en';

/** Dil seçici (US-058 AC1): adres dili değişir; oturum varsa seçim profile yazılır (`PATCH /me`). */
export function LocaleSwitcher({ locales }: { locales: readonly LanguageCode[] }) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function choose(next: LanguageCode) {
    if (next === current) return;
    if (webApi.hasSession()) {
      await webApi.client.PATCH('/api/v1/me', { body: { preferredLanguage: next } });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    }
    const rest = pathname.split('/').slice(2).join('/');
    router.replace(`/${next}${rest === '' ? '' : `/${rest}`}`);
  }

  return (
    <nav aria-label={t('common.language')}>
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === current}
          onClick={() => void choose(code)}
        >
          {t(`languages.${code}`)}
        </button>
      ))}
    </nav>
  );
}
