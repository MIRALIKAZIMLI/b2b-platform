// İşletmeye özel rol (F2.8, US-014): API ve web rol düzenleyicisinin paylaştığı saf kurallar.
// - Rolün yeteneğine ait olmayan izin sunulmaz ve kabul edilmez (US-014 AC2).
// - Yetki yükseltme koruması (Müfettiş 11 R3; kart F2.8 V5): işletme admini olmayan aktör yalnızca
//   kendisinde olan izni, kendi kapsamı `all` ise her kapsamda, değilse yalnız aynı kapsamda verebilir.
//   Aynı kural rol oluşturma / düzenleme ile rol atama ve davette uygulanır.
import { type LocalizedText } from './localized-text';
import {
  isPermissionCode,
  isPermissionForCapability,
  isPermissionScope,
  isScopeAllowed,
  PERMISSION_CODES,
  PERMISSIONS,
  type PermissionCode,
  permissionModule,
  type PermissionScope,
} from './permissions';

/** openapi `RoleName` dil başına sınır. */
export const ROLE_NAME_MAX = 80;
/** openapi rol gövdesi `permissions` üst sınırı. */
export const ROLE_PERMISSIONS_MAX = 100;

/** Yeteneğin rolüne verilebilecek izinler (katalog sırasıyla); `any` izinler dahil. */
export function permissionsForCapability(capability: 'seller' | 'buyer'): PermissionCode[] {
  return PERMISSION_CODES.filter((code) => isPermissionForCapability(code, capability));
}

/** İzinleri modüle göre gruplar (rol düzenleyici ekranı); modül sırası katalog sırasıdır. */
export function groupPermissionsByModule(
  codes: readonly PermissionCode[],
): { module: string; codes: PermissionCode[] }[] {
  const groups: { module: string; codes: PermissionCode[] }[] = [];
  for (const code of codes) {
    const module = permissionModule(code);
    const group = groups.find((item) => item.module === module);
    if (group === undefined) groups.push({ module, codes: [code] });
    else group.codes.push(code);
  }
  return groups;
}

export interface GrantActor {
  readonly isBusinessAdmin: boolean;
  readonly permissions: ReadonlyMap<string, string>;
}

/** Aktör bu izni bu kapsamla başkasına (role) verebilir mi? (R3) */
export function canGrantPermission(actor: GrantActor, code: string, scope: string): boolean {
  if (actor.isBusinessAdmin) return true;
  const own = actor.permissions.get(code);
  if (own === undefined) return false;
  return own === 'all' || own === scope;
}

/**
 * Aktörü aşan izinler (R3). Rol işletme adminiyse (admin bayrağı her izni açar) ve aktör admin
 * değilse rolün tamamı aşar: dönen listede `*` bulunur.
 */
export function permissionsBeyondActor(
  actor: GrantActor,
  role: {
    readonly isBusinessAdmin: boolean;
    readonly permissions: readonly { readonly code: string; readonly scope: string }[];
  },
): string[] {
  if (actor.isBusinessAdmin) return [];
  const beyond = role.permissions
    .filter((item) => !canGrantPermission(actor, item.code, item.scope))
    .map((item) => item.code);
  return role.isBusinessAdmin ? ['*', ...beyond] : beyond;
}

export type RolePermissionError = 'invalid' | 'capability' | 'scope' | 'duplicate';

/**
 * Rol izin listesi katalogla ve yetenekle tutarlı mı? İlk hatalı kalem ve nedeni; geçerliyse
 * undefined. AC2: başka yeteneğin izni `capability`.
 */
export function rolePermissionError(
  capability: 'seller' | 'buyer',
  items: readonly { readonly code: string; readonly scope: string }[],
): { code: string; reason: RolePermissionError } | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    if (!isPermissionCode(item.code) || !isPermissionScope(item.scope)) {
      return { code: item.code, reason: 'invalid' };
    }
    if (seen.has(item.code)) return { code: item.code, reason: 'duplicate' };
    seen.add(item.code);
    if (!isPermissionForCapability(item.code, capability)) {
      return { code: item.code, reason: 'capability' };
    }
    if (!isScopeAllowed(item.code, item.scope)) return { code: item.code, reason: 'scope' };
  }
  return undefined;
}

