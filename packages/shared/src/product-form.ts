// Web ürün formu (F3.3b, US-030): form durumu ↔ API gövdesi (openapi `ProductInput`,
// `ProductUpdate`), istemci denetimi, 422 `details` → alan hatası, durum düğmeleri (§14).
// Hata anahtarları API'nin alan yollarıyla aynıdır (`variants.0.packaging.1.baseQty`), böylece
// istemci ve sunucu hataları aynı alana düşer. Ambalajın ondalık kuralları (K4) sunucuda.
import { categoryTree } from './catalog-taxonomy';
import { LANGUAGE_CODES, type LanguageCode, pickLocalizedText } from './localized-text';
import {
  PACKAGING_LEVELS,
  type PackagingLevel,
  productCreateSchema,
  type ProductStatus,
  type VariantStatus,
} from './products';

export type LocalizedFields = Record<LanguageCode, string>;

export type AttributeKind = 'string' | 'number' | 'boolean';

export interface AttributeRow {
  readonly key: string;
  readonly value: string;
  /** Kayıttaki değerin türü; metin olarak düzenlenir, aynı türde geri gönderilir (AC8). */
  readonly kind: AttributeKind;
}

export interface Dimensions {
  readonly l: number;
  readonly w: number;
  readonly h: number;
}

export interface PackagingForm {
  readonly level: PackagingLevel;
  readonly unitCode: string;
  readonly baseQty: string;
  readonly gtin: string;
  readonly isSalesUnit: boolean;
  readonly minOrderQty: string;
  readonly orderMultiple: string;
  /** Formda gösterilmez; düzenlemede korunur (AC8). */
  readonly weightG: number | null;
  readonly dimensionsMm: Dimensions | null;
}

export interface VariantForm {
  /** İstemci anahtarı (React listesi); API'ye gitmez. */
  readonly key: string;
  /** Var olan varyant (PATCH, K3). */
  readonly id?: string;
  readonly sku: string;
  readonly gtin: string;
  readonly attributes: readonly AttributeRow[];
  readonly packaging: readonly PackagingForm[];
}

export type RegionMode = 'all' | 'selected';

export interface ProductForm {
  readonly sku: string;
  readonly name: LocalizedFields;
  readonly description: LocalizedFields;
  readonly categoryId: string;
  readonly brandId: string;
  readonly baseUnitCode: string;
  readonly hasExpiry: boolean;
  readonly shelfLifeMonths: string;
  readonly variants: readonly VariantForm[];
  /** Arşivli varyantlar: geri alınınca `variants`'a taşınır (kimliğiyle yeniden etkinleşir). */
  readonly archivedVariants: readonly VariantForm[];
  readonly regionMode: RegionMode;
  readonly regionIds: readonly string[];
}

/** API'nin ürün bakışından formun kullandığı kısım (openapi `Product`). */
export interface ProductViewLike {
  readonly sku: string;
  readonly name: Partial<Record<LanguageCode, string>>;
  readonly description: Partial<Record<LanguageCode, string>> | null;
  readonly categoryId: string;
  readonly brandId: string | null;
  readonly baseUnitCode: string;
  readonly hasExpiry: boolean;
  readonly shelfLifeMonths: number | null;
  readonly visibility: { readonly regionIds: readonly string[] };
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly gtin: string | null;
    readonly status: VariantStatus;
    readonly attributes: Record<string, unknown>;
    readonly packaging: readonly {
      readonly level: PackagingLevel;
      readonly unitCode: string;
      readonly baseQty: string;
      readonly gtin?: string | null | undefined;
      readonly isSalesUnit: boolean;
      /** Üretilen istemci tipinde isteğe bağlı görünür (openapi `allOf`); API her zaman döner. */
      readonly minOrderQty?: string | undefined;
      readonly orderMultiple?: string | undefined;
      readonly weightG?: number | null | undefined;
      readonly dimensionsMm?: Dimensions | null | undefined;
    }[];
  }[];
}

function emptyLocalized(): LocalizedFields {
  return { az: '', ru: '', tr: '', en: '' };
}

function localizedFrom(value: Partial<Record<LanguageCode, string>> | null): LocalizedFields {
  const out = emptyLocalized();
  for (const lang of LANGUAGE_CODES) out[lang] = value?.[lang] ?? '';
  return out;
}

export function unitPackaging(baseUnitCode: string): PackagingForm {
  return {
    level: 'unit',
    unitCode: baseUnitCode,
    baseQty: '1',
    gtin: '',
    isSalesUnit: true,
    minOrderQty: '1',
    orderMultiple: '1',
    weightG: null,
    dimensionsMm: null,
  };
}

