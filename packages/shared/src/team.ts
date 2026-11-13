// Ekip yönetimi form mantığı (F2.7b, US-013): web ekip ekranı ve mobil davet kabulü ortak kullanır.
// Saf fonksiyonlar; birim testli. Kapsam kuralı API ile aynı (F2.7a K9): rolde `branch` kapsamlı
// izin varsa şube, `warehouse` varsa depo zorunlu; `assigned` rolde bölgeler atanır (K4: kabulden
// sonra). Gerekmeyen kapsam alanı gövdeye konmaz (API 422 `not_allowed` verir).

/** openapi `PhoneE164`. */
const PHONE_E164 = /^\+[1-9][0-9]{7,14}$/;
/** openapi davet gövdesi `fullName` sınırı. */
export const TEAM_FULL_NAME_MAX = 120;
/** openapi `POST /team/invitations/accept` `token` sınırı. */
const INVITATION_TOKEN_MAX = 256;

export interface ScopeNeeds {
  readonly branch: boolean;
  readonly warehouse: boolean;
  readonly regions: boolean;
}

const NO_SCOPE: ScopeNeeds = { branch: false, warehouse: false, regions: false };

/** Rolün izin kapsamlarından gereken alanlar; rol yoksa hiçbiri. */
export function roleScopeNeeds(
  role: { readonly permissions: readonly { readonly scope: string }[] } | undefined,
): ScopeNeeds {
  if (role === undefined) return NO_SCOPE;
  const scopes = new Set(role.permissions.map((item) => item.scope));
  return {
    branch: scopes.has('branch'),
    warehouse: scopes.has('warehouse'),
    regions: scopes.has('assigned'),
  };
}

/**
 * Unvan seçilince önerilen rol: unvanın şablonundan kopyalanan işletme rolü (`sourceTemplateId`).
 * Aynı şablondan açılmış özel roller (F2.8, `isCustom`) önerilmez.
 */
export function suggestedRoleId(
  jobTitle: { readonly roleTemplateId: string | null } | undefined,
  roles: readonly {
    readonly id: string;
    readonly sourceTemplateId: string | null;
    readonly isCustom?: boolean;
  }[],
): string | undefined {
  const template = jobTitle?.roleTemplateId ?? null;
  if (template === null) return undefined;
  return roles.find((role) => role.sourceTemplateId === template && role.isCustom !== true)?.id;
}

/** Telefonu E.164'e yaklaştırır: boşluk, tire, parantez atılır; `00` başı `+` olur. */
export function normalizeTeamPhone(input: string): string {
  const compact = input.replace(/[\s()-]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

export type TeamFieldError =
  | 'required'
  | 'phone_invalid'
  | 'too_long'
  | 'not_found'
  | 'inactive'
  | 'not_allowed'
  | 'beyond_actor'
  | 'invalid';

export interface InvitationFormValues {
  readonly phone: string;
  readonly fullName: string;
  readonly jobTitleId: string;
  readonly roleId: string;
  readonly branchId: string;
  readonly warehouseId: string;
}

export type InvitationField = keyof InvitationFormValues;
export type InvitationErrors = Partial<Record<InvitationField, TeamFieldError>>;

export const EMPTY_INVITATION: InvitationFormValues = {
  phone: '',
  fullName: '',
  jobTitleId: '',
  roleId: '',
  branchId: '',
  warehouseId: '',
};

export interface InvitationBody {
  phone: string;
  fullName: string;
  jobTitleId: string;
  roleId: string;
  branchId?: string;
  warehouseId?: string;
}

export function validateInvitation(
  values: InvitationFormValues,
  needs: ScopeNeeds,
): { ok: true; body: InvitationBody } | { ok: false; errors: InvitationErrors } {
  const errors: InvitationErrors = {};
  const phone = normalizeTeamPhone(values.phone);
  const fullName = values.fullName.trim();
  if (phone === '') errors.phone = 'required';
  else if (!PHONE_E164.test(phone)) errors.phone = 'phone_invalid';
  if (fullName === '') errors.fullName = 'required';
  else if (fullName.length > TEAM_FULL_NAME_MAX) errors.fullName = 'too_long';
  if (values.jobTitleId === '') errors.jobTitleId = 'required';
  if (values.roleId === '') errors.roleId = 'required';
  if (needs.branch && values.branchId === '') errors.branchId = 'required';
  if (needs.warehouse && values.warehouseId === '') errors.warehouseId = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      phone,
      fullName,
      jobTitleId: values.jobTitleId,
      roleId: values.roleId,
      ...(needs.branch ? { branchId: values.branchId } : {}),
      ...(needs.warehouse ? { warehouseId: values.warehouseId } : {}),
    },
  };
}

export interface MemberFormValues {
  readonly roleId: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly regionIds: readonly string[];
}

export type MemberField = keyof MemberFormValues;
export type MemberErrors = Partial<Record<MemberField, TeamFieldError>>;

interface MemberLike {
  readonly roleId: string;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  readonly regionIds: readonly string[];
}

export function memberFormValues(member: MemberLike): MemberFormValues {
  return {
    roleId: member.roleId,
    branchId: member.branchId ?? '',
    warehouseId: member.warehouseId ?? '',
    regionIds: [...member.regionIds],
  };
}

