'use client';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { ME_KEY, webApi } from '../../lib/session';

type LanguageCode = 'az' | 'ru' | 'tr' | 'en';

/**
 * Dil seçici (US-058 AC1): adres dili değişir; oturum varsa seçim profile yazılır (`PATCH /me`).
 * Profil yazılamazsa dil değişmez, hata gösterilir (PR #31 Müfettiş notu L3).
 */
export function LocaleSwitcher({ locales }: { locales: readonly LanguageCode[] }) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>();

  async function choose(next: LanguageCode) {
    if (next === current) return;
    setError(undefined);
    if (webApi.hasSession()) {
      try {
        const { error: failure } = await webApi.client.PATCH('/api/v1/me', {
          body: { preferredLanguage: next },
        });
        if (failure !== undefined) {
          setError(errorCodeOf(failure));
          return;
        }
      } catch (failure) {
        setError(errorCodeOf(failure));
        return;
      }
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
      {error !== undefined && <p role="alert">{t(`errors.${error}`)}</p>}
    </nav>
  );
}