/** İznin ilk (varsayılan) kapsamı: anahtar açılınca seçilir. */
export function defaultPermissionScope(code: PermissionCode): PermissionScope {
  return PERMISSIONS[code].scopes[0];
}

// --- Web rol düzenleyici formu ---

export interface RoleEditorValues {
  readonly name: string;
  /** Açık izinler ve kapsamları. */
  readonly permissions: Readonly<Partial<Record<PermissionCode, PermissionScope>>>;
}

export type RoleEditorField = 'name' | 'permissions' | 'templateId';
export type RoleEditorErrors = Partial<
  Record<RoleEditorField, 'required' | 'too_long' | 'invalid'>
>;

/** openapi `RoleName`: yalnız az / ru / tr. */
export interface RoleNameText {
  az?: string;
  ru?: string;
  tr?: string;
}

export interface RoleEditorBody {
  name: RoleNameText;
  permissions: { code: PermissionCode; scope: PermissionScope }[];
}

/** Rolden / şablondan form değerleri: ad seçili dilde, izinler kayıttaki kapsamlarıyla. */
export function roleEditorValues(
  name: string,
  permissions: readonly { readonly code: string; readonly scope: string }[],
): RoleEditorValues {
  const map: Partial<Record<PermissionCode, PermissionScope>> = {};
  for (const item of permissions) {
    if (isPermissionCode(item.code) && isPermissionScope(item.scope)) map[item.code] = item.scope;
  }
  return { name, permissions: map };
}

/**
 * Form → gövde. Ad seçili dile yazılır, var olan diğer diller korunur (`base`). Rolün yeteneğine
 * ait olmayan izin gövdeye girmez (AC2; ekranda zaten sunulmaz).
 */
export function roleEditorBody(
  values: RoleEditorValues,
  capability: 'seller' | 'buyer',
  locale: string,
  base: LocalizedText = {},
): { ok: true; body: RoleEditorBody } | { ok: false; errors: RoleEditorErrors } {
  const errors: RoleEditorErrors = {};
  const name = values.name.trim();
  if (name === '') errors.name = 'required';
  else if (name.length > ROLE_NAME_MAX) errors.name = 'too_long';
  const permissions = permissionsForCapability(capability).flatMap((code) => {
    const scope = values.permissions[code];
    return scope === undefined || !isScopeAllowed(code, scope) ? [] : [{ code, scope }];
  });
  if (permissions.length === 0) errors.permissions = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const lang = locale === 'ru' || locale === 'tr' ? locale : 'az';
  const named: RoleNameText = {};
  for (const key of ['az', 'ru', 'tr'] as const) {
    const value = base[key];
    if (value !== undefined && value.trim() !== '') named[key] = value;
  }
  named[lang] = name;
  return { ok: true, body: { name: named, permissions } };
}

export type RoleFailure =
  | { readonly kind: 'role'; readonly reason: 'scope_change_in_use' | 'beyond_actor' | 'invalid' }
  | { readonly kind: 'code'; readonly code: string };

/**
 * Rol API hatası → ekran mesajı. Kullanımdaki rolde kapsam türü değişimi (V4), aktörü aşan izin
 * (R3) ve izin doğrulaması (AC2) rol mesajına; diğerleri `errors.<KOD>`.
 */
export function roleFailure(
  error: { readonly code?: string; readonly details?: unknown } | undefined,
): RoleFailure {
  const code = error?.code ?? 'INTERNAL_ERROR';
  const details: unknown = error?.details;
  const reasons =
    typeof details === 'object' && details !== null && 'permissions' in details
      ? details.permissions
      : undefined;
  const list: unknown[] = Array.isArray(reasons) ? reasons : [];
  if (code === 'VALIDATION_FAILED' && list.includes('scope_change_in_use')) {
    return { kind: 'role', reason: 'scope_change_in_use' };
  }
  if (code === 'PERMISSION_DENIED' && typeof details === 'object' && details !== null) {
    return { kind: 'role', reason: 'beyond_actor' };
  }
  if (code === 'VALIDATION_FAILED' && list.length > 0) return { kind: 'role', reason: 'invalid' };
  return { kind: 'code', code };
}