/** Yeni varyant: yalnız `unit` seviyesi, satış birimi, en az 1, kat 1. */
export function emptyVariant(key: string, baseUnitCode: string): VariantForm {
  return { key, sku: '', gtin: '', attributes: [], packaging: [unitPackaging(baseUnitCode)] };
}

export function emptyProductForm(key: string, baseUnitCode = 'H87'): ProductForm {
  return {
    sku: '',
    name: emptyLocalized(),
    description: emptyLocalized(),
    categoryId: '',
    brandId: '',
    baseUnitCode,
    hasExpiry: false,
    shelfLifeMonths: '',
    variants: [emptyVariant(key, baseUnitCode)],
    archivedVariants: [],
    regionMode: 'all',
    regionIds: [],
  };
}

/** Varyantta henüz olmayan ambalaj seviyeleri (adet → palet sırasıyla). */
export function missingPackagingLevels(packaging: readonly PackagingForm[]): PackagingLevel[] {
  const used = new Set(packaging.map((item) => item.level));
  return PACKAGING_LEVELS.filter((level) => !used.has(level));
}

/** Seviyeleri adet → palet sırasına dizer. */
export function sortPackaging(packaging: readonly PackagingForm[]): PackagingForm[] {
  const order = (level: PackagingLevel) => PACKAGING_LEVELS.indexOf(level);
  return [...packaging].sort((a, b) => order(a.level) - order(b.level));
}

function attributeRows(attributes: Record<string, unknown>): AttributeRow[] {
  return Object.entries(attributes).map(([key, value]) => {
    if (typeof value === 'number') return { key, value: String(value), kind: 'number' };
    if (typeof value === 'boolean') return { key, value: String(value), kind: 'boolean' };
    return {
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      kind: 'string',
    };
  });
}

/** Detay → form (AC8: varyant kimliği, ağırlık ve ölçü korunur). */
export function productToForm(product: ProductViewLike): ProductForm {
  const toVariant = (variant: ProductViewLike['variants'][number]): VariantForm => ({
    key: variant.id,
    id: variant.id,
    sku: variant.sku,
    gtin: variant.gtin ?? '',
    attributes: attributeRows(variant.attributes),
    packaging: sortPackaging(
      variant.packaging.map((item) => ({
        level: item.level,
        unitCode: item.unitCode,
        baseQty: item.baseQty,
        gtin: item.gtin ?? '',
        isSalesUnit: item.isSalesUnit,
        minOrderQty: item.minOrderQty ?? '1',
        orderMultiple: item.orderMultiple ?? '1',
        weightG: item.weightG ?? null,
        dimensionsMm: item.dimensionsMm ?? null,
      })),
    ),
  });
  return {
    sku: product.sku,
    name: localizedFrom(product.name),
    description: localizedFrom(product.description),
    categoryId: product.categoryId,
    brandId: product.brandId ?? '',
    baseUnitCode: product.baseUnitCode,
    hasExpiry: product.hasExpiry,
    shelfLifeMonths: product.shelfLifeMonths === null ? '' : String(product.shelfLifeMonths),
    variants: product.variants.filter((v) => v.status === 'active').map(toVariant),
    archivedVariants: product.variants.filter((v) => v.status === 'archived').map(toVariant),
    regionMode: product.visibility.regionIds.length === 0 ? 'all' : 'selected',
    regionIds: [...product.visibility.regionIds],
  };
}

/**
 * Temel birim değişince her varyantın `unit` seviyesi yeni birime geçer (K4: `unit` = temel
 * birim); diğer seviyelerin birimi kullanıcıda kalır.
 */
export function withBaseUnit(form: ProductForm, baseUnitCode: string): ProductForm {
  const fix = (variant: VariantForm): VariantForm => ({
    ...variant,
    packaging: variant.packaging.map((item) =>
      item.level === 'unit' ? { ...item, unitCode: baseUnitCode } : item,
    ),
  });
  return { ...form, baseUnitCode, variants: form.variants.map(fix) };
}