export interface MemberUpdateBody {
  roleId?: string;
  branchId?: string;
  warehouseId?: string;
  regionIds?: string[];
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));

/**
 * Düzenleme formu → `PATCH /team/members/{id}` gövdesi: yalnız değişen alanlar. Gereken kapsam boşsa
 * hata; gerekmeyen kapsam gönderilmez (sunucu yeni rolde onu `null` yapar).
 */
export function memberUpdateBody(
  member: MemberLike,
  values: MemberFormValues,
  needs: ScopeNeeds,
): { ok: true; body: MemberUpdateBody } | { ok: false; errors: MemberErrors } {
  const errors: MemberErrors = {};
  if (values.roleId === '') errors.roleId = 'required';
  if (needs.branch && values.branchId === '') errors.branchId = 'required';
  if (needs.warehouse && values.warehouseId === '') errors.warehouseId = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const body: MemberUpdateBody = {};
  if (values.roleId !== member.roleId) body.roleId = values.roleId;
  if (needs.branch && values.branchId !== (member.branchId ?? '')) body.branchId = values.branchId;
  if (needs.warehouse && values.warehouseId !== (member.warehouseId ?? '')) {
    body.warehouseId = values.warehouseId;
  }
  if (needs.regions && !sameSet(values.regionIds, member.regionIds)) {
    body.regionIds = [...values.regionIds];
  }
  return { ok: true, body };
}

const FIELD_REASONS: Readonly<Record<string, TeamFieldError>> = {
  required: 'required',
  not_found: 'not_found',
  inactive: 'inactive',
  not_allowed: 'not_allowed',
  // F2.5 S1: admin olmayan yönetici yalnız kendi şubesine bağlar (403 `PERMISSION_DENIED`).
  beyond_actor: 'beyond_actor',
};

/**
 * F2.5 S1: ekip formunda seçilebilecek şubeler. İşletme admini tüm aktif şubeleri seçer; admin
 * olmayan yönetici yalnız kendi şubesini (şubesi yoksa boş liste). Liste okunamadıysa `undefined`.
 */
export function assignableBranches<T extends { readonly id: string }>(
  active: readonly T[] | undefined,
  actor: { readonly isBusinessAdmin: boolean; readonly branchId: string | null },
): readonly T[] | undefined {
  if (active === undefined || actor.isBusinessAdmin) return active;
  return active.filter((item) => item.id === actor.branchId);
}

export type TeamFailure =
  | { readonly kind: 'plan_limit' }
  | { readonly kind: 'fields'; readonly fields: Partial<Record<string, TeamFieldError>> }
  | { readonly kind: 'code'; readonly code: string };

/**
 * Ekip API hatası → ekran. US-013 AC2: `ENTITLEMENT_LIMIT_REACHED` → plan mesajı; alan ayrıntısı
 * (`{ alan: ['neden'] }`) olan 404/422 → alan hataları; diğerleri `errors.<KOD>` (ör.
 * `MEMBER_ALREADY_EXISTS`, `LAST_ADMIN_PROTECTED`).
 */
export function teamFailure(
  error: { readonly code?: string; readonly details?: unknown } | undefined,
  knownFields: readonly string[],
): TeamFailure {
  const code = error?.code ?? 'INTERNAL_ERROR';
  if (code === 'ENTITLEMENT_LIMIT_REACHED') return { kind: 'plan_limit' };
  const details = error?.details;
  if (typeof details === 'object' && details !== null) {
    const fields: Partial<Record<string, TeamFieldError>> = {};
    for (const [field, reasons] of Object.entries(details)) {
      if (!knownFields.includes(field)) continue;
      const first: unknown = Array.isArray(reasons) ? reasons[0] : undefined;
      fields[field] = typeof first === 'string' ? (FIELD_REASONS[first] ?? 'invalid') : 'invalid';
    }
    if (Object.keys(fields).length > 0) return { kind: 'fields', fields };
  }
  return { kind: 'code', code };
}

/** Davet bağlantısındaki token (web `?token=`, mobil deep link): yoksa, boşsa, uzunsa `undefined`. */
export function invitationToken(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '' || value.length > INVITATION_TOKEN_MAX) {
    return undefined;
  }
  return value;
}

/**
 * Açılışta seçilecek işletme (S8, F2.7): `/me.lastBusinessId` üyelikler arasındaysa o; değilse
 * ilk aktif üyelik, o da yoksa ilk üyelik (US-003 AC1). `skip`: bu oturumda reddedilen işletmeler.
 */
export function initialBusinessId(
  memberships: readonly { readonly businessId?: string; readonly businessStatus?: string }[],
  lastBusinessId: string | null | undefined,
  skip: ReadonlySet<string> = new Set(),
): string | undefined {
  const candidates = memberships.filter(
    (item) => item.businessId !== undefined && !skip.has(item.businessId),
  );
  const last = candidates.find((item) => item.businessId === lastBusinessId);
  if (last !== undefined) return last.businessId;
  const active = candidates.find((item) => item.businessStatus === 'active');
  return (active ?? candidates[0])?.businessId;
}
