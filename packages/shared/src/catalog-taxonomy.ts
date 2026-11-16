// Kategori, marka ve faaliyet alanı kataloğu (F3.2a, US-029): API ve web admin ekranının
// paylaştığı kurallar. openapi `Category`, `Brand`, `ActivityTypeAdmin` ve istek gövdeleri.
import { z } from 'zod';
import {
  CATALOG_NAME_MAX,
  type CatalogFieldError,
  type CatalogLang,
  type CatalogNameBody,
  catalogNameSchema,
  type CatalogNameValues,
} from './role-catalog';

/** Kategori ağacı en çok 3 seviye (US-029 VARSAYIM; veritabanında CHECK + tetikleyici). */
export const CATEGORY_MAX_DEPTH = 3;

/** openapi `SortOrder`. */
export const sortOrderSchema = z.number().int().min(0).max(10_000);

/** openapi `POST /admin/catalog/categories`; üst kategori sonradan değişmez (kart K4). */
export const categoryCreateSchema = z.strictObject({
  parentId: z.uuid().nullable().optional(),
  name: catalogNameSchema,
  sortOrder: sortOrderSchema.optional(),
});
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;

/** openapi `PATCH /admin/catalog/categories/{id}` ve `/activity-types/{id}`. */
export const catalogEntryPatchSchema = z
  .strictObject({
    name: catalogNameSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'empty' });
export type CatalogEntryPatch = z.infer<typeof catalogEntryPatchSchema>;

/** openapi `POST /admin/catalog/activity-types`. */
export const activityTypeCreateSchema = z.strictObject({
  name: catalogNameSchema,
  sortOrder: sortOrderSchema.optional(),
});
export type ActivityTypeCreate = z.infer<typeof activityTypeCreateSchema>;

/** Marka adı tek metin (F3 V4); tekliği büyük/küçük harf ve kenar boşluğu duyarsız (kart K1). */
export const BRAND_NAME_MAX = 80;
export const brandNameSchema = z.string().trim().min(1).max(BRAND_NAME_MAX);

/** Marka durumu (state-machines §13). */
export const BRAND_STATUSES = ['requested', 'active', 'rejected'] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];

/** openapi `POST /catalog/brands` (toptancının marka talebi) ve `POST /admin/catalog/brands`. */
export const brandCreateSchema = z.strictObject({ name: brandNameSchema });
export type BrandCreate = z.infer<typeof brandCreateSchema>;

