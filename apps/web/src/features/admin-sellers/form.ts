// Toptancı açma formu (F2.1b, US-009 AC1, AC4): istemci doğrulaması (Zod) ve API hatalarının alan
// hatalarına çevrilmesi. Saf fonksiyonlar; birim testli. Asıl doğrulama API'dedir (F2.1a).
import type { paths } from '@b2b/api-client';
import { VOEN_PATTERN } from '@b2b/shared';
import { z } from 'zod';
import { errorCodeOf } from '../../lib/error-code';

/** openapi `POST /api/v1/admin/sellers` gövdesi (üretilmiş tip). */
export type CreateSellerBody = NonNullable<
  paths['/api/v1/admin/sellers']['post']['requestBody']
>['content']['application/json'];

/** Para birimi ve saat dilimi varsayılanları (D17; kart kararı: ayrı liste ucu yok). */
export const DEFAULT_CURRENCY = 'AZN';
export const DEFAULT_TIMEZONE = 'Asia/Baku';

export const SELLER_FIELDS = [
  'legalName',
  'voen',
  'regionId',
  'addressLine',
  'ownerName',
  'ownerPhone',
  'planId',
  'serviceAreaRegionIds',
  'currency',
  'timezone',
] as const;
export type SellerField = (typeof SELLER_FIELDS)[number];

export interface SellerFormValues {
  legalName: string;
  voen: string;
  regionId: string;
  addressLine: string;
  ownerName: string;
  ownerPhone: string;
  planId: string;
  serviceAreaRegionIds: string[];
  currency: string;
  timezone: string;
}

export function emptySellerForm(): SellerFormValues {
  return {
    legalName: '',
    voen: '',
    regionId: '',
    addressLine: '',
    ownerName: '',
    ownerPhone: '',
    planId: '',
    serviceAreaRegionIds: [],
    currency: DEFAULT_CURRENCY,
    timezone: DEFAULT_TIMEZONE,
  };
}

const required = (max: number) => z.string().trim().min(1, 'required').max(max, 'too_long');

/** openapi `POST /api/v1/admin/sellers` sınırları; mesaj = çeviri anahtarı sonu. */
export const sellerFormSchema = z.object({
  legalName: required(200),
  voen: z.string().trim().regex(VOEN_PATTERN, 'VOEN_INVALID'),
  regionId: z.string().min(1, 'required'),
  addressLine: z.string().trim().max(300, 'too_long'),
  ownerName: required(120),
  ownerPhone: required(20),
  planId: z.string().min(1, 'required'),
  serviceAreaRegionIds: z.array(z.string()).max(200, 'too_long'),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'invalid_currency'),
  timezone: required(64),
});

/** `adminSellers.form.error.<neden>` anahtarı olan nedenler; diğerleri `invalid`. */
const KNOWN_REASONS: ReadonlySet<string> = new Set([
  'required',
  'too_long',
  'VOEN_INVALID',
  'VOEN_ALREADY_REGISTERED',
  'invalid_phone',
  'invalid_plan',
  'not_found',
  'inactive_currency',
  'invalid_currency',
  'invalid_timezone',
]);

const FIELD_SET: ReadonlySet<string> = new Set(SELLER_FIELDS);

export type FieldErrors = Partial<Record<SellerField, string>>;

function reasonKey(reason: unknown): string {
  return typeof reason === 'string' && KNOWN_REASONS.has(reason) ? reason : 'invalid';
}

export type ValidationResult =
  | { readonly ok: true; readonly body: CreateSellerBody }
  | { readonly ok: false; readonly fields: FieldErrors };

/** Formu doğrular; geçerliyse API gövdesi (boş adres gönderilmez). */
export function validateSellerForm(values: SellerFormValues): ValidationResult {
  const parsed = sellerFormSchema.safeParse(values);
  if (!parsed.success) {
    const fields: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]) as SellerField;
      fields[field] ??= reasonKey(issue.message);
    }
    return { ok: false, fields };
  }
  const { addressLine, ...rest } = parsed.data;
  return { ok: true, body: addressLine === '' ? rest : { ...rest, addressLine } };
}

export interface ApiFormErrors {
  readonly fields: FieldErrors;
  /** Alana bağlanamayan hata: `errors.<KOD>` kodu. */
  readonly general?: string;
}

/**
 * API hatası → alan hataları: `409 VOEN_ALREADY_REGISTERED` VÖEN alanında (US-009 AC4);
 * `422 VALIDATION_FAILED` `details` alanlarından. Bilinmeyen alan/kod genel hata olur.
 */
export function apiFormErrors(error: unknown): ApiFormErrors {
  const code = errorCodeOf(error);
  if (code === 'VOEN_ALREADY_REGISTERED') return { fields: { voen: code } };
  if (code !== 'VALIDATION_FAILED') return { fields: {}, general: code };
  const details =
    typeof error === 'object' && error !== null && 'details' in error ? error.details : undefined;
  const fields: FieldErrors = {};
  let unmatched = false;
  if (typeof details === 'object' && details !== null) {
    for (const [path, reasons] of Object.entries(details)) {
      const field = path.split('.')[0] ?? '';
      if (!FIELD_SET.has(field)) {
        unmatched = true;
        continue;
      }
      fields[field as SellerField] ??= reasonKey(Array.isArray(reasons) ? reasons[0] : reasons);
    }
  }
  return unmatched || Object.keys(fields).length === 0 ? { fields, general: code } : { fields };
}
