// Perakendeci dizini indeksini veritabanından besler (F2.11a, ADR-0011).
// - refresh: olay gelen perakendecinin belgesini D fonksiyonundan yeniden okur; dizinde
//   görünüyorsa yazar, görünmüyorsa (gizli, askıda, pasif, onaysız) indeksten siler.
//   Olay yükündeki bilgiye güvenmez, yalnız kimliği kullanır (idempotent).
// - rebuild: tüm indeksi sayfa sayfa yeni bir indekse yazar ve takas eder (gece işi + komut).
import { Inject, Injectable } from '@nestjs/common';
import { withSystemTx } from '../../core/db';
import { BuyerDirectoryIndex } from '../../core/ports/buyer-directory-index';
import { DirectoryRepository } from './directory.repository';

export interface RebuildResult {
  readonly indexed: number;
}

@Injectable()
export class DirectoryIndexer {
  constructor(
    @Inject(BuyerDirectoryIndex) private readonly index: BuyerDirectoryIndex,
    @Inject(DirectoryRepository) private readonly repository: DirectoryRepository,
  ) {}

  async refresh(businessIds: readonly string[]): Promise<void> {
    const ids = [...new Set(businessIds)];
    if (ids.length === 0) return;
    const rows = await withSystemTx((tx) => this.repository.documentsTx(tx, ids));
    const listed = rows.filter((row) => row.listedInDirectory).map((row) => row.document);
    const keep = new Set(listed.map((document) => document.id));
    await this.index.upsert(listed);
    await this.index.remove(ids.filter((id) => !keep.has(id)));
  }

  async rebuild(batchSize: number): Promise<RebuildResult> {
    let indexed = 0;
    await this.index.rebuild(async (write) => {
      let after: string | null = null;
      for (;;) {
        const cursor: string | null = after;
        const ids: string[] = await withSystemTx((tx) =>
          this.repository.pageTx(tx, cursor, batchSize),
        );
        if (ids.length === 0) break;
        const rows = await withSystemTx((tx) => this.repository.documentsTx(tx, ids));
        const documents = rows.filter((row) => row.listedInDirectory).map((row) => row.document);
        await write(documents);
        indexed += documents.length;
        after = ids[ids.length - 1] ?? null;
        if (ids.length < batchSize) break;
      }
    });
    return { indexed };
  }
}
