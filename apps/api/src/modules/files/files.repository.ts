// `files` tablosu erişimi (F1.10, drizzle/0012_files.sql). Her işlem kiracı bağlamında
// (withTenantTx): RLS başka işletmenin dosyasını gizler → bulunamaz (404).
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { type TenantTxContext, withTenantTx } from '../../core/db';
import type { FileBucket, FilePurpose } from '../../core/ports/file-storage';
import { files, type FileStatus } from './files.schema';

export interface FileRow {
  readonly id: string;
  readonly ownerBusinessId: string | null;
  readonly purpose: FilePurpose;
  readonly bucket: FileBucket;
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly status: FileStatus;
}

export interface NewFile {
  readonly id: string;
  readonly purpose: FilePurpose;
  readonly bucket: FileBucket;
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly now: Date;
}

const columns = {
  id: files.id,
  ownerBusinessId: files.ownerBusinessId,
  purpose: files.purpose,
  bucket: files.bucket,
  objectKey: files.objectKey,
  contentType: files.contentType,
  sizeBytes: files.sizeBytes,
  status: files.status,
};

@Injectable()
export class FilesRepository {
  /** Yeni `pending` satır; sahip ve oluşturan bağlamdan (istemciden değil). */
  async insertPending(ctx: TenantTxContext & { userId: string }, file: NewFile): Promise<void> {
    await withTenantTx(ctx, async (tx) => {
      await tx.insert(files).values({
        id: file.id,
        ownerBusinessId: ctx.businessId,
        purpose: file.purpose,
        bucket: file.bucket,
        objectKey: file.objectKey,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        status: 'pending',
        createdBy: ctx.userId,
        createdAt: file.now,
        updatedAt: file.now,
      });
    });
  }

  async findById(ctx: TenantTxContext, id: string): Promise<FileRow | undefined> {
    return await withTenantTx(ctx, async (tx) => {
      const [row] = await tx.select(columns).from(files).where(eq(files.id, id)).limit(1);
      return row as FileRow | undefined;
    });
  }

  /**
   * `pending` satırı sonuçlandırır. Satır artık `pending` değilse (eşzamanlı complete) `false`.
   */
  async finish(
    ctx: TenantTxContext,
    id: string,
    result: { status: 'ready'; contentType: string; sizeBytes: number } | { status: 'rejected' },
    now: Date,
  ): Promise<boolean> {
    return await withTenantTx(ctx, async (tx) => {
      const updated = await tx
        .update(files)
        .set({ ...result, updatedAt: now })
        .where(and(eq(files.id, id), eq(files.status, 'pending')))
        .returning({ id: files.id });
      return updated.length === 1;
    });
  }
}
