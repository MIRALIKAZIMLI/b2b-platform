// Ürün görseli sorguları (F3.4a, kart K1–K12). Bütün işlemler çağıranın kiracı işleminde; RLS
// yalnız `seller_id = app.business_id` satırlarını gösterir. Sorgular `seller_id`'yi ayrıca süzer.
import { Injectable } from '@nestjs/common';
import type { ProductImageStatus } from '@b2b/shared';
import { and, asc, count, eq, inArray, max } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import type { FileBucket, FilePurpose } from '../../core/ports/file-storage';
import { type FileStatus, files } from '../files';
import { productImages } from './products.schema';

export interface ProductImageRow {
  readonly id: string;
  readonly productId: string;
  readonly fileId: string;
  readonly sortOrder: number;
  readonly status: ProductImageStatus;
  readonly bucket: FileBucket;
  readonly objectKey: string;
}

export interface ImageFileRow {
  readonly id: string;
  readonly purpose: FilePurpose;
  readonly status: FileStatus;
}

/** Küçültme işinin okuduğu satır (K11). */
export interface ImageJobRow {
  readonly id: string;
  readonly status: ProductImageStatus;
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

const imageColumns = {
  id: productImages.id,
  productId: productImages.productId,
  fileId: productImages.fileId,
  sortOrder: productImages.sortOrder,
  status: productImages.status,
  bucket: files.bucket,
  objectKey: files.objectKey,
};

@Injectable()
export class ProductImagesRepository {
  /** Ürünlerin görselleri, sırayla (kapak = ilk). */
  async imagesOf(
    tx: Tx,
    sellerId: string,
    productIds: readonly string[],
  ): Promise<ProductImageRow[]> {
    if (productIds.length === 0) return [];
    const rows = await tx
      .select(imageColumns)
      .from(productImages)
      .innerJoin(files, eq(files.id, productImages.fileId))
      .where(
        and(
          eq(productImages.sellerId, sellerId),
          inArray(productImages.productId, [...productIds]),
        ),
      )
      .orderBy(asc(productImages.productId), asc(productImages.sortOrder), asc(productImages.id));
    return rows as ProductImageRow[];
  }

  /** Ürünün görsel sayısı ve en büyük sıra (ürün satırı kilitliyken çağrılır, K4). */
  async countAndMaxSort(
    tx: Tx,
    sellerId: string,
    productId: string,
  ): Promise<{ total: number; maxSort: number | null }> {
    const [row] = await tx
      .select({ total: count(), maxSort: max(productImages.sortOrder) })
      .from(productImages)
      .where(and(eq(productImages.sellerId, sellerId), eq(productImages.productId, productId)));
    return { total: row?.total ?? 0, maxSort: row?.maxSort ?? null };
  }

  /** Bağlamdaki işletmenin dosyası (RLS); başka işletmeninki `undefined`. */
  async findFile(tx: Tx, sellerId: string, fileId: string): Promise<ImageFileRow | undefined> {
    const [row] = await tx
      .select({ id: files.id, purpose: files.purpose, status: files.status })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.ownerBusinessId, sellerId)))
      .limit(1);
    return row as ImageFileRow | undefined;
  }

  async isFileInUse(tx: Tx, fileId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.fileId, fileId))
      .limit(1);
    return row !== undefined;
  }

  async insert(
    tx: Tx,
    values: {
      readonly id: string;
      readonly productId: string;
      readonly sellerId: string;
      readonly fileId: string;
      readonly sortOrder: number;
      readonly now: Date;
    },
  ): Promise<void> {
    await tx.insert(productImages).values({
      id: values.id,
      productId: values.productId,
      sellerId: values.sellerId,
      fileId: values.fileId,
      sortOrder: values.sortOrder,
      status: 'processing',
      createdAt: values.now,
      updatedAt: values.now,
    });
  }

  async updateSortOrder(tx: Tx, id: string, sortOrder: number, now: Date): Promise<void> {
    await tx
      .update(productImages)
      .set({ sortOrder, updatedAt: now })
      .where(eq(productImages.id, id));
  }

  /** Silinen satır sayısı (0 → yok). */
  async delete(tx: Tx, sellerId: string, productId: string, imageId: string): Promise<number> {
    const deleted = await tx
      .delete(productImages)
      .where(
        and(
          eq(productImages.id, imageId),
          eq(productImages.productId, productId),
          eq(productImages.sellerId, sellerId),
        ),
      )
      .returning({ id: productImages.id });
    return deleted.length;
  }

  /** İşin okuduğu satır + orijinal dosya bilgisi; silinmişse `undefined`. */
  async findForJob(tx: Tx, sellerId: string, imageId: string): Promise<ImageJobRow | undefined> {
    const [row] = await tx
      .select({
        id: productImages.id,
        status: productImages.status,
        objectKey: files.objectKey,
        contentType: files.contentType,
        sizeBytes: files.sizeBytes,
      })
      .from(productImages)
      .innerJoin(files, eq(files.id, productImages.fileId))
      .where(and(eq(productImages.id, imageId), eq(productImages.sellerId, sellerId)))
      .limit(1);
    return row as ImageJobRow | undefined;
  }

  /** Yalnız `processing` satırı sonuçlandırır (K11; tekrar gelen iş etkisiz). */
  async finish(
    tx: Tx,
    imageId: string,
    status: Exclude<ProductImageStatus, 'processing'>,
    now: Date,
  ): Promise<boolean> {
    const updated = await tx
      .update(productImages)
      .set({ status, updatedAt: now })
      .where(and(eq(productImages.id, imageId), eq(productImages.status, 'processing')))
      .returning({ id: productImages.id });
    return updated.length === 1;
  }
}
