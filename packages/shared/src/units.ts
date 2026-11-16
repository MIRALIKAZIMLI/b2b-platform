// Birim kataloğu (F3.1, US-028): API ve web admin ekranının paylaştığı kurallar.
// openapi `UnitCode`, `UnitKind`, `UnitAbbreviation`, `UnitFactor`.
import { z } from 'zod';
import {
  CATALOG_NAME_MAX,
  type CatalogLang,
  type CatalogNameBody,
  type CatalogNameValues,
} from './role-catalog';

export const UNIT_KINDS = ['count', 'weight', 'volume', 'length', 'area', 'package'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

/** UN/ECE Rec 20 kodu (kart F3.1 K1); sonradan değişmez. */
export const UNIT_CODE_PATTERN = /^[A-Z0-9]{2,3}$/;
export const unitCodeSchema = z.string().regex(UNIT_CODE_PATTERN);
export const unitKindSchema = z.enum(UNIT_KINDS);

/** openapi `UnitAbbreviation` dil başına üst sınır. */
export const UNIT_ABBREVIATION_MAX = 16;
const abbreviationText = z.string().trim().min(1).max(UNIT_ABBREVIATION_MAX);
export const unitAbbreviationSchema = z.strictObject({
  az: abbreviationText,
  ru: abbreviationText,
  tr: abbreviationText,
  en: abbreviationText.optional(),
});
export type UnitAbbreviation = z.infer<typeof unitAbbreviationSchema>;

/** openapi `UnitFactor`: `numeric(18,6)`; sıfırdan büyük olması ayrıca denetlenir. */
export const UNIT_FACTOR_PATTERN = /^[0-9]{1,12}(\.[0-9]{1,6})?$/;
export const unitFactorSchema = z
  .string()
  .regex(UNIT_FACTOR_PATTERN)
  .refine((value) => /[1-9]/.test(value), { message: 'positive' });

// --- Web admin birim formu (F3.1) ---

export type UnitFieldError = 'required' | 'too_long' | 'invalid';
export type UnitFormErrors = Partial<
  Record<
    'code' | 'factor' | 'toCode' | `name.${CatalogLang}` | `abbreviation.${CatalogLang}`,
    UnitFieldError
  >
>;

export interface UnitFormValues {
  readonly code: string;
  readonly kind: UnitKind;
  readonly name: CatalogNameValues;
  readonly abbreviation: CatalogNameValues;
  readonly allowsDecimal: boolean;
}

export interface UnitFormBody {
  code: string;
  kind: UnitKind;
  name: CatalogNameBody;
  abbreviation: CatalogNameBody;
  allowsDecimal: boolean;
}

const REQUIRED_LANGS: readonly CatalogLang[] = ['az', 'ru', 'tr'];

function localizedBody(
  values: CatalogNameValues,
  field: 'name' | 'abbreviation',
  max: number,
  errors: UnitFormErrors,
): CatalogNameBody {
  const text = (lang: CatalogLang): string => {
    const value = values[lang].trim();
    if (value === '' && REQUIRED_LANGS.includes(lang)) errors[`${field}.${lang}`] = 'required';
    if (value.length > max) errors[`${field}.${lang}`] = 'too_long';
    return value;
  };
  const body: CatalogNameBody = { az: text('az'), ru: text('ru'), tr: text('tr') };
  const en = text('en');
  if (en !== '') body.en = en;
  return body;
}

/** Birim formu → gövde. Düzenlemede `code` ve `kind` gönderilmez (değişmez, K1). */
export function unitFormBody(
  values: UnitFormValues,
  mode: 'create' | 'edit',
):
  | { ok: true; body: UnitFormBody | Omit<UnitFormBody, 'code' | 'kind'> }
  | { ok: false; errors: UnitFormErrors } {
  const errors: UnitFormErrors = {};
  const code = values.code.trim().toUpperCase();
  if (mode === 'create') {
    if (code === '') errors.code = 'required';
    else if (!UNIT_CODE_PATTERN.test(code)) errors.code = 'invalid';
  }
  const name = localizedBody(values.name, 'name', CATALOG_NAME_MAX, errors);
  const abbreviation = localizedBody(
    values.abbreviation,
    'abbreviation',
    UNIT_ABBREVIATION_MAX,
    errors,
  );
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const shared = { name, abbreviation, allowsDecimal: values.allowsDecimal };
  return {
    ok: true,
    body: mode === 'create' ? { code, kind: values.kind, ...shared } : shared,
  };
}

export interface UnitConversionFormValues {
  readonly fromCode: string;
  readonly toCode: string;
  readonly factor: string;
}

/** Dönüşüm formu → gövde (openapi `PUT /admin/catalog/unit-conversions`). */
export function unitConversionFormBody(
  values: UnitConversionFormValues,
):
  | { ok: true; body: { fromCode: string; toCode: string; factor: string } }
  | { ok: false; errors: UnitFormErrors } {
  const errors: UnitFormErrors = {};
  const factor = values.factor.trim().replace(',', '.');
  if (values.fromCode === '' || values.toCode === '') errors.toCode = 'required';
  else if (values.fromCode === values.toCode) errors.toCode = 'invalid';
  if (factor === '') errors.factor = 'required';
  else if (!unitFactorSchema.safeParse(factor).success) errors.factor = 'invalid';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { fromCode: values.fromCode, toCode: values.toCode, factor } };
}

export type UnitFailure =
  | {
      readonly kind: 'unit';
      readonly reason:
        'code_taken' | 'kind_mismatch' | 'same_unit' | 'reverse_exists' | 'not_found' | 'invalid';
    }
  | { readonly kind: 'code'; readonly code: string };

/** Birim API hatası → ekran mesajı. */
export function unitFailure(
  error: { readonly code?: string; readonly details?: unknown } | undefined,
): UnitFailure {
  const code = error?.code ?? 'INTERNAL_ERROR';
  if (code !== 'VALIDATION_FAILED') return { kind: 'code', code };
  const details =
    typeof error?.details === 'object' && error.details !== null
      ? (error.details as Record<string, unknown>)
      : {};
  const reasons = (field: string): unknown[] => {
    const value = details[field];
    return Array.isArray(value) ? value : [];
  };
  if (reasons('code').includes('taken')) return { kind: 'unit', reason: 'code_taken' };
  const to = [...reasons('toCode'), ...reasons('fromCode')];
  for (const reason of ['kind_mismatch', 'same_unit', 'reverse_exists', 'not_found'] as const) {
    if (to.includes(reason)) return { kind: 'unit', reason };
  }
  return { kind: 'unit', reason: 'invalid' };
}
