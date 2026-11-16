// Kategori, marka ve faaliyet alanı kataloğu (F3.2a, US-029): API ve web admin ekranının
// paylaştığı kurallar. openapi `Category`, `Brand`, `ActivityTypeAdmin` ve istek gövdeleri.
import { z } from 'zod';
import { catalogNameSchema } from './role-catalog';

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
