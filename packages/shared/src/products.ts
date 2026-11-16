// Ürün, varyant, ambalaj (F3.3a, US-030): API ve web ürün formunun (F3.3b) paylaştığı şekil
// kuralları. openapi `ProductInput`, `ProductUpdate`, `Variant`, `Packaging`. Birim bilgisine ve
// ondalık karşılaştırmaya dayanan ambalaj kuralları (kart K4) API'de (`packaging-rules.ts`).
import { z } from 'zod';
import { LANGUAGE_CODES } from './localized-text';

/** Ürün durumu (state-machines §14). */
export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const VARIANT_STATUSES = ['active', 'archived'] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

/** Ambalaj seviyeleri, küçükten büyüğe (K4: `baseQty` bu sırayla kesin artar). */
export const PACKAGING_LEVELS = ['unit', 'inner', 'case', 'pallet'] as const;
export type PackagingLevel = (typeof PACKAGING_LEVELS)[number];

export const PRODUCT_SKU_MAX = 64;
export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_DESCRIPTION_MAX = 5000;
export const PRODUCT_VARIANTS_MAX = 50;
export const VARIANT_PACKAGING_MAX = PACKAGING_LEVELS.length;
export const VARIANT_ATTRIBUTES_MAX = 20;
export const PRODUCT_REGIONS_MAX = 50;
export const SHELF_LIFE_MONTHS_MAX = 120;
export const PRODUCT_LIST_LIMIT_MAX = 100;
export const PRODUCT_LIST_LIMIT_DEFAULT = 20;

/** SKU: boşluksuz 1–64 karakter (harf, rakam, `.`, `_`, `-`, `/`). */
export const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRODUCT_SKU_MAX)
  .regex(/^[\p{L}\p{N}._\-/]+$/u);

function localizedSchema(max: number) {
  const text = z.string().trim().max(max).optional();
  return z.strictObject({ az: text, ru: text, tr: text, en: text }).transform((value) => {
    const out: Partial<Record<(typeof LANGUAGE_CODES)[number], string>> = {};
    for (const lang of LANGUAGE_CODES) {
      const text = value[lang];
      if (text !== undefined && text !== '') out[lang] = text;
    }
    return out;
  });
}

/** US-030 AC1 / K7: en az bir dilde dolu ad; boş diller atılır. */
export const productNameSchema = localizedSchema(PRODUCT_NAME_MAX).refine(
  (value) => Object.keys(value).length > 0,
  { message: 'required' },
);
export const productDescriptionSchema = localizedSchema(PRODUCT_DESCRIPTION_MAX);

