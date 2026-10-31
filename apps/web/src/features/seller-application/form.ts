// Toptancı başvuru formu (F2.2b, US-008 AC1, AC3): istemci doğrulaması (Zod) ve API hatalarının
// alan hatalarına çevrilmesi. Saf fonksiyonlar; birim testli. Asıl doğrulama API'dedir (F2.2a).
import type { paths } from '@b2b/api-client';
import { VOEN_PATTERN } from '@b2b/shared';
import { z } from 'zod';
import { errorCodeOf } from '../../lib/error-code';

/** openapi `POST /api/v1/seller-applications` gövdesi (üretilmiş tip). */
export type SellerApplicationBody =
  paths['/api/v1/seller-applications']['post']['requestBody']['content']['application/json'];

export const APPLICATION_FIELDS = [
  'legalName',
  'voen',
  'contactName',
  'phone',
  'regionId',
  'categoryNote',
] as const;
export type ApplicationField = (typeof APPLICATION_FIELDS)[number];

export type ApplicationFormValues = Record<ApplicationField, string>;

export function emptyApplicationForm(): ApplicationFormValues {
  return { legalName: '', voen: '', contactName: '', phone: '', regionId: '', categoryNote: '' };
}

const required = (max: number) => z.string().trim().min(1, 'required').max(max, 'too_long');

/** openapi sınırları; mesaj = `sellerApplication.error.<neden>` anahtarının sonu. */
export const applicationFormSchema = z.object({
  legalName: required(200),
  voen: z.string().trim().regex(VOEN_PATTERN, 'VOEN_INVALID'),
  contactName: required(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9][0-9]{7,14}$/, 'invalid_phone'),
  regionId: z.string().min(1, 'required'),
  categoryNote: z.string().trim().max(500, 'too_long'),
});

/** Çeviri anahtarı olan nedenler; diğerleri `invalid`. */
const KNOWN_REASONS: ReadonlySet<string> = new Set([
  'required',
  'too_long',
  'VOEN_INVALID',
  'invalid_phone',
  'not_found',
  'SELLER_APPLICATION_ALREADY_PENDING',
]);
const FIELD_SET: ReadonlySet<string> = new Set(APPLICATION_FIELDS);

export type ApplicationFieldErrors = Partial<Record<ApplicationField, string>>;

function reasonKey(reason: unknown): string {
  return typeof reason === 'string' && KNOWN_REASONS.has(reason) ? reason : 'invalid';
}

export type ApplicationValidation =
  | { readonly ok: true; readonly body: SellerApplicationBody }
  | { readonly ok: false; readonly fields: ApplicationFieldErrors };

/** Formu doğrular; geçerliyse API gövdesi (boş not gönderilmez). */
export function validateApplicationForm(values: ApplicationFormValues): ApplicationValidation {
  const parsed = applicationFormSchema.safeParse(values);
  if (!parsed.success) {
    const fields: ApplicationFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]) as ApplicationField;
      fields[field] ??= reasonKey(issue.message);
    }
    return { ok: false, fields };
  }
  const { categoryNote, ...rest } = parsed.data;
  return { ok: true, body: categoryNote === '' ? rest : { ...rest, categoryNote } };
}

export interface ApplicationApiErrors {
  readonly fields: ApplicationFieldErrors;
  /** Alana bağlanamayan hata: `errors.<KOD>` kodu (ör. `RATE_LIMITED`). */
  readonly general?: string;
}

/**
 * API hatası → alan hataları: `409 SELLER_APPLICATION_ALREADY_PENDING` VÖEN alanında (US-008
 * AC3); `422 VALIDATION_FAILED` `details` alanlarından. Bilinmeyen alan/kod genel hata olur.
 */
export function applicationApiErrors(error: unknown): ApplicationApiErrors {
  const code = errorCodeOf(error);
  if (code === 'SELLER_APPLICATION_ALREADY_PENDING') return { fields: { voen: code } };
  if (code !== 'VALIDATION_FAILED') return { fields: {}, general: code };
  const details =
    typeof error === 'object' && error !== null && 'details' in error ? error.details : undefined;
  const fields: ApplicationFieldErrors = {};
  let unmatched = false;
  if (typeof details === 'object' && details !== null) {
    for (const [path, reasons] of Object.entries(details)) {
      const field = path.split('.')[0] ?? '';
      if (!FIELD_SET.has(field)) {
        unmatched = true;
        continue;
      }
      fields[field as ApplicationField] ??= reasonKey(
        Array.isArray(reasons) ? reasons[0] : reasons,
      );
    }
  }
  return unmatched || Object.keys(fields).length === 0 ? { fields, general: code } : { fields };
}
