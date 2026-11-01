// Toptancı kurulumu formları (F2.6, US-011): satıcı profili ve depo. Asıl doğrulama API'dedir
// (`/api/v1/business/seller-profile`, `/api/v1/warehouses`); burası alanın yanında erken geri
// bildirim ve API hatası → alan hatası eşlemesi içindir. Saf fonksiyonlar; birim testli.

/** Tanıtım metninin düzenlendiği diller (arayüz dilleri; `en` F2'de yok). */
export const SELLER_DESCRIPTION_LANGUAGES = ['az', 'ru', 'tr'] as const;
export type SellerDescriptionLanguage = (typeof SELLER_DESCRIPTION_LANGUAGES)[number];

export const SELLER_DESCRIPTION_MAX = 2000;
export const WAREHOUSE_NAME_MAX = 120;
export const WAREHOUSE_ADDRESS_MAX = 300;

/** `numeric(14,2)`: en çok 12 tam, 2 ondalık hane; negatif yok. API ile aynı desen. */
export const MIN_ORDER_AMOUNT_PATTERN = /^[0-9]{1,12}(\.[0-9]{1,2})?$/;

export interface SellerProfileSource {
  readonly description: Readonly<Record<string, string>> | null;
  readonly minOrderAmount: string | null;
  readonly requireDeliveryPhoto: boolean;
}

export interface SellerProfileFormValues {
  readonly description: Readonly<Record<SellerDescriptionLanguage, string>>;
  readonly minOrderAmount: string;
  readonly requireDeliveryPhoto: boolean;
}

/** openapi `SellerProfileUpdate`; yalnız değişen alanlar. */
export interface SellerProfileBody {
  description?: Record<string, string> | null;
  minOrderAmount?: string | null;
  requireDeliveryPhoto?: boolean;
}

/** Hata nedeni = `sellerSettings.error.<neden>` çeviri anahtarının sonu. */
export type SellerSetupReason = 'required' | 'too_long' | 'invalid_amount' | 'not_found';

export type SellerProfileErrors = Partial<
  Record<'minOrderAmount' | `description.${SellerDescriptionLanguage}`, SellerSetupReason>
>;

export function sellerProfileFormValues(
  source: SellerProfileSource | undefined,
): SellerProfileFormValues {
  const text = (language: SellerDescriptionLanguage) => source?.description?.[language] ?? '';
  return {
    description: { az: text('az'), ru: text('ru'), tr: text('tr') },
    minOrderAmount: source?.minOrderAmount ?? '',
    requireDeliveryPhoto: source?.requireDeliveryPhoto ?? false,
  };
}

/** "150,5" gibi virgüllü girişi noktaya çevirir; boşlukları atar. */
export function normalizeAmount(input: string): string {
  return input.replace(/\s/g, '').replace(',', '.');
}

function descriptionBody(values: SellerProfileFormValues): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const language of SELLER_DESCRIPTION_LANGUAGES) {
    const text = values.description[language].trim();
    if (text !== '') out[language] = text;
  }
  return Object.keys(out).length === 0 ? null : out;
}

function sameDescription(a: Record<string, string> | null, b: Record<string, string> | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type SellerProfileValidation =
  | { readonly ok: true; readonly body: SellerProfileBody }
  | { readonly ok: false; readonly errors: SellerProfileErrors };

/** Formu doğrular; geçerliyse yalnız `initial`'dan farklı alanları gövdeye koyar. */
export function validateSellerProfile(
  values: SellerProfileFormValues,
  initial: SellerProfileFormValues,
): SellerProfileValidation {
  const errors: SellerProfileErrors = {};
  for (const language of SELLER_DESCRIPTION_LANGUAGES) {
    if (values.description[language].trim().length > SELLER_DESCRIPTION_MAX) {
      errors[`description.${language}`] = 'too_long';
    }
  }
  const amount = normalizeAmount(values.minOrderAmount);
  if (amount !== '' && !MIN_ORDER_AMOUNT_PATTERN.test(amount)) {
    errors.minOrderAmount = 'invalid_amount';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const body: SellerProfileBody = {};
  const description = descriptionBody(values);
  if (!sameDescription(description, descriptionBody(initial))) body.description = description;
  const initialAmount = normalizeAmount(initial.minOrderAmount);
  if (amount !== initialAmount) body.minOrderAmount = amount === '' ? null : amount;
  if (values.requireDeliveryPhoto !== initial.requireDeliveryPhoto) {
    body.requireDeliveryPhoto = values.requireDeliveryPhoto;
  }
  return { ok: true, body };
}

export interface WarehouseFormValues {
  readonly name: string;
  readonly addressLine: string;
}

export type WarehouseErrors = Partial<Record<keyof WarehouseFormValues, SellerSetupReason>>;

export type WarehouseValidation =
  | { readonly ok: true; readonly body: { name: string; addressLine?: string } }
  | { readonly ok: false; readonly errors: WarehouseErrors };

/** Yeni depo formu (US-011 AC1): ad zorunlu, adres isteğe bağlı. */
export function validateWarehouse(values: WarehouseFormValues): WarehouseValidation {
  const name = values.name.trim();
  const addressLine = values.addressLine.trim();
  const errors: WarehouseErrors = {};
  if (name === '') errors.name = 'required';
  else if (name.length > WAREHOUSE_NAME_MAX) errors.name = 'too_long';
  if (addressLine.length > WAREHOUSE_ADDRESS_MAX) errors.addressLine = 'too_long';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: addressLine === '' ? { name } : { name, addressLine } };
}

/**
 * Depo / profil API hatası → ekranda gösterilecek tek mesaj kodu. US-011 AC2: hak sınırı
 * `plan_limit` (plan yükseltme mesajı); varsayılan depo kuralı `default_rule`; diğerleri
 * `errors.<KOD>` genel çevirisi.
 */
export function sellerSetupFailure(
  error: { readonly code?: string; readonly details?: unknown } | undefined,
): { readonly kind: 'plan_limit' | 'default_rule' } | { readonly kind: 'code'; code: string } {
  const code = error?.code ?? 'INTERNAL_ERROR';
  if (code === 'ENTITLEMENT_LIMIT_REACHED') return { kind: 'plan_limit' };
  if (code === 'INVALID_STATE_TRANSITION') return { kind: 'default_rule' };
  return { kind: 'code', code };
}

/** Bölge listesini arama metniyle süzer (büyük/küçük harf ve Azerbaycan harfleri duyarsız). */
export function filterRegionOptions<T extends { readonly label: string }>(
  options: readonly T[],
  query: string,
  locale: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase(locale);
  if (needle === '') return [...options];
  return options.filter((option) => option.label.toLocaleLowerCase(locale).includes(needle));
}
