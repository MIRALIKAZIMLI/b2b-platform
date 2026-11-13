// Şube formu (F2.5b, US-010). Asıl doğrulama API'dedir (`/api/v1/branches*`); burası alanın yanında
// erken geri bildirim, değişen alanlardan PATCH gövdesi ve API hatası → mesaj eşlemesidir. Web ve
// mobil ortak; saf fonksiyonlar, birim testli.
import { MIN_ORDER_AMOUNT_PATTERN, normalizeAmount } from './seller-setup';

export const BRANCH_NAME_MAX = 120;
export const BRANCH_ADDRESS_MAX = 300;
export const BRANCH_APPROVAL_RULES = ['every_order', 'above_amount', 'none'] as const;
export type BranchApprovalRule = (typeof BRANCH_APPROVAL_RULES)[number];

/** openapi `Branch` (ekranın kullandığı alanlar). */
export interface BranchSource {
  readonly name: string;
  readonly regionId: string | null;
  readonly addressLine: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly approvalRule: string;
  readonly approvalThreshold: string | null;
}

export interface BranchFormValues {
  readonly name: string;
  readonly regionId: string;
  readonly addressLine: string;
  readonly approvalRule: BranchApprovalRule;
  readonly approvalThreshold: string;
  readonly lat: string;
  readonly lng: string;
}

/** Hata nedeni = `branches.error.<neden>` çeviri anahtarının sonu. */
export type BranchFieldReason =
  'required' | 'too_long' | 'invalid_amount' | 'positive' | 'invalid_coordinate' | 'geo_pair';

export type BranchErrors = Partial<Record<keyof BranchFormValues, BranchFieldReason>>;

