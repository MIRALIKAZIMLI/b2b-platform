import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { createMessageLoader, FALLBACK_LOCALE, toNested, withFallback } from '../lib/i18n';
import { routing } from './routing';

/** Sunucudan API'ye doğrudan adres (tarayıcı aynı kökeni, Next rewrite'ı kullanır). */
export const loadMessages = createMessageLoader({
  baseUrl: process.env.API_URL ?? 'http://localhost:3000',
});

export default getRequestConfig(async () => {
  const requested = await rootLocale();
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const [primary, fallback] = await Promise.all([
    loadMessages(locale),
    locale === FALLBACK_LOCALE ? undefined : loadMessages(FALLBACK_LOCALE),
  ]);
  // Etkin olmayan dil (ör. pasif `en`, US-058 AC4) sayfa olarak açılmaz.
  if (primary.status === 'not_found') notFound();
  const base = fallback?.status === 'ok' ? fallback.values : {};
  return {
    locale,
    messages: toNested(withFallback(primary.values, base)),
    // Hiçbir dilde olmayan anahtar: anahtarın kendisi gösterilir, sayfa çökmez.
    getMessageFallback: ({ namespace, key }) =>
      namespace === undefined ? key : `${namespace}.${key}`,
  };
});
