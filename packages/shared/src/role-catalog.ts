// Platform unvan ve rol şablonu kataloğu (F2.9, US-012): API ve web admin ekranının paylaştığı
// kurallar. Uçlar ve menü öğeleri `CATALOG_ADMIN_ROLES` ile korunur (kart F2.9 V1: productreport
// "Çeviri ve içerik: ortak katalog").
import { z } from 'zod';
import { isScopeAllowed, type PermissionCode, type PermissionScope } from './permissions';
import type { PlatformRole } from './platform-roles';
import { permissionsForCapability } from './team-roles';

export const CATALOG_ADMIN_ROLES: readonly PlatformRole[] = ['super_admin', 'content'];

/** openapi `CatalogCode`: benzersiz, sonradan değişmez (V5). */
export const CATALOG_CODE_PATTERN = /^[a-z][a-z0-9_]{2,62}$/;
export const catalogCodeSchema = z.string().regex(CATALOG_CODE_PATTERN);

/** openapi `CatalogName` dil başına üst sınır. */
export const CATALOG_NAME_MAX = 80;
const nameText = z.string().trim().min(1).max(CATALOG_NAME_MAX);

/** openapi `CatalogName`: az, ru, tr zorunlu; en isteğe bağlı (ADR-0007 pilot dilleri). */
export const catalogNameSchema = z.strictObject({
  az: nameText,
  ru: nameText,
  tr: nameText,
  en: nameText.optional(),
});
export type CatalogName = z.infer<typeof catalogNameSchema>;

// --- Web admin katalog formları (F2.9b) ---

export const CATALOG_LANGS = ['az', 'ru', 'tr', 'en'] as const;
export type CatalogLang = (typeof CATALOG_LANGS)[number];
/** Zorunlu diller (en isteğe bağlı). */
const REQUIRED_LANGS: readonly CatalogLang[] = ['az', 'ru', 'tr'];

export type CatalogNameValues = Readonly<Record<CatalogLang, string>>;
export type CatalogFieldError = 'required' | 'too_long' | 'invalid';
export type CatalogFormErrors = Partial<
  Record<'code' | 'roleTemplateId' | 'permissions' | `name.${CatalogLang}`, CatalogFieldError>
>;

/** Kayıttaki ad → form değerleri (eksik dil boş). */
export function catalogNameValues(name: unknown): CatalogNameValues {
  const source = typeof name === 'object' && name !== null ? (name as Record<string, unknown>) : {};
  const pick = (lang: CatalogLang) => (typeof source[lang] === 'string' ? source[lang] : '');
  return { az: pick('az'), ru: pick('ru'), tr: pick('tr'), en: pick('en') };
}

/** Gövdedeki ad (openapi `CatalogName`; `en` yoksa alan hiç yazılmaz). */
export interface CatalogNameBody {
  az: string;
  ru: string;
  tr: string;
  en?: string;
}

function nameBody(values: CatalogNameValues, errors: CatalogFormErrors): CatalogNameBody {
  const text = (lang: CatalogLang): string => {
    const value = values[lang].trim();
    if (value === '' && REQUIRED_LANGS.includes(lang)) errors[`name.${lang}`] = 'required';
    if (value.length > CATALOG_NAME_MAX) errors[`name.${lang}`] = 'too_long';
    return value;
  };
  const name: CatalogNameBody = { az: text('az'), ru: text('ru'), tr: text('tr') };
  const en = text('en');
  if (en !== '') name.en = en;
  return name;
}

function codeError(code: string): CatalogFieldError | undefined {
  if (code.trim() === '') return 'required';
  return CATALOG_CODE_PATTERN.test(code.trim()) ? undefined : 'invalid';
}

export interface TemplateFormValues {
  readonly code: string;
  readonly capability: 'seller' | 'buyer';
  readonly name: CatalogNameValues;
  readonly permissions: Readonly<Partial<Record<PermissionCode, PermissionScope>>>;
}

