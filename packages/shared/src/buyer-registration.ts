// Perakendeci kayıt formu (F2.3b, US-005 AC1, AC3, AC4; NFR-63): web ve mobil aynı doğrulamayı ve
// API hatası → alan hatası eşlemesini kullanır. Asıl doğrulama API'dedir (F2.3a); burası yalnız
// kullanıcıya erken ve alanın yanında geri bildirim içindir. Saf fonksiyonlar; birim testli.
import { z } from 'zod';

/**
 * İstemcide gösterilen veri paylaşım metninin sürümü (`docs/legal/data-sharing-v1.md`). Metin
 * istemcinin çevirilerinde (`dataSharing.v1.*`) olduğu için sürüm metinle birlikte gelir; sunucu
 * `legal.data_sharing_version` ayarıyla karşılaştırır, eşleşmezse `422 consentVersion: outdated`.
 */
export const DATA_SHARING_TEXT_VERSION = 'v1';

/** Metindeki madde sayısı (`dataSharing.v1.item<N>_title` / `_body`, N = 1..8). */
export const DATA_SHARING_ITEM_COUNT = 8;

/** Kayıtta tercih edilen dil olarak gönderilen arayüz dilleri (API'de etkin diller). */
const REGISTRATION_LANGUAGES: ReadonlySet<string> = new Set(['az', 'ru', 'tr']);

export const REGISTRATION_FIELDS = [
  'fullName',
  'legalName',
  'activityTypeId',
  'regionId',
  'consent',
] as const;
export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

export interface RegistrationValues {
  readonly fullName: string;
  readonly legalName: string;
  readonly activityTypeId: string;
  readonly regionId: string;
  readonly consent: boolean;
}

export function emptyRegistration(): RegistrationValues {
  return { fullName: '', legalName: '', activityTypeId: '', regionId: '', consent: false };
}

/** openapi `POST /api/v1/buyers/register` gövdesi. */
export interface BuyerRegisterBody {
  readonly fullName: string;
  readonly legalName: string;
  readonly activityTypeId: string;
  readonly regionId: string;
  readonly consentVersion: string;
  readonly preferredLanguage?: 'az' | 'ru' | 'tr';
}

/** Hata nedeni = `register.error.<neden>` çeviri anahtarının sonu. */
export type RegistrationReason =
  'required' | 'too_long' | 'consent_required' | 'not_found' | 'outdated' | 'invalid';

export type RegistrationFieldErrors = Partial<Record<RegistrationField, RegistrationReason>>;

const required = (max: number) => z.string().trim().min(1, 'required').max(max, 'too_long');

/** openapi sınırları (fullName 120, legalName 200). */
const registrationSchema = z.object({
  fullName: required(120),
  legalName: required(200),
  activityTypeId: z.string().trim().min(1, 'required'),
  regionId: z.string().trim().min(1, 'required'),
  consent: z.literal(true, 'consent_required'),
});

const KNOWN_REASONS: ReadonlySet<string> = new Set<RegistrationReason>([
  'required',
  'too_long',
  'consent_required',
  'not_found',
  'outdated',
]);

function reasonOf(value: unknown): RegistrationReason {
  return typeof value === 'string' && KNOWN_REASONS.has(value)
    ? (value as RegistrationReason)
    : 'invalid';
}

export type RegistrationValidation =
  | { readonly ok: true; readonly body: BuyerRegisterBody }
  | { readonly ok: false; readonly fields: RegistrationFieldErrors };

/** Formu doğrular (US-005 AC3: boş zorunlu alan işaretlenir); geçerliyse API gövdesi. */
export function validateRegistration(
  values: RegistrationValues,
  language?: string,
): RegistrationValidation {
  const parsed = registrationSchema.safeParse(values);
  if (!parsed.success) {
    const fields: RegistrationFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]) as RegistrationField;
      fields[field] ??= reasonOf(issue.message);
    }
    return { ok: false, fields };
  }
  const { fullName, legalName, activityTypeId, regionId } = parsed.data;
  const body: BuyerRegisterBody = {
    fullName,
    legalName,
    activityTypeId,
    regionId,
    consentVersion: DATA_SHARING_TEXT_VERSION,
  };
  return language !== undefined && REGISTRATION_LANGUAGES.has(language)
    ? { ok: true, body: { ...body, preferredLanguage: language as 'az' | 'ru' | 'tr' } }
    : { ok: true, body };
}

/** API alan adı → form alanı (onay sürümü onay kutusunda gösterilir). */
const API_FIELDS: Readonly<Record<string, RegistrationField>> = {
  fullName: 'fullName',
  legalName: 'legalName',
  activityTypeId: 'activityTypeId',
  regionId: 'regionId',
  consentVersion: 'consent',
};

export type RegistrationFailure =
  /** US-005 AC4: numara zaten kayıtlı → giriş akışı. */
  | { readonly kind: 'already_registered' }
  /** Kayıt anahtarı geçersiz / süresi dolmuş (15 dk) → telefonu yeniden doğrula. */
  | { readonly kind: 'expired' }
  | { readonly kind: 'fields'; readonly fields: RegistrationFieldErrors }
  /** Alana bağlanamayan hata: `errors.<KOD>` (ör. `RATE_LIMITED`). */
  | { readonly kind: 'general'; readonly code: string };

function field(error: unknown, key: 'code' | 'details'): unknown {
  return typeof error === 'object' && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

/** API hata gövdesi (`Error` şeması) → kullanıcıya gösterilecek sonuç. */
export function registrationFailure(error: unknown): RegistrationFailure {
  const raw = field(error, 'code');
  const code = typeof raw === 'string' ? raw : 'INTERNAL_ERROR';
  if (code === 'PHONE_ALREADY_REGISTERED') return { kind: 'already_registered' };
  if (code === 'UNAUTHENTICATED') return { kind: 'expired' };
  if (code !== 'VALIDATION_FAILED') return { kind: 'general', code };
  const details = field(error, 'details');
  const fields: RegistrationFieldErrors = {};
  if (typeof details === 'object' && details !== null) {
    for (const [path, reasons] of Object.entries(details)) {
      const target = API_FIELDS[path.split('.')[0] ?? ''];
      if (target === undefined) return { kind: 'general', code };
      fields[target] ??= reasonOf(Array.isArray(reasons) ? reasons[0] : reasons);
    }
  }
  return Object.keys(fields).length === 0 ? { kind: 'general', code } : { kind: 'fields', fields };
}

/**
 * Kayıt isteğinin `Idempotency-Key`'i (16–64 karakter). Form açıldığında bir kez üretilir ve
 * yeniden denemelerde aynı kalır (zayıf ağda ikinci işletme açılmaz, R12/R13). Gizli değildir;
 * Web Crypto yoksa (bazı React Native ortamları) `Math.random` yeterlidir.
 */
export function createIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  const crypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } })
    .crypto;
  if (crypto?.getRandomValues !== undefined) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `reg-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Profil doluluk yüzdesi 0–100 aralığında tam sayı (US-005 AC2 kartı). */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