function attributeValue(row: AttributeRow): string | number | boolean {
  const text = row.value.trim();
  if (row.kind === 'number' && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (row.kind === 'boolean' && (text === 'true' || text === 'false')) return text === 'true';
  return text;
}

function optionalText(value: string): string | null {
  const text = value.trim();
  return text === '' ? null : text;
}

function localizedBody(fields: LocalizedFields): Partial<Record<LanguageCode, string>> {
  const out: Partial<Record<LanguageCode, string>> = {};
  for (const lang of LANGUAGE_CODES) {
    const text = fields[lang].trim();
    if (text !== '') out[lang] = text;
  }
  return out;
}

/** Ham gövde (doğrulamadan önce). `id`'ler yalnız düzenlemede gider (POST'ta yasak). */
function rawBody(form: ProductForm, withIds: boolean) {
  const shelf = form.shelfLifeMonths.trim();
  const description = localizedBody(form.description);
  return {
    sku: form.sku,
    name: localizedBody(form.name),
    description: Object.keys(description).length === 0 ? null : description,
    categoryId: form.categoryId,
    brandId: form.brandId === '' ? null : form.brandId,
    baseUnitCode: form.baseUnitCode,
    hasExpiry: form.hasExpiry,
    shelfLifeMonths: form.hasExpiry ? (/^\d+$/.test(shelf) ? Number(shelf) : NaN) : null,
    variants: form.variants.map((variant) => ({
      ...(withIds && variant.id !== undefined ? { id: variant.id } : {}),
      sku: variant.sku,
      gtin: optionalText(variant.gtin),
      attributes: Object.fromEntries(
        variant.attributes
          .filter((row) => row.key.trim() !== '')
          .map((row) => [row.key.trim(), attributeValue(row)]),
      ),
      packaging: variant.packaging.map((item) => ({
        level: item.level,
        unitCode: item.unitCode,
        baseQty: item.baseQty,
        gtin: optionalText(item.gtin),
        weightG: item.weightG,
        dimensionsMm: item.dimensionsMm,
        isSalesUnit: item.isSalesUnit,
        minOrderQty: item.minOrderQty,
        orderMultiple: item.orderMultiple,
      })),
    })),
    visibility: { regionIds: form.regionMode === 'all' ? [] : [...form.regionIds] },
  };
}

/** Alan yolu → neden (`products.error.<neden>` çeviri anahtarı). */
export type ProductFieldErrors = Record<string, ProductErrorReason>;

export const PRODUCT_ERROR_REASONS = [
  'required',
  'invalid',
  'too_long',
  'taken',
  'duplicate',
  'invalid_gtin',
  'positive',
  'inactive',
  'not_found',
  'not_approved',
  'must_be_one',
  'must_match_base_unit',
  'integer_required',
  'not_multiple_of_order_multiple',
  'not_increasing',
  'sales_unit_required',
  'must_be_empty',
  'too_many',
  'regions_required',
] as const;
export type ProductErrorReason = (typeof PRODUCT_ERROR_REASONS)[number];

const REASON_SET: ReadonlySet<string> = new Set(PRODUCT_ERROR_REASONS);

function asReason(value: unknown): ProductErrorReason {
  return typeof value === 'string' && REASON_SET.has(value)
    ? (value as ProductErrorReason)
    : 'invalid';
}

/** Hata yolunu formun gösterdiği alana indirger (ör. `name.az` → `name`). */
function fieldKey(path: string): string {
  if (path.startsWith('name.')) return 'name';
  if (path.startsWith('description.')) return 'description';
  if (path === 'variants.sku') return 'variants';
  if (path.startsWith('visibility.regionIds')) return 'visibility.regionIds';
  // `variants.0.attributes.<anahtar>` → varyantın öznitelik alanı.
  const attr = /^(variants\.\d+\.attributes)(\..*)?$/.exec(path);
  if (attr?.[1] !== undefined) return attr[1];
  return path;
}

export type ProductFormResult<B> =
  | { readonly ok: true; readonly body: B }
  | { readonly ok: false; readonly errors: ProductFieldErrors };

export type ProductBody = ReturnType<typeof rawBody>;

/**
 * Form → istek gövdesi (AC2, AC4, AC8). `mode = 'create'` POST gövdesi (varyant `id`'si yok);
 * `'update'` PATCH gövdesi (tam liste: varyant `id`'leri; listede olmayan sunucuda arşivlenir).
 */
export function productFormBody(
  form: ProductForm,
  mode: 'create' | 'update',
): ProductFormResult<ProductBody> {
  const body = rawBody(form, mode === 'update');
  const errors: ProductFieldErrors = {};
  const add = (path: string, reason: ProductErrorReason) => {
    const key = fieldKey(path);
    errors[key] ??= reason;
  };
  const parsed = productCreateSchema.safeParse(
    mode === 'update'
      ? {
          ...body,
          variants: body.variants.map(({ sku, gtin, attributes, packaging }) => ({
            sku,
            gtin,
            attributes,
            packaging,
          })),
        }
      : body,
  );
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join('.');
      let reason: ProductErrorReason;
      if (REASON_SET.has(issue.message)) reason = issue.message as ProductErrorReason;
      else if (issue.code === 'too_big') reason = 'too_long';
      else if (issue.code === 'too_small' || issue.code === 'invalid_type') reason = 'required';
      else reason = 'invalid';
      if (path === 'shelfLifeMonths') {
        reason = form.shelfLifeMonths.trim() === '' ? 'required' : 'invalid';
      }
      if ((path === 'sku' || /^variants\.\d+\.sku$/.test(path)) && issue.code === 'too_small') {
        reason = 'required';
      }
      add(path === '' ? 'form' : path, reason);
    }
  }
  if (form.categoryId === '') errors.categoryId = 'required';
  form.variants.forEach((variant, i) => {
    if (!variant.packaging.some((item) => item.isSalesUnit)) {
      add(`variants.${String(i)}.packaging`, 'sales_unit_required');
    }
  });
  if (form.regionMode === 'selected' && form.regionIds.length === 0) {
    add('visibility.regionIds', 'regions_required');
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body };
}

