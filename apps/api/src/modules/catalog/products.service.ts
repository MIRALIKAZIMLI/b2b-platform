// Ürün kuralları (F3.3a, US-030 AC1, AC2, AC5, AC6; kart K1–K10). Her işlem çağıranın kiracı
// işleminde (`withTenantTx`); perakendeci bu servise hiç ulaşmaz (izin `catalog.*` yeteneği
// `seller`). Durum değişiklikleri yalnız `ProductStateMachine` ile; audit yalnız durum değişince.
import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_LIST_LIMIT_DEFAULT,
  type PackagingInput,
  type PackagingLevel,
  type ProductCreate,
  type ProductStatus,
  type ProductsQuery,
  type ProductUpdate,
  type VariantInput,
  type VariantStatus,
} from '@b2b/shared';
import Decimal from 'decimal.js';
import { type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import type { TenantContext } from '../../core/tenant-context';
import { type FieldErrors, packagingProblems, type UnitFacts } from './packaging-rules';
import type { ProductImageRow } from './product-images.repository';
import { type ProductImageView, ProductImagesService } from './product-images.service';
import { ProductStateMachine } from './product.state-machine';
import {
  type BrandRefRow,
  isProductSkuTaken,
  isVariantSkuTaken,
  skuKey,
  type PackagingRow,
  type PackagingValues,
  type ProductListCursor,
  type ProductRow,
  ProductsRepository,
  type VariantRow,
} from './products.repository';

/** openapi `Packaging`. */
export interface PackagingView {
  readonly id: string;
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

/** openapi `Variant`. */
export interface VariantView {
  readonly id: string;
  readonly sku: string;
  readonly attributes: Record<string, unknown>;
  readonly gtin: string | null;
  readonly isAvailable: boolean;
  readonly status: VariantStatus;
  readonly packaging: PackagingView[];
}

/** openapi `Product` (toptancı bakışı). */
export interface ProductView {
  readonly id: string;
  readonly sku: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly categoryId: string;
  readonly brandId: string | null;
  readonly brand: { readonly id: string; readonly name: string; readonly status: string } | null;
  readonly baseUnitCode: string;
  readonly hasExpiry: boolean;
  readonly shelfLifeMonths: number | null;
  readonly status: ProductStatus;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly variants: VariantView[];
  readonly visibility: { readonly regionIds: string[] };
  /** F3.4a: sırayla; ilk görsel kapak (K6, K10). */
  readonly images: ProductImageView[];
}

/** İşlem içinde kurulan görünüm; görsel adresleri işlemden sonra eklenir. */
type ProductViewDraft = Omit<ProductView, 'images'> & { readonly imageRows: ProductImageRow[] };

/** openapi `ProductListItem`. */
export interface ProductListItemView {
  readonly id: string;
  readonly sku: string;
  readonly name: Record<string, string>;
  readonly status: ProductStatus;
  readonly categoryId: string;
  readonly brand: { readonly id: string; readonly name: string } | null;
  readonly activeVariantCount: number;
  /** F3.4a: ilk `ready` görselin 200 px adresi (K10). */
  readonly thumbUrl: string | null;
  readonly updatedAt: string;
}

export interface ProductListView {
  readonly items: ProductListItemView[];
  readonly nextCursor: string | null;
}

class FieldErrorBag {
  readonly errors: FieldErrors = {};

  add(field: string, reason: string): void {
    const list = (this.errors[field] ??= []);
    if (!list.includes(reason)) list.push(reason);
  }

  merge(other: FieldErrors): void {
    for (const [field, reasons] of Object.entries(other)) {
      for (const reason of reasons) this.add(field, reason);
    }
  }

  throwIfAny(): void {
    if (Object.keys(this.errors).length > 0) {
      throw new DomainError('VALIDATION_FAILED', this.errors);
    }
  }
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

/** `numeric` metnini sondaki sıfırlar olmadan verir ("24.000" → "24"). */
function qty(value: string): string {
  return new Decimal(value).toFixed();
}

function packagingView(row: PackagingRow): PackagingView {
  return {
    id: row.id,
    level: row.level,
    unitCode: row.unitCode,
    baseQty: qty(row.baseQty),
    gtin: row.gtin,
    weightG: row.weightG,
    dimensionsMm: (row.dimensionsMm as PackagingView['dimensionsMm']) ?? null,
    isSalesUnit: row.isSalesUnit,
    minOrderQty: qty(row.minOrderQty),
    orderMultiple: qty(row.orderMultiple),
  };
}

function packagingValues(input: PackagingInput): PackagingValues {
  return {
    level: input.level,
    unitCode: input.unitCode,
    baseQty: input.baseQty,
    gtin: input.gtin ?? null,
    weightG: input.weightG ?? null,
    dimensionsMm: input.dimensionsMm ?? null,
    isSalesUnit: input.isSalesUnit,
    minOrderQty: input.minOrderQty,
    orderMultiple: input.orderMultiple,
  };
}

/** İmleç: `<createdAt ISO>|<id>` base64url. Bozuk imleç 422. */
function encodeCursor(cursor: ProductListCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString('base64url');
}

function decodeCursor(value: string): ProductListCursor {
  const [iso, id] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  const createdAt = iso === undefined ? new Date(Number.NaN) : new Date(iso);
  if (id === undefined || Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw invalid('cursor', 'invalid');
  }
  return { createdAt, id };
}

/** Görünür kategori: kendisi ve bütün üstleri aktif (F3.2a AC4). */
function categoryState(
  rows: readonly { id: string; parentId: string | null; isActive: boolean }[],
  id: string,
): 'visible' | 'inactive' | 'not_found' {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let current = byId.get(id);
  if (current === undefined) return 'not_found';
  for (let depth = 0; current !== undefined && depth < 5; depth++) {
    if (!current.isActive) return 'inactive';
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return 'visible';
}

/**
 * Marka seçilebilir mi (V5): `active` ve aktif marka; ya da çağıranın kendi bekleyen talebi.
 * Başka işletmenin talebi RLS'te görünmez (`not_found`); reddedilen marka `not_found`.
 */
function brandState(
  brand: BrandRefRow | undefined,
  sellerId: string,
): 'ok' | 'inactive' | 'not_found' {
  if (brand === undefined || brand.status === 'rejected') return 'not_found';
  if (brand.status === 'requested') {
    return brand.requestedByBusinessId === sellerId ? 'ok' : 'not_found';
  }
  return brand.isActive ? 'ok' : 'inactive';
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(ProductImagesService)
    private readonly images: Pick<ProductImagesService, 'rowsOf' | 'views' | 'thumbUrls'>,
  ) {}

  /** `GET /products`: kendi ürünleri, yeniden eskiye, imleçli. */
  async list(tenant: TenantContext, query: ProductsQuery): Promise<ProductListView> {
    const limit = query.limit ?? PRODUCT_LIST_LIMIT_DEFAULT;
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    const { rows, imageRows } = await withTenantTx(tenant, async (tx) => {
      const found = await this.repository.listProducts(tx, tenant.businessId, {
        q: query.q,
        status: query.status,
        cursor,
        limit: limit + 1,
      });
      const ids = found.slice(0, limit).map((row) => row.id);
      return { rows: found, imageRows: await this.images.rowsOf(tx, tenant.businessId, ids) };
    });
    const thumbs = await this.images.thumbUrls(imageRows, tenant.businessId);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        sku: row.sku,
        name: row.name as Record<string, string>,
        status: row.status,
        categoryId: row.categoryId,
        brand:
          row.brandId === null || row.brandName === null
            ? null
            : { id: row.brandId, name: row.brandName },
        activeVariantCount: row.activeVariantCount,
        thumbUrl: thumbs.get(row.id) ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  /** `GET /products/{id}`: başka kiracının ürünü 404. */
  async get(tenant: TenantContext, id: string): Promise<ProductView> {
    const draft = await withTenantTx(tenant, async (tx) => {
      const product = await this.repository.findProduct(tx, tenant.businessId, id);
      if (product === undefined) throw new DomainError('NOT_FOUND');
      return await this.viewTx(tx, product);
    });
    return await this.withImages(draft, tenant.businessId);
  }

  /** US-030 AC1: ürün her zaman `draft` açılır. */
  async create(tenant: TenantContext, input: ProductCreate): Promise<ProductView> {
    const now = this.clock.now();
    try {
      const draft = await withTenantTx(tenant, async (tx) => {
        const bag = new FieldErrorBag();
        await this.checkReferencesTx(tx, tenant.businessId, bag, {
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          status: 'draft',
        });
        this.checkShelfLife(bag, input.hasExpiry, input.shelfLifeMonths ?? null);
        await this.checkSkusTx(tx, tenant.businessId, bag, input.sku, input.variants, undefined);
        await this.checkUnitsTx(tx, bag, input.baseUnitCode, input.variants, new Set());
        const regionIds = input.visibility?.regionIds ?? [];
        await this.checkRegionsTx(tx, bag, regionIds);
        bag.throwIfAny();

        const id = this.ids.next();
        await this.repository.insertProduct(tx, {
          id,
          sellerId: tenant.businessId,
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          baseUnitCode: input.baseUnitCode,
          hasExpiry: input.hasExpiry,
          shelfLifeMonths: input.shelfLifeMonths ?? null,
          now,
        });
        await this.writeVariantsTx(tx, tenant.businessId, id, input.variants, [], [], now);
        await this.writeVisibilityTx(tx, tenant.businessId, id, regionIds, now);
        const product = await this.repository.findProduct(tx, tenant.businessId, id);
        if (product === undefined) throw new Error('ürün okunamadı');
        return await this.viewTx(tx, product);
      });
      return await this.withImages(draft, tenant.businessId);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /** `PATCH /products/{id}`: kısmi düzenleme ve durum geçişi (K1–K3). */
  async update(
    tenant: TenantContext,
    id: string,
    input: ProductUpdate,
    context: AuditRequestContext,
  ): Promise<ProductView> {
    const now = this.clock.now();
    try {
      const draft = await withTenantTx(tenant, async (tx) => {
        const current = await this.repository.lockProduct(tx, tenant.businessId, id);
        if (current === undefined) throw new DomainError('NOT_FOUND');

        const nextStatus = input.status ?? current.status;
        const statusChanges = nextStatus !== current.status;
        if (statusChanges) ProductStateMachine.assertTransition(current.status, nextStatus);
        const edits = Object.keys(input).some((key) => key !== 'status');
        // Arşivdeki ürün yalnız geri alınır (state-machines §14).
        if (edits && current.status === 'archived') {
          throw new DomainError('INVALID_STATE_TRANSITION');
        }

        const bag = new FieldErrorBag();
        const categoryId = input.categoryId ?? current.categoryId;
        const brandId = input.brandId === undefined ? current.brandId : input.brandId;
        const baseUnitCode = input.baseUnitCode ?? current.baseUnitCode;
        const hasExpiry = input.hasExpiry ?? current.hasExpiry;
        const shelfLifeMonths =
          input.shelfLifeMonths === undefined
            ? hasExpiry
              ? current.shelfLifeMonths
              : null
            : input.shelfLifeMonths;

        await this.checkReferencesTx(tx, tenant.businessId, bag, {
          // R38: zaten kayıtlı ve pasifleşmiş kayıt kalabilir; yalnız yeni seçilen aktif olmalı.
          categoryId: categoryId === current.categoryId ? undefined : categoryId,
          brandId: brandId === current.brandId ? undefined : brandId,
          status: nextStatus,
        });
        // K2: yayında olacak ürünün markası onaylı olmalı (V5).
        if (nextStatus === 'active' && brandId !== null) {
          const brand = await this.repository.findBrand(tx, brandId);
          if (brand?.status !== 'active') bag.add('brandId', 'not_approved');
        }
        this.checkShelfLife(bag, hasExpiry, shelfLifeMonths);

        await this.repository.lockVariantsOf(tx, tenant.businessId, id);
        const variants = await this.repository.variantsOf(tx, tenant.businessId, id);
        const packaging = await this.repository.packagingOf(
          tx,
          tenant.businessId,
          variants.map((variant) => variant.id),
        );
        if (input.variants !== undefined) {
          const known = new Set(variants.map((variant) => variant.id));
          input.variants.forEach((variant, index) => {
            if (variant.id !== undefined && !known.has(variant.id)) {
              bag.add(`variants.${String(index)}.id`, 'not_found');
            }
          });
          const usedUnits = new Set(packaging.map((row) => row.unitCode));
          if (baseUnitCode === current.baseUnitCode) usedUnits.add(current.baseUnitCode);
          await this.checkUnitsTx(tx, bag, baseUnitCode, input.variants, usedUnits);
        } else if (baseUnitCode !== current.baseUnitCode) {
          // Temel birim değişince var olan ambalajlar yeni birimle yeniden denetlenir.
          await this.checkUnitsTx(
            tx,
            bag,
            baseUnitCode,
            this.activeVariantsAsInput(variants, packaging),
            new Set(packaging.map((row) => row.unitCode)),
          );
        }
        if (input.visibility !== undefined) {
          await this.checkRegionsTx(tx, bag, input.visibility.regionIds);
        }
        await this.checkSkusTx(tx, tenant.businessId, bag, input.sku, input.variants, id);
        bag.throwIfAny();

        await this.repository.updateProduct(
          tx,
          id,
          {
            sku: input.sku,
            name: input.name,
            description: input.description,
            categoryId: input.categoryId,
            brandId: input.brandId,
            baseUnitCode: input.baseUnitCode,
            hasExpiry: input.hasExpiry,
            shelfLifeMonths:
              input.shelfLifeMonths !== undefined || input.hasExpiry !== undefined
                ? shelfLifeMonths
                : undefined,
            status: statusChanges ? nextStatus : undefined,
            publishedAt: statusChanges && nextStatus === 'active' ? now : undefined,
          },
          now,
        );
        if (input.variants !== undefined) {
          await this.writeVariantsTx(
            tx,
            tenant.businessId,
            id,
            input.variants,
            variants,
            packaging,
            now,
          );
        }
        if (input.visibility !== undefined) {
          await this.writeVisibilityTx(tx, tenant.businessId, id, input.visibility.regionIds, now);
        }
        if (statusChanges) {
          await this.audit.record(tx, {
            actor: { type: 'user', userId: tenant.userId },
            businessId: tenant.businessId,
            action:
              nextStatus === 'active'
                ? 'product.published'
                : nextStatus === 'archived'
                  ? 'product.archived'
                  : 'product.restored',
            targetType: 'product',
            targetId: id,
            before: { status: current.status },
            after: { status: nextStatus },
            context,
          });
        }
        const product = await this.repository.findProduct(tx, tenant.businessId, id);
        if (product === undefined) throw new Error('ürün okunamadı');
        return await this.viewTx(tx, product);
      });
      return await this.withImages(draft, tenant.businessId);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  // --- Yardımcılar ---

  private mapUniqueViolation(error: unknown): unknown {
    if (isProductSkuTaken(error)) return invalid('sku', 'taken');
    if (isVariantSkuTaken(error)) return invalid('variants.sku', 'taken');
    return error;
  }

  /**
   * F3.5a (kullanıcı kararı A; #77 N4, #78): SKU harf duyarsız tekil. Çakışma ilgili alana iner
   * (`sku`, `variants.<i>.sku`); eşzamanlı yazımda veritabanı dizini (23505) yedektir.
   */
  private async checkSkusTx(
    tx: Tx,
    sellerId: string,
    bag: FieldErrorBag,
    sku: string | undefined,
    variants: readonly Pick<VariantInput, 'id' | 'sku'>[] | undefined,
    productId: string | undefined,
  ): Promise<void> {
    if (
      sku !== undefined &&
      (await this.repository.productSkuTakenTx(tx, sellerId, sku, productId))
    ) {
      bag.add('sku', 'taken');
    }
    if (variants === undefined) return;
    const owners = await this.repository.variantIdsBySkuTx(
      tx,
      sellerId,
      variants.map((variant) => variant.sku),
    );
    variants.forEach((variant, index) => {
      const owner = owners.get(skuKey(variant.sku));
      if (owner !== undefined && owner !== variant.id) {
        bag.add(`variants.${String(index)}.sku`, 'taken');
      }
    });
  }

  private checkShelfLife(bag: FieldErrorBag, hasExpiry: boolean, months: number | null): void {
    // US-030 AC5.
    if (hasExpiry && months === null) bag.add('shelfLifeMonths', 'required');
    if (!hasExpiry && months !== null) bag.add('shelfLifeMonths', 'must_be_empty');
  }

  /** `undefined` alan denetlenmez (değişmeyen kayıt, R38). */
  private async checkReferencesTx(
    tx: Tx,
    sellerId: string,
    bag: FieldErrorBag,
    refs: {
      categoryId?: string | undefined;
      brandId?: string | null | undefined;
      status: ProductStatus;
    },
  ): Promise<void> {
    if (refs.categoryId !== undefined) {
      const state = categoryState(await this.repository.categoriesAll(tx), refs.categoryId);
      if (state !== 'visible') bag.add('categoryId', state);
    }
    if (refs.brandId !== undefined && refs.brandId !== null) {
      const state = brandState(await this.repository.findBrand(tx, refs.brandId), sellerId);
      if (state !== 'ok') bag.add('brandId', state);
    }
  }

  /**
   * Birimler var ve (yeni kullanılıyorsa) aktif; ambalaj kuralları (K4). `alreadyUsed`: ürünün
   * zaten kullandığı birimler (pasifleşmiş olsa da kalabilir, R38).
   */
  private async checkUnitsTx(
    tx: Tx,
    bag: FieldErrorBag,
    baseUnitCode: string,
    variants: readonly Pick<VariantInput, 'packaging'>[],
    alreadyUsed: ReadonlySet<string>,
  ): Promise<void> {
    const codes = new Set<string>([baseUnitCode]);
    for (const variant of variants) for (const item of variant.packaging) codes.add(item.unitCode);
    const rows = await this.repository.unitsByCode(tx, [...codes]);
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const facts = new Map<string, UnitFacts>(rows.map((row) => [row.code, row]));

    const unitIssue = (code: string): string | undefined => {
      const row = byCode.get(code);
      if (row === undefined) return 'not_found';
      if (!row.isActive && !alreadyUsed.has(code)) return 'inactive';
      return undefined;
    };
    const baseIssue = unitIssue(baseUnitCode);
    if (baseIssue !== undefined) bag.add('baseUnitCode', baseIssue);
    variants.forEach((variant, i) => {
      variant.packaging.forEach((item, j) => {
        const issue = unitIssue(item.unitCode);
        if (issue !== undefined)
          bag.add(`variants.${String(i)}.packaging.${String(j)}.unitCode`, issue);
      });
      bag.merge(
        packagingProblems(
          variant.packaging,
          baseUnitCode,
          facts,
          `variants.${String(i)}.packaging`,
        ),
      );
    });
  }

  private async checkRegionsTx(
    tx: Tx,
    bag: FieldErrorBag,
    regionIds: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(regionIds)];
    if (unique.length !== regionIds.length) bag.add('visibility.regionIds', 'duplicate');
    const existing = await this.repository.existingRegionIds(tx, unique);
    if (unique.some((id) => !existing.has(id))) bag.add('visibility.regionIds', 'not_found');
  }

  private activeVariantsAsInput(
    variants: readonly VariantRow[],
    packaging: readonly PackagingRow[],
  ): Pick<VariantInput, 'packaging'>[] {
    return variants
      .filter((variant) => variant.status === 'active')
      .map((variant) => ({
        packaging: packaging
          .filter((row) => row.variantId === variant.id)
          .map((row) => ({
            level: row.level,
            unitCode: row.unitCode,
            baseQty: row.baseQty,
            isSalesUnit: row.isSalesUnit,
            minOrderQty: row.minOrderQty,
            orderMultiple: row.orderMultiple,
          })),
      }));
  }

  /**
   * K3: `id`'li varyant güncellenir (arşivliyse yeniden etkinleşir), `id`'siz eklenir, listede
   * olmayan arşivlenir. Ambalaj seviyesine göre: var olan seviye kimliğini korur, yenisi eklenir,
   * listede olmayan silinir.
   */
  private async writeVariantsTx(
    tx: Tx,
    sellerId: string,
    productId: string,
    inputs: readonly VariantInput[],
    existing: readonly VariantRow[],
    existingPackaging: readonly PackagingRow[],
    now: Date,
  ): Promise<void> {
    const keep = inputs.flatMap((variant) => (variant.id === undefined ? [] : [variant.id]));
    // Önce arşivle: arşivlenen varyantın SKU'su yine dolu kalır (K3, yeniden kullanılmaz).
    if (existing.length > 0) await this.repository.archiveVariantsExcept(tx, productId, keep, now);

    for (const [index, variant] of inputs.entries()) {
      const values = {
        sku: variant.sku,
        attributes: variant.attributes,
        gtin: variant.gtin ?? null,
        sortOrder: index,
      };
      let variantId = variant.id;
      if (variantId === undefined) {
        variantId = this.ids.next();
        await this.repository.insertVariant(tx, {
          ...values,
          id: variantId,
          productId,
          sellerId,
          now,
        });
      } else {
        await this.repository.updateVariant(tx, variantId, values, now);
      }
      const byLevel = new Map(
        existingPackaging
          .filter((row) => row.variantId === variantId)
          .map((row) => [row.level, row]),
      );
      const wanted = new Set(variant.packaging.map((item) => item.level));
      await this.repository.deletePackaging(
        tx,
        [...byLevel.values()].filter((row) => !wanted.has(row.level)).map((row) => row.id),
      );
      for (const item of variant.packaging) {
        const row = byLevel.get(item.level);
        if (row === undefined) {
          await this.repository.insertPackaging(tx, {
            ...packagingValues(item),
            id: this.ids.next(),
            variantId,
            sellerId,
            now,
          });
        } else {
          await this.repository.updatePackaging(tx, row.id, packagingValues(item), now);
        }
      }
    }
  }

  private async writeVisibilityTx(
    tx: Tx,
    sellerId: string,
    productId: string,
    regionIds: readonly string[],
    now: Date,
  ): Promise<void> {
    await this.repository.replaceVisibility(
      tx,
      sellerId,
      productId,
      [...new Set(regionIds)].map((regionId) => ({ id: this.ids.next(), regionId })),
      now,
    );
  }

  /**
   * Görsel adresleri işlem dışında üretilir (F3.4a): adres üretimi ayar okur, ayrı bağlantı ister;
   * işlem içinde çağrılsa küçük havuzda kilitlenirdi.
   */
  private async withImages(draft: ProductViewDraft, sellerId: string): Promise<ProductView> {
    const { imageRows, ...view } = draft;
    const images = await this.images.views(imageRows, sellerId);
    return { ...view, images: images.get(view.id) ?? [] };
  }

  private async viewTx(tx: Tx, product: ProductRow): Promise<ProductViewDraft> {
    const variants = await this.repository.variantsOf(tx, product.sellerId, product.id);
    const packaging = await this.repository.packagingOf(
      tx,
      product.sellerId,
      variants.map((variant) => variant.id),
    );
    const regionIds = await this.repository.regionIdsOf(tx, product.sellerId, product.id);
    const brand =
      product.brandId === null ? undefined : await this.repository.findBrand(tx, product.brandId);
    const imageRows = await this.images.rowsOf(tx, product.sellerId, [product.id]);
    return {
      id: product.id,
      sku: product.sku,
      name: product.name as Record<string, string>,
      description: (product.description as Record<string, string> | null) ?? null,
      categoryId: product.categoryId,
      brandId: product.brandId,
      brand: brand === undefined ? null : { id: brand.id, name: brand.name, status: brand.status },
      baseUnitCode: product.baseUnitCode,
      hasExpiry: product.hasExpiry,
      shelfLifeMonths: product.shelfLifeMonths,
      status: product.status,
      publishedAt: product.publishedAt?.toISOString() ?? null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      variants: variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        attributes: (variant.attributes as Record<string, unknown> | null) ?? {},
        gtin: variant.gtin,
        isAvailable: variant.isAvailable,
        status: variant.status,
        packaging: packaging.filter((row) => row.variantId === variant.id).map(packagingView),
      })),
      visibility: { regionIds },
      imageRows,
    };
  }
}
