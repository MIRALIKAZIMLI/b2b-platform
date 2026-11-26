// Ürün görselleri (F3.4a, US-030 AC3; kart K1–K12). Dosya F1.10 akışıyla `ready` olur; burada ürüne
// bağlanır, worker küçültür (`jobs/resize-image.job.ts`). Ürün satırı `FOR UPDATE` ile kilitlenir:
// sınır sayımı (K4) ve sıra değişikliği eşzamanlı isteklerde tutarlı kalır. Audit yok (K12).
import { Inject, Injectable } from '@nestjs/common';
import type { ProductImageAdd, ProductImageOrder, ProductImageStatus } from '@b2b/shared';
import { Clock } from '../../core/clock';
import { type Tx, withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import type { TenantContext } from '../../core/tenant-context';
import { FilesService } from '../files';
import { SettingsService } from '../settings';
import { PRODUCT_IMAGE_SIZE_NAMES, renditionKey } from './product-image-keys';
import { type ProductImageRow, ProductImagesRepository } from './product-images.repository';
import {
  isProductImageFileTaken,
  type ProductRow,
  ProductsRepository,
} from './products.repository';

/** openapi `ProductImage`. */
export interface ProductImageView {
  readonly id: string;
  readonly sortOrder: number;
  readonly status: ProductImageStatus;
  /** Yalnız `ready` iken; orijinalin adresi hiç dönmez (K3). */
  readonly urls: { readonly thumb: string; readonly medium: string; readonly large: string } | null;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

@Injectable()
export class ProductImagesService {
  constructor(
    @Inject(ProductImagesRepository) private readonly repository: ProductImagesRepository,
    @Inject(ProductsRepository) private readonly products: ProductsRepository,
    @Inject(FilesService) private readonly files: Pick<FilesService, 'objectReadUrl'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  /** `POST /products/{id}/images` (K1, K4, K8, K9): 201 `processing`; iş outbox'tan. */
  async add(
    tenant: TenantContext,
    productId: string,
    input: ProductImageAdd,
  ): Promise<ProductImageView> {
    const limit = await this.settings.get('catalog.product_images_max', tenant.businessId);
    const now = this.clock.now();
    const sellerId = tenant.businessId;
    try {
      return await withTenantTx(tenant, async (tx) => {
        await this.lockEditable(tx, sellerId, productId);
        const file = await this.repository.findFile(tx, sellerId, input.fileId);
        if (file === undefined) throw new DomainError('NOT_FOUND');
        if (file.purpose !== 'product_image' || file.status !== 'ready') {
          throw invalid('fileId', 'invalid');
        }
        if (await this.repository.isFileInUse(tx, file.id)) throw invalid('fileId', 'in_use');
        const { total, maxSort } = await this.repository.countAndMaxSort(tx, sellerId, productId);
        if (total >= limit) throw invalid('fileId', 'limit');

        const id = this.ids.next();
        const sortOrder = maxSort === null ? 0 : maxSort + 1;
        await this.repository.insert(tx, {
          id,
          productId,
          sellerId,
          fileId: file.id,
          sortOrder,
          now,
        });
        await this.outbox.write(tx, {
          type: 'product_image.added',
          aggregateType: 'product',
          aggregateId: productId,
          businessIds: [sellerId],
          payload: { imageId: id, productId },
        });
        return { id, sortOrder, status: 'processing', urls: null };
      });
    } catch (error) {
      // Aynı dosyanın eşzamanlı ikinci eklenişi: benzersiz kısıt (K9), 500 değil.
      if (isProductImageFileTaken(error)) throw invalid('fileId', 'in_use');
      throw error;
    }
  }

  /** `PUT /products/{id}/images/order` (K6): ürünün bütün görselleri, her biri bir kez. */
  async reorder(tenant: TenantContext, productId: string, input: ProductImageOrder): Promise<void> {
    const now = this.clock.now();
    const sellerId = tenant.businessId;
    await withTenantTx(tenant, async (tx) => {
      await this.lockEditable(tx, sellerId, productId);
      const current = await this.repository.imagesOf(tx, sellerId, [productId]);
      const requested = new Set(input.imageIds);
      const matches =
        requested.size === input.imageIds.length &&
        requested.size === current.length &&
        current.every((image) => requested.has(image.id));
      if (!matches) throw invalid('imageIds', 'mismatch');
      const byId = new Map(current.map((image) => [image.id, image]));
      for (const [index, imageId] of input.imageIds.entries()) {
        if (byId.get(imageId)?.sortOrder !== index) {
          await this.repository.updateSortOrder(tx, imageId, index, now);
        }
      }
    });
  }

  /** `DELETE /products/{id}/images/{imageId}` (K7): satır silinir, depo nesneleri kalır. */
  async remove(tenant: TenantContext, productId: string, imageId: string): Promise<void> {
    const sellerId = tenant.businessId;
    await withTenantTx(tenant, async (tx) => {
      await this.lockEditable(tx, sellerId, productId);
      const deleted = await this.repository.delete(tx, sellerId, productId, imageId);
      if (deleted === 0) throw new DomainError('NOT_FOUND');
    });
  }

  /** Ürünlerin görsel satırları (işlem içinde). Adresler `views`/`thumbUrls` ile işlem dışında. */
  async rowsOf(
    tx: Tx,
    sellerId: string,
    productIds: readonly string[],
  ): Promise<ProductImageRow[]> {
    return await this.repository.imagesOf(tx, sellerId, productIds);
  }

  /**
   * Ürün görünümü için görseller (K10), ürün kimliğine göre. İşlem dışında çağrılır: adres üretimi
   * ayar okur (ayrı bağlantı).
   */
  async views(
    rows: readonly ProductImageRow[],
    sellerId: string,
  ): Promise<Map<string, ProductImageView[]>> {
    const result = new Map<string, ProductImageView[]>();
    for (const row of rows) {
      const list = result.get(row.productId) ?? [];
      list.push(await this.view(row, sellerId));
      result.set(row.productId, list);
    }
    return result;
  }

  /** Liste kapağı (K10): her ürünün ilk `ready` görselinin 200 px adresi. İşlem dışında. */
  async thumbUrls(
    rows: readonly ProductImageRow[],
    sellerId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const row of rows) {
      if (row.status !== 'ready' || result.has(row.productId)) continue;
      result.set(
        row.productId,
        await this.files.objectReadUrl(
          { bucket: row.bucket, objectKey: renditionKey(row.objectKey, 'thumb') },
          sellerId,
        ),
      );
    }
    return result;
  }

  private async view(row: ProductImageRow, sellerId: string): Promise<ProductImageView> {
    if (row.status !== 'ready') {
      return { id: row.id, sortOrder: row.sortOrder, status: row.status, urls: null };
    }
    const [thumb, medium, large] = await Promise.all(
      PRODUCT_IMAGE_SIZE_NAMES.map((size) =>
        this.files.objectReadUrl(
          { bucket: row.bucket, objectKey: renditionKey(row.objectKey, size) },
          sellerId,
        ),
      ),
    );
    return {
      id: row.id,
      sortOrder: row.sortOrder,
      status: row.status,
      urls: { thumb: thumb ?? '', medium: medium ?? '', large: large ?? '' },
    };
  }

  /** Ürün kilitlenir; yok → 404, arşivde → 409 (K8, F3.3a K1). */
  private async lockEditable(tx: Tx, sellerId: string, productId: string): Promise<ProductRow> {
    const product = await this.products.lockProduct(tx, sellerId, productId);
    if (product === undefined) throw new DomainError('NOT_FOUND');
    if (product.status === 'archived') throw new DomainError('INVALID_STATE_TRANSITION');
    return product;
  }
}