/** API 422 `details` (`{ alan: [neden] }`) → form alanları (AC7). */
export function productFieldErrors(details: unknown): ProductFieldErrors {
  const out: ProductFieldErrors = {};
  if (typeof details !== 'object' || details === null) return out;
  for (const [path, reasons] of Object.entries(details as Record<string, unknown>)) {
    const list: unknown[] = Array.isArray(reasons) ? (reasons as unknown[]) : [];
    const known = list.find((reason) => typeof reason === 'string' && REASON_SET.has(reason));
    const key = fieldKey(path === '(root)' ? 'form' : path);
    out[key] ??= asReason(known);
  }
  return out;
}

/** Bir varyanta ait hata var mı (kart başlığında işaret için). */
export function variantHasError(errors: ProductFieldErrors, index: number): boolean {
  const prefix = `variants.${String(index)}`;
  return Object.keys(errors).some((key) => key === prefix || key.startsWith(`${prefix}.`));
}

// ---- Durum düğmeleri (state-machines §14) ----

export interface ProductActions {
  /** Alanlar düzenlenebilir mi (arşivli ürün düzenlenmez; izin yoksa salt okunur). */
  readonly editable: boolean;
  readonly canSave: boolean;
  readonly canPublish: boolean;
  /** Yayın kapalı nedeni: onay bekleyen marka (V5). */
  readonly publishBlocked: 'brand_pending' | null;
  readonly canArchive: boolean;
  readonly canRestore: boolean;
}

/** AC5 + AC9: durum, izin ve marka durumuna göre düğmeler. */
export function productActions(
  status: ProductStatus | null,
  canManage: boolean,
  brandStatus: 'requested' | 'active' | null,
): ProductActions {
  if (!canManage) {
    return {
      editable: false,
      canSave: false,
      canPublish: false,
      publishBlocked: null,
      canArchive: false,
      canRestore: false,
    };
  }
  const pending = brandStatus === 'requested';
  return {
    editable: status !== 'archived',
    canSave: status !== 'archived',
    canPublish: status === 'draft' && !pending,
    publishBlocked: status === 'draft' && pending ? 'brand_pending' : null,
    canArchive: status === 'draft' || status === 'active',
    canRestore: status === 'archived',
  };
}

export interface ProductsAccess {
  readonly view: boolean;
  readonly manage: boolean;
}

/** Ürün ekranı izinleri (AC9): görme `catalog.view`, yazma `catalog.manage`. */
export function productsAccess(codes: readonly string[]): ProductsAccess {
  return { view: codes.includes('catalog.view'), manage: codes.includes('catalog.manage') };
}

// ---- Kategori seçici ----

export interface CategoryOptionRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly name: Partial<Record<LanguageCode, string>>;
}

export interface CategoryOption {
  readonly id: string;
  readonly label: string;
  readonly depth: number;
  /** Ürünün kayıtlı kategorisi artık görünür listede yok (pasif; #77 N5). */
  readonly unavailable: boolean;
}

/**
 * Görünür kategoriler ağaç sırasıyla, etiket "Üst › Alt" (K8: herhangi bir seviye seçilebilir).
 * `currentId` listede yoksa (pasifleşmiş) en başa `unavailable` olarak eklenir; kayıt kaybolmaz.
 */
export function categoryOptions(
  rows: readonly CategoryOptionRow[],
  lang: string,
  currentId: string | undefined,
): CategoryOption[] {
  const nameOf = (row: CategoryOptionRow) => pickLocalizedText(row.name, lang) ?? row.id;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path = (row: CategoryOptionRow): string => {
    const parent = row.parentId === null ? undefined : byId.get(row.parentId);
    return parent === undefined ? nameOf(row) : `${path(parent)} › ${nameOf(row)}`;
  };
  const options: CategoryOption[] = categoryTree(rows, nameOf).map((row) => ({
    id: row.id,
    label: path(row),
    depth: row.depth,
    unavailable: false,
  }));
  if (currentId !== undefined && currentId !== '' && !byId.has(currentId)) {
    options.unshift({ id: currentId, label: '', depth: 1, unavailable: true });
  }
  return options;
}
