// Excel içe aktarma için katalog yazma kapısı (F3.5c; c4 §2 imports → catalog; kart K1–K3, K6).
// Bir satır = bir varyant. Yeni satır taslak ürün + tek varyant + `unit` (satış birimi) ve isteğe
// bağlı `case` ambalajı açar; güncelleme yalnız dolu değerleri yazar (boş hücre = değiştirme).
// İşlem ve savepoint çağırandan gelir; SKU çakışması (23505) çağırana fırlatılır
// (`isImportSkuTaken`), çağıran yalnız o satırı hatalı sayar.
import { Inject, Injectable, Module } from '@nestjs/common';
import type { PackagingLevel } from '@b2b/shared';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { IdGenerator } from '../../core/id-generator';
import { type PackagingShape, packagingProblems, type UnitFacts } from './packaging-rules';
import {
  isProductSkuTaken,
  isVariantSkuTaken,
  type PackagingRow,
  type PackagingValues,
  ProductsRepository,
} from './products.repository';
import { productVariants } from './products.schema';

/** Koli ambalajının birimi (UN/ECE Rec. 20 "carton"; ürün formuyla aynı). */
const CASE_UNIT_CODE = 'XCT';

/** Yazılacak satır (imports `RowWrite` ile aynı biçim; boş alan = değiştirme). */
export interface ImportProductWrite {
  readonly target:
    | { readonly kind: 'insert' }
    | { readonly kind: 'update'; readonly productId: string; readonly variantId: string };
  readonly sku: string;
  readonly names: Partial<Record<'az' | 'ru' | 'tr', string>>;
  readonly categoryId?: string;
  readonly brandId?: string;
  readonly baseUnitCode?: string;
  readonly gtin?: string;
  readonly caseQty?: string;
}

export type ImportWriteRejection = 'archived' | 'packaging_conflict' | 'variant_ambiguous';

export type ImportWriteResult =
  | {
      readonly ok: true;
      readonly action: 'insert' | 'update';
      /** Fiyatın yazılacağı `unit` ambalajı; yoksa null (Mimar S3). */
      readonly unitPackagingId: string | null;
    }
  | {
      readonly ok: false;
      readonly column: 'sku' | 'case_qty';
      readonly code: ImportWriteRejection;
    };

/** Satırın SKU'su yazım anında başka ürüne/varyanta ait (harf duyarsız dizin, K6). */
export function isImportSkuTaken(error: unknown): boolean {
  return isProductSkuTaken(error) || isVariantSkuTaken(error);
}

const SIMPLE_PACKAGING = {
  gtin: null,
  weightG: null,
  dimensionsMm: null,
  minOrderQty: '1',
  orderMultiple: '1',
} as const;

function shapeOf(row: PackagingValues | PackagingRow): PackagingShape {
  return {
    level: row.level,
    unitCode: row.unitCode,
    baseQty: row.baseQty,
    isSalesUnit: row.isSalesUnit,
    minOrderQty: row.minOrderQty,
    orderMultiple: row.orderMultiple,
  };
}

@Injectable()
export class ProductImportWriter {
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  async writeTx(
    tx: Tx,
    sellerId: string,
    write: ImportProductWrite,
    now: Date,
  ): Promise<ImportWriteResult> {
    return write.target.kind === 'insert'
      ? await this.insertTx(tx, sellerId, write, now)
      : await this.updateTx(tx, sellerId, write, write.target, now);
  }

  private async unitsTx(tx: Tx, codes: readonly string[]): Promise<Map<string, UnitFacts>> {
    const rows = await this.repository.unitsByCode(tx, [...new Set(codes)]);
    return new Map(rows.map((row) => [row.code, { allowsDecimal: row.allowsDecimal }]));
  }

  private async insertTx(
    tx: Tx,
    sellerId: string,
    write: ImportProductWrite,
    now: Date,
  ): Promise<ImportWriteResult> {
    const { baseUnitCode, categoryId } = write;
    // Doğrulayıcı yeni satırda ikisini de zorunlu tutar; burada yalnız tür daraltma.
    if (baseUnitCode === undefined || categoryId === undefined) {
      throw new Error('içe aktarma: yeni satırda birim ve kategori zorunlu');
    }
    const packaging: PackagingValues[] = [
      {
        ...SIMPLE_PACKAGING,
        level: 'unit',
        unitCode: baseUnitCode,
        baseQty: '1',
        isSalesUnit: true,
      },
    ];
    if (write.caseQty !== undefined) {
      packaging.push(this.casePackaging(write.caseQty));
    }
    const units = await this.unitsTx(
      tx,
      packaging.map((item) => item.unitCode),
    );
    if (Object.keys(packagingProblems(packaging.map(shapeOf), baseUnitCode, units, 'p')).length) {
      return { ok: false, column: 'case_qty', code: 'packaging_conflict' };
    }

    const productId = this.ids.next();
    const variantId = this.ids.next();
    await this.repository.insertProduct(tx, {
      id: productId,
      sellerId,
      sku: write.sku,
      name: write.names,
      description: null,
      categoryId,
      brandId: write.brandId ?? null,
      baseUnitCode,
      hasExpiry: false,
      shelfLifeMonths: null,
      now,
    });
    await this.repository.insertVariant(tx, {
      id: variantId,
      productId,
      sellerId,
      sku: write.sku,
      attributes: {},
      gtin: write.gtin ?? null,
      sortOrder: 0,
      now,
    });
    let unitPackagingId: string | null = null;
    for (const item of packaging) {
      const id = this.ids.next();
      if (item.level === 'unit') unitPackagingId = id;
      await this.repository.insertPackaging(tx, { ...item, id, variantId, sellerId, now });
    }
    return { ok: true, action: 'insert', unitPackagingId };
  }

