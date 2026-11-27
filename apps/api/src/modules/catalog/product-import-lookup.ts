// Excel içe aktarma için katalog okuma kapısı (F3.5a; c4 §2 imports → catalog). Yalnız okur; çağıran
// işlemi (`withTenantTx`, satıcı bağlamı) verir. Ürün yazımı F3.5c'de bu modülde kalır.
import { Injectable } from '@nestjs/common';
import type { ProductStatus, VariantStatus } from '@b2b/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { brands, categories, units } from './catalog.schema';
import { products, productVariants } from './products.schema';
import { skuKey } from './products.repository';

export interface ImportCategoryRef {
  readonly id: string;
  readonly parentId: string | null;
  readonly isActive: boolean;
  readonly name: Record<string, string>;
}

export interface ImportBrandRef {
  readonly id: string;
  readonly name: string;
}

export interface ImportUnitRef {
  readonly code: string;
  readonly allowsDecimal: boolean;
  readonly isActive: boolean;
  readonly name: Record<string, string>;
  readonly abbreviation: Record<string, string>;
}

export interface ImportVariantMatch {
  readonly variantId: string;
  readonly productId: string;
  readonly variantStatus: VariantStatus;
  readonly productStatus: ProductStatus;
  readonly baseUnitCode: string;
}

export interface ImportProductMatch {
  readonly productId: string;
  readonly status: ProductStatus;
  readonly baseUnitCode: string;
  readonly activeVariantCount: number;
}

/** Harf duyarsız SKU anahtarı → eşleşme (kart K2: önce varyant, sonra ürün SKU'su). */
export interface ImportSkuMatches {
  readonly variants: ReadonlyMap<string, ImportVariantMatch>;
  readonly products: ReadonlyMap<string, ImportProductMatch>;
}

@Injectable()
export class ProductImportLookup {
  /** Bütün kategoriler (görünürlük üst zincirle hesaplanır, F3.2a AC4). */
  async categoriesTx(tx: Tx): Promise<ImportCategoryRef[]> {
    const rows = await tx
      .select({
        id: categories.id,
        parentId: categories.parentId,
        isActive: categories.isActive,
        name: categories.name,
      })
      .from(categories);
    return rows.map((row) => ({ ...row, name: row.name as Record<string, string> }));
  }

  /** Seçilebilir markalar (V5): aktif onaylı marka veya satıcının kendi bekleyen talebi. */
  async brandsTx(tx: Tx, sellerId: string): Promise<ImportBrandRef[]> {
    return await tx
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(
        sql`(${brands.status} = 'active' and ${brands.isActive}) or (${brands.status} = 'requested' and ${brands.requestedByBusinessId} = ${sellerId})`,
      );
  }

  async unitsTx(tx: Tx): Promise<ImportUnitRef[]> {
    const rows = await tx
      .select({
        code: units.code,
        allowsDecimal: units.allowsDecimal,
        isActive: units.isActive,
        name: units.name,
        abbreviation: units.abbreviation,
      })
      .from(units);
    return rows.map((row) => ({
      ...row,
      name: row.name as Record<string, string>,
      abbreviation: row.abbreviation as Record<string, string>,
    }));
  }

  /** Dosyadaki SKU'ların var olan varyant ve ürün eşleşmeleri (arşivliler dahil). */
  async skuMatchesTx(tx: Tx, sellerId: string, skus: readonly string[]): Promise<ImportSkuMatches> {
    const keys = [...new Set(skus.map(skuKey))];
    if (keys.length === 0) return { variants: new Map(), products: new Map() };

    const variantRows = await tx
      .select({
        key: sql<string>`lower(${productVariants.sku})`,
        variantId: productVariants.id,
        productId: productVariants.productId,
        variantStatus: sql<VariantStatus>`${productVariants.status}`,
        productStatus: sql<ProductStatus>`${products.status}`,
        baseUnitCode: products.baseUnitCode,
      })
      .from(productVariants)
      .innerJoin(
        products,
        and(eq(products.id, productVariants.productId), eq(products.sellerId, sellerId)),
      )
      .where(
        and(
          eq(productVariants.sellerId, sellerId),
          inArray(sql`lower(${productVariants.sku})`, keys),
        ),
      );

    const productRows = await tx
      .select({
        key: sql<string>`lower(${products.sku})`,
        productId: products.id,
        status: sql<ProductStatus>`${products.status}`,
        baseUnitCode: products.baseUnitCode,
        // Alt sorgu dış satıra tam adla bağlanır (Drizzle tek tablolu seçimde sütunu nitelemez).
        activeVariantCount: sql<number>`(select count(*)::int from product_variants v where v.product_id = "products"."id" and v.seller_id = ${sellerId} and v.status = 'active')`,
      })
      .from(products)
      .where(and(eq(products.sellerId, sellerId), inArray(sql`lower(${products.sku})`, keys)));

    return {
      variants: new Map(variantRows.map(({ key, ...match }) => [key, match])),
      products: new Map(productRows.map(({ key, ...match }) => [key, match])),
    };
  }
}
