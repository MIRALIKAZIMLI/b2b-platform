import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Providers } from '../../features/auth/providers';
import { LocaleSwitcher } from '../../features/i18n/locale-switcher';
import { loadMessages } from '../../i18n/request';
import { BASE_LOCALES, routing, type Locale } from '../../i18n/routing';

/** `en` yalnızca API'de etkinse (US-058 AC4). */
async function availableLocales(): Promise<Locale[]> {
  const en = await loadMessages('en');
  return en.status === 'ok' ? [...BASE_LOCALES, 'en'] : [...BASE_LOCALES];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const locales = await availableLocales();
  if (!locales.includes(locale)) notFound();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <Providers locale={locale}>
            <LocaleSwitcher locales={locales} />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
