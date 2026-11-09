// İşletme profili / VÖEN formu (F2.4, US-006 AC1–AC3; F2.10b yetkili adı, kişisel telefon, e-posta):
// web ve mobil aynı doğrulamayı ve API hatası → alan hatası eşlemesini kullanır. Asıl doğrulama API'dedir (`PATCH /api/v1/business`); burası
// alanın yanında erken geri bildirim içindir. Saf fonksiyonlar; birim testli.
import { z } from 'zod';
import { VOEN_PATTERN } from './voen';

export const PROFILE_FORM_FIELDS = [
  'voen',
  'legalName',
  'regionId',
  'addressLine',
  'businessPhone',
  // F2.10b: 🔒 kişisel veri (`person_data`).
  'contactName',
  'personalPhone',
  'email',
] as const;
export type ProfileFormField = (typeof PROFILE_FORM_FIELDS)[number];

/** Formdaki değerler; boş metin = alan girilmemiş. */
export type ProfileFormValues = Readonly<Record<ProfileFormField, string>>;

/** Boşaltılınca `null` gönderilerek silinebilen alanlar (F2.10b VARSAYIM V5). */
export const CLEARABLE_PROFILE_FIELDS = ['personalPhone', 'email'] as const;
type ClearableField = (typeof CLEARABLE_PROFILE_FIELDS)[number];

/** openapi `BusinessUpdate`; yalnız değişen alanlar gönderilir. */
export type BusinessProfileBody = Partial<
  Record<Exclude<ProfileFormField, ClearableField>, string>
> &
  Partial<Record<ClearableField, string | null>> & { logoFileId?: string | null };

/** Hata nedeni = `businessProfile.error.<neden>` çeviri anahtarının sonu. */
export type ProfileFormReason =
  | 'required'
  | 'too_long'
  | 'voen_invalid'
  | 'voen_taken'
  | 'voen_locked'
  | 'phone_invalid'
  | 'email_invalid'
  | 'not_found'
  | 'invalid';

export type ProfileFieldErrors = Partial<Record<ProfileFormField, ProfileFormReason>>;

/** API `Business` yanıtının formun kullandığı kısmı. */
export interface ProfileSource {
  readonly voen?: string | null;
  readonly legalName?: string;
  readonly regionId?: string;
  readonly addressLine?: string | null;
  readonly businessPhone?: string | null;
  readonly contactName?: string | null;
  readonly personalPhone?: string | null;
  readonly email?: string | null;
  readonly verified?: boolean;
}

export function profileFormValues(source: ProfileSource | undefined): ProfileFormValues {
  return {
    voen: source?.voen ?? '',
    legalName: source?.legalName ?? '',
    regionId: source?.regionId ?? '',
    addressLine: source?.addressLine ?? '',
    businessPhone: source?.businessPhone ?? '',
    contactName: source?.contactName ?? '',
    personalPhone: source?.personalPhone ?? '',
    email: source?.email ?? '',
  };
}

/** Rozet: VÖEN yok / doğrulama bekliyor (US-006 AC2) / doğrulandı. */
export type VoenStatus = 'missing' | 'pending' | 'verified';

export function voenStatus(source: ProfileSource | undefined): VoenStatus {
  if (source?.voen === null || source?.voen === undefined || source.voen === '') return 'missing';
  return source.verified === true ? 'verified' : 'pending';
}

/** Hukuki tip VÖEN'in son hanesinden (çeviri `businessProfile.legal_type.<tip>`). */
export function legalTypeHint(
  voen: string,
): 'legal_entity' | 'individual_entrepreneur' | undefined {
  if (!VOEN_PATTERN.test(voen)) return undefined;
  return voen.endsWith('1') ? 'legal_entity' : 'individual_entrepreneur';
}

const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,19}$/;
/** openapi `PhoneE164` (kişisel telefon). */
export const PHONE_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

const formSchema = z.object({
  voen: z.string().refine((value) => value === '' || VOEN_PATTERN.test(value), 'voen_invalid'),
  legalName: z.string().trim().min(1, 'required').max(200, 'too_long'),
  regionId: z.string().trim().min(1, 'required'),
  addressLine: z.string().trim().max(300, 'too_long'),
  businessPhone: z
    .string()
    .trim()
    .refine((value) => value === '' || PHONE_PATTERN.test(value), 'phone_invalid'),
  contactName: z.string().trim().min(1, 'required').max(120, 'too_long'),
  personalPhone: z
    .string()
    .trim()
    .refine((value) => value === '' || PHONE_E164_PATTERN.test(value), 'phone_invalid'),
  email: z
    .string()
    .trim()
    .max(254, 'too_long')
    .refine((value) => value === '' || z.email().safeParse(value).success, 'email_invalid'),
});