/** openapi `BranchInput` / `BranchPatch`. */
export interface BranchBody {
  name?: string;
  regionId?: string;
  addressLine?: string;
  approvalRule?: BranchApprovalRule;
  approvalThreshold?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export const EMPTY_BRANCH_FORM: BranchFormValues = {
  name: '',
  regionId: '',
  addressLine: '',
  approvalRule: 'every_order',
  approvalThreshold: '',
  lat: '',
  lng: '',
};

const isRule = (value: string): value is BranchApprovalRule =>
  (BRANCH_APPROVAL_RULES as readonly string[]).includes(value);

export function branchFormValues(source: BranchSource): BranchFormValues {
  return {
    name: source.name,
    regionId: source.regionId ?? '',
    addressLine: source.addressLine ?? '',
    approvalRule: isRule(source.approvalRule) ? source.approvalRule : 'every_order',
    approvalThreshold: source.approvalThreshold ?? '',
    lat: source.lat === null ? '' : String(source.lat),
    lng: source.lng === null ? '' : String(source.lng),
  };
}

/** Konum alanı metni → sayı (virgül de kabul); boşsa null, geçersizse NaN. */
function coordinate(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  return /^-?\d{1,3}(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Konum ondalığı (numeric(9,6)); cihazdan gelen konum altı haneye yuvarlanır. */
export function formatCoordinate(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '');
}

export type BranchValidation =
  | { readonly ok: true; readonly body: BranchBody }
  | { readonly ok: false; readonly errors: BranchErrors };

/**
 * Formu doğrular. `initial` verilmezse yeni şube (tam gövde); verilirse yalnız değişen alanlar
 * (PATCH). Kural `above_amount` değilse eşik gönderilmez; sunucu eşiği siler (T4).
 */
export function validateBranch(
  values: BranchFormValues,
  initial?: BranchFormValues,
): BranchValidation {
  const errors: BranchErrors = {};
  const name = values.name.trim();
  const addressLine = values.addressLine.trim();
  if (name === '') errors.name = 'required';
  else if (name.length > BRANCH_NAME_MAX) errors.name = 'too_long';
  if (values.regionId === '') errors.regionId = 'required';
  if (addressLine === '') errors.addressLine = 'required';
  else if (addressLine.length > BRANCH_ADDRESS_MAX) errors.addressLine = 'too_long';

  const threshold = normalizeAmount(values.approvalThreshold);
  if (values.approvalRule === 'above_amount') {
    if (threshold === '') errors.approvalThreshold = 'required';
    else if (!MIN_ORDER_AMOUNT_PATTERN.test(threshold)) errors.approvalThreshold = 'invalid_amount';
    else if (!/[1-9]/.test(threshold)) errors.approvalThreshold = 'positive';
  }

  const lat = coordinate(values.lat);
  const lng = coordinate(values.lng);
  if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90))
    errors.lat = 'invalid_coordinate';
  if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
    errors.lng = 'invalid_coordinate';
  }
  if (errors.lat === undefined && errors.lng === undefined && (lat === null) !== (lng === null)) {
    errors[lat === null ? 'lat' : 'lng'] = 'geo_pair';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const full: Required<BranchBody> = {
    name,
    regionId: values.regionId,
    addressLine,
    approvalRule: values.approvalRule,
    approvalThreshold: values.approvalRule === 'above_amount' ? threshold : null,
    lat,
    lng,
  };
  if (initial === undefined) {
    const body: BranchBody = {
      name: full.name,
      regionId: full.regionId,
      addressLine: full.addressLine,
      approvalRule: full.approvalRule,
    };
    if (full.approvalThreshold !== null) body.approvalThreshold = full.approvalThreshold;
    if (full.lat !== null && full.lng !== null) {
      body.lat = full.lat;
      body.lng = full.lng;
    }
    return { ok: true, body };
  }

  const body: BranchBody = {};
  if (name !== initial.name.trim()) body.name = name;
  if (values.regionId !== initial.regionId) body.regionId = values.regionId;
  if (addressLine !== initial.addressLine.trim()) body.addressLine = addressLine;
  const initialThreshold = normalizeAmount(initial.approvalThreshold);
  if (values.approvalRule !== initial.approvalRule) {
    body.approvalRule = values.approvalRule;
    if (values.approvalRule === 'above_amount') body.approvalThreshold = threshold;
  } else if (values.approvalRule === 'above_amount' && !sameAmount(threshold, initialThreshold)) {
    body.approvalThreshold = threshold;
  }
  if (lat !== coordinate(initial.lat) || lng !== coordinate(initial.lng)) {
    body.lat = lat;
    body.lng = lng;
  }
  return { ok: true, body };
}

/** "500" ile "500.00" aynı tutar (gereksiz audit kaydı olmasın; Müfettiş 21 notu). */
function sameAmount(a: string, b: string): boolean {
  if (a === '' || b === '') return a === b;
  const [ai = '', af = ''] = a.split('.');
  const [bi = '', bf = ''] = b.split('.');
  return (
    ai.replace(/^0+(?=\d)/, '') === bi.replace(/^0+(?=\d)/, '') &&
    af.replace(/0+$/, '') === bf.replace(/0+$/, '')
  );
}

export type BranchFailure =
  | { readonly kind: 'last_active' }
  | { readonly kind: 'in_use'; readonly members: number; readonly invitations: number }
  | { readonly kind: 'code'; readonly code: string };

/**
 * Şube API hatası → ekranda gösterilecek tek mesaj. `409 INVALID_STATE_TRANSITION`:
 * `last_active_branch` (son aktif şube) veya `branch_in_use` (aktif üye / açık davet, S3).
 */
export function branchFailure(
  error: { readonly code?: string; readonly details?: unknown } | undefined,
): BranchFailure {
  const code = error?.code ?? 'INTERNAL_ERROR';
  if (code === 'INVALID_STATE_TRANSITION') {
    const details = (error?.details ?? {}) as Record<string, unknown>;
    if (details.reason === 'last_active_branch') return { kind: 'last_active' };
    if (details.reason === 'branch_in_use') {
      const count = (value: unknown) => (typeof value === 'number' ? value : 0);
      return {
        kind: 'in_use',
        members: count(details.members),
        invitations: count(details.invitations),
      };
    }
  }
  return { kind: 'code', code };
}
