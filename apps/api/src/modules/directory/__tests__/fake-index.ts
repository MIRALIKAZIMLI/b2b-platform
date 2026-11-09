// Bellek içi `BuyerDirectoryIndex` (yalnız test). Meilisearch davranışı ayrıca
// meili-buyer-directory-index.int.test.ts ile gerçek sunucuda sınanır.
import {
  type BuyerDirectoryDocument,
  BuyerDirectoryIndex,
  type BuyerDirectoryWriter,
} from '../../../core/ports/buyer-directory-index';

export class FakeBuyerDirectoryIndex extends BuyerDirectoryIndex {
  readonly docs = new Map<string, BuyerDirectoryDocument>();
  upserts = 0;
  /** Doldurma bitti, takas olmadı: bu arada canlı indekse yazılanlar takasla kaybolur. */
  beforeSwap: (() => Promise<void>) | undefined;

  upsert(documents: readonly BuyerDirectoryDocument[]): Promise<void> {
    for (const document of documents) this.docs.set(document.id, document);
    if (documents.length > 0) this.upserts += 1;
    return Promise.resolve();
  }

  remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.docs.delete(id);
    return Promise.resolve();
  }

  async rebuild(fill: (write: BuyerDirectoryWriter) => Promise<void>): Promise<void> {
    const next = new Map<string, BuyerDirectoryDocument>();
    await fill((documents) => {
      for (const document of documents) next.set(document.id, document);
      return Promise.resolve();
    });
    await this.beforeSwap?.();
    this.docs.clear();
    for (const [id, document] of next) this.docs.set(id, document);
  }
}