/** GTIN-8/12/13/14 ve kontrol hanesi (GS1 mod 10). */
export function isValidGtin(value: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(value)) return false;
  const digits: number[] = [];
  for (let i = 0; i < value.length; i++) digits.push(value.charCodeAt(i) - 48);
  const check = digits.pop() ?? 0;
  let sum = 0;
  digits.reverse().forEach((digit, index) => {
    sum += digit * (index % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

export const gtinSchema = z.string().trim().refine(isValidGtin, { message: 'invalid_gtin' });

/** Miktar (`numeric(14,3)`): pozitif, en çok 3 ondalık. Karşılaştırma API'de decimal.js ile. */
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/)
  .refine((value) => /[1-9]/.test(value), { message: 'positive' });

const unitCodeSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);

const dimensionSchema = z.number().int().min(1).max(100_000);

export const packagingInputSchema = z.strictObject({
  level: z.enum(PACKAGING_LEVELS),
  unitCode: unitCodeSchema,
  baseQty: quantitySchema,
  gtin: gtinSchema.nullable().optional(),
  weightG: z.number().int().min(1).max(10_000_000).nullable().optional(),
  dimensionsMm: z
    .strictObject({ l: dimensionSchema, w: dimensionSchema, h: dimensionSchema })
    .nullable()
    .optional(),
  isSalesUnit: z.boolean().default(false),
  minOrderQty: quantitySchema.default('1'),
  orderMultiple: quantitySchema.default('1'),
});
export type PackagingInput = z.infer<typeof packagingInputSchema>;

const attributeValueSchema = z.union([z.string().trim().max(100), z.number(), z.boolean()]);

export const variantAttributesSchema = z
  .record(z.string().trim().min(1).max(40), attributeValueSchema)
  .refine((value) => Object.keys(value).length <= VARIANT_ATTRIBUTES_MAX, {
    message: 'too_many',
  });

export const variantInputSchema = z.strictObject({
  /** Var olan varyant (PATCH); yoksa yeni varyant. */
  id: z.uuid().optional(),
  sku: skuSchema,
  attributes: variantAttributesSchema.default({}),
  gtin: gtinSchema.nullable().optional(),
  packaging: z.array(packagingInputSchema).min(1).max(VARIANT_PACKAGING_MAX),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

/** K5: yalnız bölge kuralı; fiyat listesi kuralı F3.6a. */
export const productVisibilityInputSchema = z.strictObject({
  regionIds: z.array(z.uuid()).max(PRODUCT_REGIONS_MAX).default([]),
});

const variantsSchema = z
  .array(variantInputSchema)
  .min(1)
  .max(PRODUCT_VARIANTS_MAX)
  .superRefine((variants, ctx) => {
    const skus = new Set<string>();
    const ids = new Set<string>();
    variants.forEach((variant, index) => {
      const key = variant.sku.toLowerCase();
      if (skus.has(key)) {
        ctx.addIssue({ code: 'custom', path: [index, 'sku'], message: 'duplicate' });
      }
      skus.add(key);
      if (variant.id !== undefined) {
        if (ids.has(variant.id)) {
          ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'duplicate' });
        }
        ids.add(variant.id);
      }
    });
  });

const shelfLifeSchema = z.number().int().min(1).max(SHELF_LIFE_MONTHS_MAX).nullable();

/** openapi `ProductInput` (`POST /products`): her zaman `draft` açılır. */
export const productCreateSchema = z
  .strictObject({
    sku: skuSchema,
    name: productNameSchema,
    description: productDescriptionSchema.nullable().optional(),
    categoryId: z.uuid(),
    brandId: z.uuid().nullable().optional(),
    baseUnitCode: unitCodeSchema,
    hasExpiry: z.boolean().default(false),
    shelfLifeMonths: shelfLifeSchema.optional(),
    variants: variantsSchema,
    visibility: productVisibilityInputSchema.optional(),
  })
  .superRefine((value, ctx) => {
    for (const variant of value.variants) {
      if (variant.id !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['variants'], message: 'id_not_allowed' });
        return;
      }
    }
  });
export type ProductCreate = z.infer<typeof productCreateSchema>;

/**
 * openapi `ProductUpdate` (`PATCH /products/{id}`): kısmi. `variants` verilirse tam liste (K3):
 * `id`'li olan güncellenir, `id`'siz eklenir, listede olmayan arşivlenir. `status` yalnız durum
 * makinesiyle (§14). `hasExpiry`/`shelfLifeMonths` tutarlılığı birleşik değerde (API).
 */
export const productUpdateSchema = z
  .strictObject({
    sku: skuSchema.optional(),
    name: productNameSchema.optional(),
    description: productDescriptionSchema.nullable().optional(),
    categoryId: z.uuid().optional(),
    brandId: z.uuid().nullable().optional(),
    baseUnitCode: unitCodeSchema.optional(),
    hasExpiry: z.boolean().optional(),
    shelfLifeMonths: shelfLifeSchema.optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    variants: variantsSchema.optional(),
    visibility: productVisibilityInputSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'empty' });
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

/** openapi `GET /products` süzgeci. */
export const productsQuerySchema = z.strictObject({
  q: z.string().trim().max(PRODUCT_NAME_MAX).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PRODUCT_LIST_LIMIT_MAX).optional(),
});
export type ProductsQuery = z.infer<typeof productsQuerySchema>;
