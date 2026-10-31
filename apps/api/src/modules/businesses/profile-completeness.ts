// Perakendeci profil doluluk yüzdesi (US-005 AC2; data-model `businesses.profile_completeness`).
// VARSAYIM (F2.3a K10, Mimar onayı; belgede formül yok): 10 alanın her biri %10. Kayıtta ünvan,
// faaliyet türü, bölge ve yetkili adı dolu → 40. F2.4 (VÖEN), F2.5 (şube adresi) ve F2.10
// (gizlilik/profil) bu fonksiyonla yeniden hesaplar.
export const PROFILE_FIELDS = [
  'legalName',
  'activityType',
  'region',
  'contactName',
  'voen',
  'addressLine',
  'businessPhone',
  'logo',
  'email',
  'branchAddress',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

export function profileCompleteness(filled: ReadonlySet<ProfileField>): number {
  const count = PROFILE_FIELDS.filter((field) => filled.has(field)).length;
  return Math.round((count * 100) / PROFILE_FIELDS.length);
}

/** Kayıt anında dolu olan alanlar. */
export const SIGNUP_FILLED_FIELDS: ReadonlySet<ProfileField> = new Set([
  'legalName',
  'activityType',
  'region',
  'contactName',
]);