export interface TemplateFormBody {
  code: string;
  capability: 'seller' | 'buyer';
  name: CatalogNameBody;
  permissions: { code: PermissionCode; scope: PermissionScope }[];
}

/**
 * Şablon formu → gövde. Yeni şablonda kod denetlenir; düzenlemede `code` ve `capability`
 * gönderilmez (değişmez, V5). Yeteneğe ait olmayan veya kapsamı izinsiz izin gövdeye girmez.
 */
export function templateFormBody(
  values: TemplateFormValues,
  mode: 'create' | 'edit',
):
  | { ok: true; body: TemplateFormBody | Omit<TemplateFormBody, 'code' | 'capability'> }
  | { ok: false; errors: CatalogFormErrors } {
  const errors: CatalogFormErrors = {};
  const code = mode === 'create' ? codeError(values.code) : undefined;
  if (code !== undefined) errors.code = code;
  const name = nameBody(values.name, errors);
  const permissions = permissionsForCapability(values.capability).flatMap((item) => {
    const scope = values.permissions[item];
    return scope === undefined || !isScopeAllowed(item, scope) ? [] : [{ code: item, scope }];
  });
  if (permissions.length === 0) errors.permissions = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body:
      mode === 'create'
        ? { code: values.code.trim(), capability: values.capability, name, permissions }
        : { name, permissions },
  };
}

export interface JobTitleFormValues {
  readonly code: string;
  readonly capability: 'seller' | 'buyer';
  readonly name: CatalogNameValues;
  readonly roleTemplateId: string;
}

export interface JobTitleFormBody {
  code: string;
  capability: 'seller' | 'buyer';
  name: CatalogNameBody;
  roleTemplateId: string;
}

/** Unvan formu → gövde; düzenlemede yalnız ad ve şablon. */
export function jobTitleFormBody(
  values: JobTitleFormValues,
  mode: 'create' | 'edit',
):
  | { ok: true; body: JobTitleFormBody | Omit<JobTitleFormBody, 'code' | 'capability'> }
  | { ok: false; errors: CatalogFormErrors } {
  const errors: CatalogFormErrors = {};
  const code = mode === 'create' ? codeError(values.code) : undefined;
  if (code !== undefined) errors.code = code;
  const name = nameBody(values.name, errors);
  if (values.roleTemplateId === '') errors.roleTemplateId = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body:
      mode === 'create'
        ? {
            code: values.code.trim(),
            capability: values.capability,
            name,
            roleTemplateId: values.roleTemplateId,
          }
        : { name, roleTemplateId: values.roleTemplateId },
  };
}

export type CatalogFailure =
  | {
      readonly kind: 'catalog';
      readonly reason: 'code_taken' | 'admin_template_locked' | 'capability' | 'in_use' | 'invalid';
    }
  | { readonly kind: 'code'; readonly code: string };

/** Katalog API hatası → ekran mesajı (kod alınmış, admin şablonu kilitli, yetenek, kullanımda). */
export function catalogFailure(
  error: { readonly code?: string; readonly details?: unknown } | undefined,
): CatalogFailure {
  const code = error?.code ?? 'INTERNAL_ERROR';
  if (code === 'JOB_TITLE_IN_USE') return { kind: 'catalog', reason: 'in_use' };
  if (code !== 'VALIDATION_FAILED') return { kind: 'code', code };
  const details =
    typeof error?.details === 'object' && error.details !== null
      ? (error.details as Record<string, unknown>)
      : {};
  const reasons = (field: string): unknown[] => {
    const value = details[field];
    return Array.isArray(value) ? value : [];
  };
  if (reasons('code').includes('taken')) return { kind: 'catalog', reason: 'code_taken' };
  if (reasons('permissions').includes('admin_template_locked')) {
    return { kind: 'catalog', reason: 'admin_template_locked' };
  }
  if (reasons('roleTemplateId').length > 0 || reasons('permissions').includes('capability')) {
    return { kind: 'catalog', reason: 'capability' };
  }
  return { kind: 'catalog', reason: 'invalid' };
}
