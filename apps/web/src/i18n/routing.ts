import { defineRouting } from 'next-intl/routing';

/**
 * Arayüz dilleri (US-058). `en` yalnızca API'de etkinse açılır (AC4): layout `/i18n/en` 404 dönerse
 * sayfayı bulunamadı yapar ve dil seçici göstermez. Varsayılan `az`.
 */
export const routing = defineRouting({
  locales: ['az', 'ru', 'tr', 'en'],
  defaultLocale: 'az',
});

export type Locale = (typeof routing.locales)[number];

/** Her zaman açık diller; `en` etkinliğe bağlı. */
export const BASE_LOCALES: readonly Locale[] = ['az', 'ru', 'tr'];
