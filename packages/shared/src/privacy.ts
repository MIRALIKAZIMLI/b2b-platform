// Perakendeci görünürlük ayarları (F2.10, US-007 AC1–AC3, ADR-0014). API, web ve mobil aynı
// listeyi kullanır. Ünvan, faaliyet alanı ve şehir/rayon her zaman açıktır; bunların anahtarı
// yoktur (AC3: kapatma seçeneği sunulmaz). Yalnız "dizinde görün" tamamen kapatılabilir.
import { z } from 'zod';

/** Perakendecinin tek tek açabileceği alanlar (ADR-0014 §2); varsayılan hepsi kapalı. */
export const PRIVACY_FIELD_KEYS = [
  'showLogo',
  'showAddress',
  'showBusinessPhone',
  'showVoen',
  'showContactName',
  // Kişisel telefon ve e-posta birlikte (data-model `show_personal_contact`; US-007 AC2).
  'showPersonalContact',
] as const;
export type PrivacyFieldKey = (typeof PRIVACY_FIELD_KEYS)[number];

/** Bağlantısız toptancıya her zaman görünen alanlar (ADR-0014 §1); ekranda kilitli satır. */
export const ALWAYS_VISIBLE_FIELDS = ['legalName', 'activityType', 'region'] as const;
export type AlwaysVisibleField = (typeof ALWAYS_VISIBLE_FIELDS)[number];

export type PrivacyKey = 'listedInDirectory' | PrivacyFieldKey;

/** openapi `Privacy`. */
export type PrivacySettings = Readonly<Record<PrivacyKey, boolean>>;

/** Yeni kayıt varsayılanı (US-007 AC1): dizinde görünür, ek alanların hepsi kapalı. */
export const DEFAULT_PRIVACY: PrivacySettings = {
  listedInDirectory: true,
  showLogo: false,
  showAddress: false,
  showBusinessPhone: false,
  showVoen: false,
  showContactName: false,
  showPersonalContact: false,
};

/**
 * `PUT /api/v1/business/privacy` gövdesi: yedi anahtarın hepsi zorunlu, başka anahtar yok
 * (AC3: `showLegalName` gibi bir alan 422).
 */
export const privacyBodySchema = z.strictObject({
  listedInDirectory: z.boolean(),
  showLogo: z.boolean(),
  showAddress: z.boolean(),
  showBusinessPhone: z.boolean(),
  showVoen: z.boolean(),
  showContactName: z.boolean(),
  showPersonalContact: z.boolean(),
});

/** Değişen anahtarlar (sıra sabit); boşsa kaydetmeye gerek yok. */
export function changedPrivacyKeys(before: PrivacySettings, after: PrivacySettings): PrivacyKey[] {
  const keys: PrivacyKey[] = ['listedInDirectory', ...PRIVACY_FIELD_KEYS];
  return keys.filter((key) => before[key] !== after[key]);
}