/** openapi `PATCH /admin/catalog/brands/{id}`: onay/red (`status`), ad düzeltme, aktiflik. */
export const brandPatchSchema = z
  .strictObject({
    name: brandNameSchema.optional(),
    status: z.enum(['active', 'rejected']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'empty' });
export type BrandPatch = z.infer<typeof brandPatchSchema>;

/** openapi `GET /admin/catalog/brands` süzgeci. */
export const adminBrandsQuerySchema = z.strictObject({
  status: z.enum(BRAND_STATUSES).optional(),
  q: z.string().trim().max(BRAND_NAME_MAX).optional(),
});
export type AdminBrandsQuery = z.infer<typeof adminBrandsQuerySchema>;

/** openapi `GET /catalog/brands`: aktif markalarda ad araması. */
export const BRAND_SEARCH_LIMIT_MAX = 50;
export const BRAND_SEARCH_LIMIT_DEFAULT = 20;
export const brandsQuerySchema = z.strictObject({
  q: z.string().trim().max(BRAND_NAME_MAX).optional(),
  limit: z.coerce.number().int().min(1).max(BRAND_SEARCH_LIMIT_MAX).optional(),
});
export type BrandsQuery = z.infer<typeof brandsQuerySchema>;

// --- Web admin ekranları (F3.2b) ---

/** Kategori ve faaliyet alanı formu: 4 dilde ad + sıra (metin; boş = 0). */
export interface TaxonomyFormValues {
  readonly name: CatalogNameValues;
  readonly sortOrder: string;
}

export type TaxonomyFormErrors = Partial<
  Record<`name.${CatalogLang}` | 'sortOrder', CatalogFieldError>
>;

export interface TaxonomyFormBody {
  name: CatalogNameBody;
  sortOrder: number;
}

const REQUIRED_NAME_LANGS: readonly CatalogLang[] = ['az', 'ru', 'tr'];
const SORT_ORDER_MAX = 10_000;

/** Form → gövde (F3.2b-AC6): az/ru/tr zorunlu, en isteğe bağlı; sıra 0–10000 tam sayı. */
export function taxonomyFormBody(
  values: TaxonomyFormValues,
): { ok: true; body: TaxonomyFormBody } | { ok: false; errors: TaxonomyFormErrors } {
  const errors: TaxonomyFormErrors = {};
  const text = (lang: CatalogLang): string => {
    const value = values.name[lang].trim();
    if (value === '' && REQUIRED_NAME_LANGS.includes(lang)) errors[`name.${lang}`] = 'required';
    if (value.length > CATALOG_NAME_MAX) errors[`name.${lang}`] = 'too_long';
    return value;
  };
  const name: CatalogNameBody = { az: text('az'), ru: text('ru'), tr: text('tr') };
  const en = text('en');
  if (en !== '') name.en = en;
  const rawSort = values.sortOrder.trim();
  const sortOrder = rawSort === '' ? 0 : Number(rawSort);
  if (!/^\d+$/.test(rawSort === '' ? '0' : rawSort) || sortOrder > SORT_ORDER_MAX) {
    errors.sortOrder = 'invalid';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { name, sortOrder } };
}

/** Marka adı formu (F3.2b-AC6): 1–80 karakter, kenar boşlukları atılır. */
export function brandFormBody(
  name: string,
): { ok: true; body: { name: string } } | { ok: false; error: CatalogFieldError } {
  const value = name.trim();
  if (value === '') return { ok: false, error: 'required' };
  if (value.length > BRAND_NAME_MAX) return { ok: false, error: 'too_long' };
  return { ok: true, body: { name: value } };
}

export type TaxonomyFailureReason =
  | 'name_taken'
  | 'parent_not_found'
  | 'parent_inactive'
  | 'max_depth'
  | 'invalid_transition'
  | 'not_found'
  | 'invalid';

export type TaxonomyFailure =
  | { readonly kind: 'taxonomy'; readonly reason: TaxonomyFailureReason }
  | { readonly kind: 'code'; readonly code: string };

/**
 * Kategori, marka, faaliyet alanı API hatası → ekran mesajı (F3.2b-AC4). 422 ayrıntıları openapi
 * `/admin/catalog/{categories,brands,activity-types}` açıklamalarındaki nedenlerdir.
 */
export function taxonomyFailure(
  error: { readonly code?: string; readonly details?: unknown } | undefined,
): TaxonomyFailure {
  const code = error?.code ?? 'INTERNAL_ERROR';
  if (code === 'INVALID_STATE_TRANSITION')
    return { kind: 'taxonomy', reason: 'invalid_transition' };
  if (code === 'NOT_FOUND') return { kind: 'taxonomy', reason: 'not_found' };
  if (code !== 'VALIDATION_FAILED') return { kind: 'code', code };
  const details =
    typeof error?.details === 'object' && error.details !== null
      ? (error.details as Record<string, unknown>)
      : {};
  const reasons = (field: string): unknown[] => {
    const value = details[field];
    return Array.isArray(value) ? value : [];
  };
  if (reasons('name').includes('taken')) return { kind: 'taxonomy', reason: 'name_taken' };
  const parent = reasons('parentId');
  if (parent.includes('max_depth')) return { kind: 'taxonomy', reason: 'max_depth' };
  if (parent.includes('inactive')) return { kind: 'taxonomy', reason: 'parent_inactive' };
  if (parent.includes('not_found')) return { kind: 'taxonomy', reason: 'parent_not_found' };
  return { kind: 'taxonomy', reason: 'invalid' };
}

/** `GET /admin/catalog/categories` satırı (openapi `Category`) — ağaç için gereken alanlar. */
export interface CategoryRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export type CategoryTreeItem<T extends CategoryRow> = T & {
  /** Bir üst kategorisi pasif: genel listede görünmez (F3.2a-AC4). */
  readonly parentInactive: boolean;
  /** Altına kategori eklenebilir mi: aktif, üstü aktif ve seviye < 3 (F3.2a-AC3). */
  readonly canAddChild: boolean;
  readonly childCount: number;
};

/**
 * Düz liste → ağaç sırası (F3.2b-AC1): her üstün hemen ardından altları; kardeşler `sortOrder`,
 * sonra `id` sırasıyla. Üstü listede olmayan satır kök gibi en sona eklenir (veri kaybı yok).
 */
export function categoryTree<T extends CategoryRow>(
  rows: readonly T[],
  sortName: (row: T) => string = () => '',
): CategoryTreeItem<T>[] {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    const key = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    const list = children.get(key) ?? [];
    list.push(row);
    children.set(key, list);
  }
  const compare = (a: T, b: T) =>
    a.sortOrder - b.sortOrder || sortName(a).localeCompare(sortName(b)) || a.id.localeCompare(b.id);
  const out: CategoryTreeItem<T>[] = [];
  const walk = (parentId: string | null, hiddenAbove: boolean) => {
    const list = [...(children.get(parentId) ?? [])].sort(compare);
    for (const row of list) {
      const kids = children.get(row.id)?.length ?? 0;
      out.push({
        ...row,
        parentInactive: hiddenAbove,
        canAddChild: row.isActive && !hiddenAbove && row.depth < CATEGORY_MAX_DEPTH,
        childCount: kids,
      });
      walk(row.id, hiddenAbove || !row.isActive);
    }
  };
  walk(null, false);
  return out;
}
