// Excel içe aktarma için katalog okuma kapısı (F3.5a; c4 §2 imports → catalog). Yalnız okur; çağıran
// işlemi (`withTenantTx`, satıcı bağlamı) verir. Ürün yazımı F3.5c'de bu modülde kalır.
import { Injectable } from '@nestjs/common';
import type { ProductStatus, VariantStatus } from '@b2b/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { brands, categories, units } from './catalog.schema';
import { productPackaging } from './products.schema';

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
  /** Varyantın `unit` ambalajı (fiyat hedefi); yoksa null. */
  readonly unitPackagingId: string | null;
}

export interface ImportProductMatch {
  readonly productId: string;
  readonly status: ProductStatus;
  readonly baseUnitCode: string;
  readonly activeVariantCount: number;
  /** Tek aktif varyant varsa kimliği ve `unit` ambalajı; değilse null. */
  readonly activeVariantId: string | null;
  readonly unitPackagingId: string | null;
}

/** Müşteri fiyatı şablonunun bir satırı (F3.7a K9): arşivli olmayan varyant ve `unit` ambalajı. */
export interface ImportPriceTemplateRow {
  readonly sku: string;
  readonly productName: Record<string, string>;
  readonly unitPackagingId: string;
}

/** Dosyadaki ham SKU → eşleşme (kart K2: önce varyant, sonra ürün SKU'su; harf duyarsız SQL). */
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

  /**
   * Dosyadaki SKU'ların var olan varyant ve ürün eşleşmeleri (arşivliler dahil). Harf duyarsızlık
   * veritabanının `lower()`'ı ile (benzersiz dizinlerle aynı; JS `toLowerCase` "İ" gibi harflerde
   * farklı sonuç verir, Müfettiş 29 not 1). Haritanın anahtarı dosyadaki ham SKU metnidir.
   */
  async skuMatchesTx(tx: Tx, sellerId: string, skus: readonly string[]): Promise<ImportSkuMatches> {
    const inputs = [...new Set(skus)];
    if (inputs.length === 0) return { variants: new Map(), products: new Map() };
    const list = sql`(select distinct s from unnest(${sql.raw('ARRAY[')}${sql.join(
      inputs.map((value) => sql`${value}::text`),
      sql`, `,
    )}${sql.raw(']')}) as s)`;

    const variantRows = await tx.execute<{
      input: string;
      variant_id: string;
      product_id: string;
      variant_status: VariantStatus;
      product_status: ProductStatus;
      base_unit_code: string;
      unit_packaging_id: string | null;
    }>(sql`select i.s as input, v.id as variant_id, v.product_id, v.status as variant_status,
                  p.status as product_status, p.base_unit_code,
                  (select k.id from product_packaging k
                    where k.variant_id = v.id and k.seller_id = ${sellerId} and k.level = 'unit')
                    as unit_packaging_id
             from ${list} i
             join product_variants v on v.seller_id = ${sellerId} and lower(v.sku) = lower(i.s)
             join products p on p.id = v.product_id and p.seller_id = ${sellerId}`);

    const productRows = await tx.execute<{
      input: string;
      product_id: string;
      status: ProductStatus;
      base_unit_code: string;
      active_variant_count: number;
      active_variant_id: string | null;
    }>(sql`select i.s as input, p.id as product_id, p.status, p.base_unit_code,
                  (select count(*)::int from product_variants v
                    where v.product_id = p.id and v.seller_id = ${sellerId} and v.status = 'active')
                    as active_variant_count,
                  (select min(v.id::text)::uuid from product_variants v
                    where v.product_id = p.id and v.seller_id = ${sellerId} and v.status = 'active')
                    as active_variant_id
             from ${list} i
             join products p on p.seller_id = ${sellerId} and lower(p.sku) = lower(i.s)`);

    const products = new Map<string, ImportProductMatch>();
    const variantIds = productRows.rows.flatMap((row) =>
      row.active_variant_count === 1 && row.active_variant_id !== null
        ? [row.active_variant_id]
        : [],
    );
    const unitPackaging = await this.unitPackagingTx(tx, sellerId, variantIds);
    for (const row of productRows.rows) {
      products.set(row.input, {
        productId: row.product_id,
        status: row.status,
        baseUnitCode: row.base_unit_code,
        activeVariantCount: row.active_variant_count,
        activeVariantId: row.active_variant_count === 1 ? row.active_variant_id : null,
        unitPackagingId:
          row.active_variant_id === null
            ? null
            : (unitPackaging.get(row.active_variant_id) ?? null),
      });
    }
    return {
      variants: new Map(
        variantRows.rows.map((row) => [
          row.input,
          {
            variantId: row.variant_id,
            productId: row.product_id,
            variantStatus: row.variant_status,
            productStatus: row.product_status,
            baseUnitCode: row.base_unit_code,
            unitPackagingId: row.unit_packaging_id,
          },
        ]),
      ),
      products,
    };
  }

  /**
   * F3.7a: müşteri fiyatı şablonu için satıcının arşivli olmayan (ürünü de arşivli olmayan) ve `unit`
   * ambalajı olan varyantları, SKU'ya göre; en çok `limit` satır (`imports.max_rows`).
   */
  async priceTemplateRowsTx(
    tx: Tx,
    sellerId: string,
    limit: number,
  ): Promise<ImportPriceTemplateRow[]> {
    const result = await tx.execute<{
      sku: string;
      product_name: Record<string, string>;
      packaging_id: string;
    }>(sql`select v.sku, p.name as product_name, k.id as packaging_id
             from product_variants v
             join products p on p.id = v.product_id and p.seller_id = ${sellerId}
             join product_packaging k
               on k.variant_id = v.id and k.seller_id = ${sellerId} and k.level = 'unit'
            where v.seller_id = ${sellerId}
              and v.status <> 'archived' and p.status <> 'archived'
            order by lower(v.sku)
            limit ${limit}`);
    return result.rows.map((row) => ({
      sku: row.sku,
      productName: row.product_name,
      unitPackagingId: row.packaging_id,
    }));
  }

  /** Varyant → `unit` ambalaj kimliği (fiyat yalnız bu seviyeye yazılır, Mimar S3). */
  private async unitPackagingTx(
    tx: Tx,
    sellerId: string,
    variantIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (variantIds.length === 0) return new Map();
    const rows = await tx
      .select({ variantId: productPackaging.variantId, id: productPackaging.id })
      .from(productPackaging)
      .where(
        and(
          eq(productPackaging.sellerId, sellerId),
          eq(productPackaging.level, 'unit'),
          inArray(productPackaging.variantId, [...variantIds]),
        ),
      );
    return new Map(rows.map((row) => [row.variantId, row.id]));
  }
}