const KNOWN_REASONS: ReadonlySet<string> = new Set<ProfileFormReason>([
  'required',
  'too_long',
  'voen_invalid',
  'voen_taken',
  'voen_locked',
  'phone_invalid',
  'email_invalid',
  'not_found',
]);

function reasonOf(value: unknown): ProfileFormReason {
  return typeof value === 'string' && KNOWN_REASONS.has(value)
    ? (value as ProfileFormReason)
    : 'invalid';
}

export type ProfileValidation =
  | { readonly ok: true; readonly body: BusinessProfileBody }
  | { readonly ok: false; readonly fields: ProfileFieldErrors };

/**
 * Formu doğrular (US-006 AC1: VÖEN 10 rakam, son hane 1/2; boşluk kırpılmaz). Geçerliyse yalnız
 * değişen alanlar gövdeye girer. Boşaltılan kişisel telefon / e-posta `null` olarak gider (silme,
 * F2.10b V5); diğer boşaltılan isteğe bağlı alanlar gönderilmez. VÖEN bir kez girildiyse silinemez
 * (K3) → `voen_invalid`. Yetkili adı zorunludur.
 */
export function validateProfile(
  values: ProfileFormValues,
  initial: ProfileFormValues,
): ProfileValidation {
  const parsed = formSchema.safeParse(values);
  const fields: ProfileFieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]) as ProfileFormField;
      fields[field] ??= reasonOf(issue.message);
    }
  }
  if (initial.voen !== '' && values.voen === '') fields.voen ??= 'voen_invalid';
  if (Object.keys(fields).length > 0 || !parsed.success) return { ok: false, fields };

  const body: Record<string, string | null> = {};
  for (const field of PROFILE_FORM_FIELDS) {
    const value = parsed.data[field];
    if (value === initial[field]) continue;
    if (value !== '') body[field] = value;
    else if ((CLEARABLE_PROFILE_FIELDS as readonly ProfileFormField[]).includes(field)) {
      body[field] = null;
    }
  }
  return { ok: true, body };
}

export type ProfileFailure =
  | { readonly kind: 'fields'; readonly fields: ProfileFieldErrors }
  /** Alana bağlanamayan hata: `errors.<KOD>`. */
  | { readonly kind: 'general'; readonly code: string };

function prop(error: unknown, key: 'code' | 'details'): unknown {
  return typeof error === 'object' && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

const API_REASONS: Readonly<Record<string, ProfileFormReason>> = {
  VOEN_INVALID: 'voen_invalid',
  invalid_phone: 'phone_invalid',
  invalid_email: 'email_invalid',
  not_found: 'not_found',
};

/** API hata gövdesi → alan hatası (AC1 `VOEN_INVALID`, AC3 `VOEN_ALREADY_REGISTERED`) veya genel. */
export function profileFailure(error: unknown): ProfileFailure {
  const raw = prop(error, 'code');
  const code = typeof raw === 'string' ? raw : 'INTERNAL_ERROR';
  if (code === 'VOEN_ALREADY_REGISTERED') return { kind: 'fields', fields: { voen: 'voen_taken' } };
  if (code === 'CAPABILITY_REQUIRED') return { kind: 'fields', fields: { voen: 'voen_locked' } };
  if (code !== 'VALIDATION_FAILED') return { kind: 'general', code };
  const details = prop(error, 'details');
  const fields: ProfileFieldErrors = {};
  if (typeof details === 'object' && details !== null) {
    for (const [path, reasons] of Object.entries(details)) {
      const field = path.split('.')[0] as ProfileFormField;
      if (!PROFILE_FORM_FIELDS.includes(field)) return { kind: 'general', code };
      const first: unknown = Array.isArray(reasons) ? reasons[0] : reasons;
      fields[field] ??= reasonOf(typeof first === 'string' ? (API_REASONS[first] ?? first) : first);
    }
  }
  return Object.keys(fields).length === 0 ? { kind: 'general', code } : { kind: 'fields', fields };
}
