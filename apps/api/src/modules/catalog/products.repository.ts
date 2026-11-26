// Ürün sorguları (F3.3a, US-030). Bütün okuma ve yazmalar çağıranın kiracı işleminde; RLS yalnız
// `seller_id = app.business_id` satırlarını gösterir (başka kiracının kaydı "yok" = 404). Sorgular
// ayrıca `seller_id`'yi açıkça süzer (ikinci savunma).
import { Injectable } from '@nestjs/common';
import type { BrandStatus, PackagingLevel, ProductStatus, VariantStatus } from '@b2b/shared';
import { and, asc, desc, eq, inArray, notInArray, or, type SQL, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { brands, categories, units } from './catalog.schema';
import { productPackaging, products, productVariants, productVisibility } from './products.schema';

export interface ProductRow {
  readonly id: string;
  readonly sellerId: string;
  readonly sku: string;
  readonly name: unknown;
  readonly description: unknown;
  readonly categoryId: string;
  readonly brandId: string | null;
  readonly baseUnitCode: string;
  readonly hasExpiry: boolean;
  readonly shelfLifeMonths: number | null;
  readonly status: ProductStatus;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VariantRow {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly attributes: unknown;
  readonly gtin: string | null;
  readonly isAvailable: boolean;
  readonly status: VariantStatus;
  readonly sortOrder: number;
}

export interface PackagingRow {
  readonly id: string;
  readonly variantId: string;
  readonly level: PackagingLevel;
  readonly unitCode: string;
  readonly baseQty: string;
  readonly gtin: string | null;
  readonly weightG: number | null;
  readonly dimensionsMm: unknown;
  readonly isSalesUnit: boolean;
  readonly minOrderQty: string;
  readonly orderMultiple: string;
}

export interface ProductListRow {
  readonly id: string;
  readonly sku: string;
  readonly name: unknown;
  readonly status: ProductStatus;
  readonly categoryId: string;
  readonly brandId: string | null;
  readonly brandName: string | null;
  readonly activeVariantCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandRefRow {
  readonly id: string;
  readonly name: string;
  readonly status: BrandStatus;
  readonly isActive: boolean;
  readonly requestedByBusinessId: string | null;
}

export interface UnitRefRow {
  readonly code: string;
  readonly allowsDecimal: boolean;
  readonly isActive: boolean;
}

export interface CategoryRefRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly isActive: boolean;
}

export interface NewProductRow {
  readonly id: string;
  readonly sellerId: string;
  readonly sku: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly categoryId: string;
  readonly brandId: string | null;
  readonly baseUnitCode: string;
  readonly hasExpiry: boolean;
  readonly shelfLifeMonths: number | null;
  readonly now: Date;
}

export interface ProductPatchRow {
  sku?: string | undefined;
  name?: Record<string, string> | undefined;
  description?: Record<string, string> | null | undefined;
  categoryId?: string | undefined;
  brandId?: string | null | undefined;
  baseUnitCode?: string | undefined;
  hasExpiry?: boolean | undefined;
  shelfLifeMonths?: number | null | undefined;
  status?: ProductStatus | undefined;
  publishedAt?: Date | undefined;
}

export interface VariantValues {
  readonly sku: string;
  readonly attributes: Record<string, unknown>;
  readonly gtin: string | null;
  readonly sortOrder: number;
}

export interface PackagingValues {
  readonly level: PackagingLevel;
  readonly unitCode: string;
  readonly baseQty: string;
  readonly gtin: string | null;
  readonly weightG: number | null;
  readonly dimensionsMm: { l: number; w: number; h: number } | null;
  readonly isSalesUnit: boolean;
  readonly minOrderQty: string;
  readonly orderMultiple: string;
}

const productColumns = {
  id: products.id,
  sellerId: products.sellerId,
  sku: products.sku,
  name: products.name,
  description: products.description,
  categoryId: products.categoryId,
  brandId: products.brandId,
  baseUnitCode: products.baseUnitCode,
  hasExpiry: products.hasExpiry,
  shelfLifeMonths: products.shelfLifeMonths,
  status: sql<ProductStatus>`${products.status}`,
  publishedAt: products.publishedAt,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

const variantColumns = {
  id: productVariants.id,
  productId: productVariants.productId,
  sku: productVariants.sku,
  attributes: productVariants.attributes,
  gtin: productVariants.gtin,
  isAvailable: productVariants.isAvailable,
  status: sql<VariantStatus>`${productVariants.status}`,
  sortOrder: productVariants.sortOrder,
};

const packagingColumns = {
  id: productPackaging.id,
  variantId: productPackaging.variantId,
  level: sql<PackagingLevel>`${productPackaging.level}`,
  unitCode: productPackaging.unitCode,
  baseQty: productPackaging.baseQty,
  gtin: productPackaging.gtin,
  weightG: productPackaging.weightG,
  dimensionsMm: productPackaging.dimensionsMm,
  isSalesUnit: productPackaging.isSalesUnit,
  minOrderQty: productPackaging.minOrderQty,
  orderMultiple: productPackaging.orderMultiple,
};

/** Seviye sırası (adet → palet) SQL'de. */
const LEVEL_RANK = sql`array_position(array['unit','inner','case','pallet']::text[], ${productPackaging.level})`;

function pgErrorOf(error: unknown, code: string, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && current.code === code) {
      return (
        constraint === undefined || ('constraint' in current && current.constraint === constraint)
      );
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

/** Ürün SKU'su satıcı içinde tek (`products_seller_sku_uq`). */
export function isProductSkuTaken(error: unknown): boolean {
  return pgErrorOf(error, '23505', 'products_seller_sku_uq');
}

/** Varyant SKU'su satıcı içinde tek (`product_variants_seller_sku_uq`; arşivliler dahil, K3). */
export function isVariantSkuTaken(error: unknown): boolean {
  return pgErrorOf(error, '23505', 'product_variants_seller_sku_uq');
}

/** Bir dosya tek görsel (`product_images_file_uq`, F3.4a K9). */
export function isProductImageFileTaken(error: unknown): boolean {
  return pgErrorOf(error, '23505', 'product_images_file_uq');
}

/** `ilike` için `%`, `_` ve `\` kaçışlı desen. */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `undefined` alanlar UPDATE'e girmez (kısmi PATCH). */
function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Partial<T>;
}

export interface ProductListCursor {
  readonly createdAt: Date;
  readonly id: string;
}

@Injectable()
export class ProductsRepository {
  async insertProduct(tx: Tx, row: NewProductRow): Promise<void> {
    await tx.insert(products).values({
      id: row.id,
      sellerId: row.sellerId,
      sku: row.sku,
      name: row.name,
      description: row.description,
      categoryId: row.categoryId,
      brandId: row.brandId,
      baseUnitCode: row.baseUnitCode,
      hasExpiry: row.hasExpiry,
      shelfLifeMonths: row.shelfLifeMonths,
      status: 'draft',
      createdAt: row.now,
      updatedAt: row.now,
    });
  }

  async findProduct(tx: Tx, sellerId: string, id: string): Promise<ProductRow | undefined> {
    const rows = await tx
      .select(productColumns)
      .from(products)
      .where(and(eq(products.id, id), eq(products.sellerId, sellerId)));
    return rows[0];
  }

  /** PATCH'in ilk adımı (kilit sırası: ürün → varyantlar → ambalaj/görünürlük). */
  async lockProduct(tx: Tx, sellerId: string, id: string): Promise<ProductRow | undefined> {
    const rows = await tx
      .select(productColumns)
      .from(products)
      .where(and(eq(products.id, id), eq(products.sellerId, sellerId)))
      .for('update');
    return rows[0];
  }

  async updateProduct(tx: Tx, id: string, patch: ProductPatchRow, now: Date): Promise<void> {
    await tx
      .update(products)
      .set({ ...definedOnly(patch), updatedAt: now })
      .where(eq(products.id, id));
  }

  async listProducts(
    tx: Tx,
    sellerId: string,
    filter: {
      q?: string | undefined;
      status?: ProductStatus | undefined;
      cursor?: ProductListCursor | undefined;
      limit: number;
    },
  ): Promise<ProductListRow[]> {
    const conditions: SQL[] = [eq(products.sellerId, sellerId)];
    if (filter.status !== undefined) conditions.push(eq(products.status, filter.status));
    if (filter.q !== undefined && filter.q.length > 0) {
      const prefix = `${escapeLike(filter.q)}%`;
      const contains = `%${escapeLike(filter.q)}%`;
      const nameMatch = sql`exists (select 1 from jsonb_each_text(${products.name}) as n(lang, value) where n.value ilike ${contains})`;
      const match = or(sql`${products.sku} ilike ${prefix}`, nameMatch);
      if (match !== undefined) conditions.push(match);
    }
    if (filter.cursor !== undefined) {
      conditions.push(
        sql`(${products.createdAt}, ${products.id}) < (${filter.cursor.createdAt.toISOString()}::timestamptz, ${filter.cursor.id}::uuid)`,
      );
    }
    return await tx
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        status: sql<ProductStatus>`${products.status}`,
        categoryId: products.categoryId,
        brandId: products.brandId,
        brandName: brands.name,
        activeVariantCount: sql<number>`(select count(*)::int from ${productVariants} v where v.product_id = ${products.id} and v.status = 'active')`,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(...conditions))
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(filter.limit);
  }

  /** Ürünün varyantları (arşivliler dahil), sıra ve oluşturma sırasıyla. */
  async variantsOf(tx: Tx, sellerId: string, productId: string): Promise<VariantRow[]> {
    return await tx
      .select(variantColumns)
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), eq(productVariants.sellerId, sellerId)))
      .orderBy(
        asc(productVariants.sortOrder),
        asc(productVariants.createdAt),
        asc(productVariants.id),
      );
  }

  /** Varyant satırları kimlik sırasıyla kilitlenir (eşzamanlı PATCH'te aynı sıra). */
  async lockVariantsOf(tx: Tx, sellerId: string, productId: string): Promise<void> {
    await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), eq(productVariants.sellerId, sellerId)))
      .orderBy(asc(productVariants.id))
      .for('update');
  }

  async packagingOf(
    tx: Tx,
    sellerId: string,
    variantIds: readonly string[],
  ): Promise<PackagingRow[]> {
    if (variantIds.length === 0) return [];
    return await tx
      .select(packagingColumns)
      .from(productPackaging)
      .where(
        and(
          inArray(productPackaging.variantId, [...variantIds]),
          eq(productPackaging.sellerId, sellerId),
        ),
      )
      .orderBy(asc(productPackaging.variantId), asc(LEVEL_RANK));
  }

  async regionIdsOf(tx: Tx, sellerId: string, productId: string): Promise<string[]> {
    const rows = await tx
      .select({ regionId: productVisibility.regionId })
      .from(productVisibility)
      .where(
        and(eq(productVisibility.productId, productId), eq(productVisibility.sellerId, sellerId)),
      )
      .orderBy(asc(productVisibility.regionId));
    return rows.map((row) => row.regionId);
  }

  async insertVariant(
    tx: Tx,
    row: VariantValues & { id: string; productId: string; sellerId: string; now: Date },
  ): Promise<void> {
    await tx.insert(productVariants).values({
      id: row.id,
      productId: row.productId,
      sellerId: row.sellerId,
      sku: row.sku,
      attributes: row.attributes,
      gtin: row.gtin,
      sortOrder: row.sortOrder,
      status: 'active',
      createdAt: row.now,
      updatedAt: row.now,
    });
  }

  async updateVariant(tx: Tx, id: string, values: VariantValues, now: Date): Promise<void> {
    await tx
      .update(productVariants)
      .set({ ...values, status: 'active', updatedAt: now })
      .where(eq(productVariants.id, id));
  }

  /** K3: listede olmayan varyantlar arşivlenir (silinmez). */
  async archiveVariantsExcept(
    tx: Tx,
    productId: string,
    keepIds: readonly string[],
    now: Date,
  ): Promise<void> {
    const conditions: SQL[] = [
      eq(productVariants.productId, productId),
      eq(productVariants.status, 'active'),
    ];
    if (keepIds.length > 0) conditions.push(notInArray(productVariants.id, [...keepIds]));
    await tx
      .update(productVariants)
      .set({ status: 'archived', updatedAt: now })
      .where(and(...conditions));
  }

  async insertPackaging(
    tx: Tx,
    row: PackagingValues & { id: string; variantId: string; sellerId: string; now: Date },
  ): Promise<void> {
    await tx.insert(productPackaging).values({
      id: row.id,
      variantId: row.variantId,
      sellerId: row.sellerId,
      level: row.level,
      unitCode: row.unitCode,
      baseQty: row.baseQty,
      gtin: row.gtin,
      weightG: row.weightG,
      dimensionsMm: row.dimensionsMm,
      isSalesUnit: row.isSalesUnit,
      minOrderQty: row.minOrderQty,
      orderMultiple: row.orderMultiple,
      createdAt: row.now,
      updatedAt: row.now,
    });
  }

  /** Seviye kimliği korunur (F3.6 fiyat satırları ambalaja bağlanır). */
  async updatePackaging(tx: Tx, id: string, values: PackagingValues, now: Date): Promise<void> {
    // Seviye (`level`) değişmez: kimlik eşlemesi seviyeye göre.
    await tx
      .update(productPackaging)
      .set({
        unitCode: values.unitCode,
        baseQty: values.baseQty,
        gtin: values.gtin,
        weightG: values.weightG,
        dimensionsMm: values.dimensionsMm,
        isSalesUnit: values.isSalesUnit,
        minOrderQty: values.minOrderQty,
        orderMultiple: values.orderMultiple,
        updatedAt: now,
      })
      .where(eq(productPackaging.id, id));
  }

  async deletePackaging(tx: Tx, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.delete(productPackaging).where(inArray(productPackaging.id, [...ids]));
  }

  async replaceVisibility(
    tx: Tx,
    sellerId: string,
    productId: string,
    rows: readonly { id: string; regionId: string }[],
    now: Date,
  ): Promise<void> {
    await tx
      .delete(productVisibility)
      .where(
        and(eq(productVisibility.productId, productId), eq(productVisibility.sellerId, sellerId)),
      );
    if (rows.length === 0) return;
    await tx.insert(productVisibility).values(
      rows.map((row) => ({
        id: row.id,
        productId,
        sellerId,
        regionId: row.regionId,
        createdAt: now,
      })),
    );
  }

  // --- Başvurulan katalog kayıtları (G; RLS: marka yalnız aktif + kendi talebi, V5) ---

  async categoriesAll(tx: Tx): Promise<CategoryRefRow[]> {
    return await tx
      .select({ id: categories.id, parentId: categories.parentId, isActive: categories.isActive })
      .from(categories);
  }

  async findBrand(tx: Tx, id: string): Promise<BrandRefRow | undefined> {
    const rows = await tx
      .select({
        id: brands.id,
        name: brands.name,
        status: sql<BrandStatus>`${brands.status}`,
        isActive: brands.isActive,
        requestedByBusinessId: brands.requestedByBusinessId,
      })
      .from(brands)
      .where(eq(brands.id, id));
    return rows[0];
  }

  async unitsByCode(tx: Tx, codes: readonly string[]): Promise<UnitRefRow[]> {
    if (codes.length === 0) return [];
    return await tx
      .select({ code: units.code, allowsDecimal: units.allowsDecimal, isActive: units.isActive })
      .from(units)
      .where(inArray(units.code, [...codes]));
  }

  async existingRegionIds(tx: Tx, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const result = await tx.execute<{ id: string }>(
      sql`select id from public.regions where id = any(${`{${ids.join(',')}}`}::uuid[])`,
    );
    return new Set(result.rows.map((row) => row.id));
  }
}