  private async updateTx(
    tx: Tx,
    sellerId: string,
    write: ImportProductWrite,
    target: { readonly productId: string; readonly variantId: string },
    now: Date,
  ): Promise<ImportWriteResult> {
    // Kilit sırası ürün → varyantlar → ambalaj (ürün formuyla aynı, F3.3a).
    const product = await this.repository.lockProduct(tx, sellerId, target.productId);
    if (product === undefined || product.status === 'archived') {
      return { ok: false, column: 'sku', code: 'archived' };
    }
    await this.repository.lockVariantsOf(tx, sellerId, product.id);
    const variants = await this.repository.variantsOf(tx, sellerId, product.id);
    const variant = variants.find((row) => row.id === target.variantId);
    if (variant?.status !== 'active') {
      return { ok: false, column: 'sku', code: 'archived' };
    }

    const current = await this.repository.packagingOf(tx, sellerId, [variant.id]);
    let caseChange: { id: string | null; values: PackagingValues } | undefined;
    if (write.caseQty !== undefined) {
      const existing = current.find((row) => row.level === 'case');
      const values: PackagingValues =
        existing === undefined
          ? this.casePackaging(write.caseQty)
          : {
              level: existing.level,
              unitCode: existing.unitCode,
              baseQty: write.caseQty,
              gtin: existing.gtin,
              weightG: existing.weightG,
              dimensionsMm: existing.dimensionsMm as PackagingValues['dimensionsMm'],
              isSalesUnit: existing.isSalesUnit,
              minOrderQty: existing.minOrderQty,
              orderMultiple: existing.orderMultiple,
            };
      const next = [...current.filter((row) => row.level !== 'case').map(shapeOf), shapeOf(values)];
      const units = await this.unitsTx(tx, [product.baseUnitCode, ...next.map((p) => p.unitCode)]);
      if (Object.keys(packagingProblems(next, product.baseUnitCode, units, 'p')).length > 0) {
        return { ok: false, column: 'case_qty', code: 'packaging_conflict' };
      }
      caseChange = { id: existing?.id ?? null, values };
    }

    const names = Object.keys(write.names).length > 0;
    if (names || write.categoryId !== undefined || write.brandId !== undefined) {
      await this.repository.updateProduct(
        tx,
        product.id,
        {
          name: names ? { ...(product.name as Record<string, string>), ...write.names } : undefined,
          categoryId: write.categoryId,
          brandId: write.brandId,
        },
        now,
      );
    }
    if (write.gtin !== undefined) {
      await tx
        .update(productVariants)
        .set({ gtin: write.gtin, updatedAt: now })
        .where(and(eq(productVariants.id, variant.id), eq(productVariants.sellerId, sellerId)));
    }
    if (caseChange !== undefined) {
      if (caseChange.id === null) {
        await this.repository.insertPackaging(tx, {
          ...caseChange.values,
          id: this.ids.next(),
          variantId: variant.id,
          sellerId,
          now,
        });
      } else {
        await this.repository.updatePackaging(tx, caseChange.id, caseChange.values, now);
      }
    }
    const unit = current.find((row) => row.level === ('unit' satisfies PackagingLevel));
    return { ok: true, action: 'update', unitPackagingId: unit?.id ?? null };
  }

  private casePackaging(baseQty: string): PackagingValues {
    return {
      ...SIMPLE_PACKAGING,
      level: 'case',
      unitCode: CASE_UNIT_CODE,
      baseQty,
      isSalesUnit: false,
    };
  }
}

/** İçe aktarma uygulaması (worker) için katalog yazma kapısı (F3.5c). */
@Module({
  providers: [ProductsRepository, ProductImportWriter],
  exports: [ProductImportWriter],
})
export class CatalogImportWriterModule {}
