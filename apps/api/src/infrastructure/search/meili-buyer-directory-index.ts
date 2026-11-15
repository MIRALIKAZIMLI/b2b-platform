// Meilisearch `buyer_directory` indeksi (F2.11a, ADR-0011). Her yazma Meilisearch görevinin
// bitmesini bekler; görev başarısızsa hata fırlatır (iş yeniden denenir).
import { Meilisearch, MeilisearchApiError, type Settings, type Task } from 'meilisearch';
import type { Clock } from '../../core/clock';
import {
  type BuyerDirectoryDocument,
  type BuyerDirectoryHits,
  BuyerDirectoryIndex,
  type BuyerDirectorySearch,
  type BuyerDirectoryWriter,
} from '../../core/ports/buyer-directory-index';

export const BUYER_DIRECTORY_INDEX_UID = 'buyer_directory';

/**
 * Arama ve filtre ayarları. Aranabilir yalnızca ünvan (telefon/VÖEN tam eşleşmesi indeksten
 * değil, D fonksiyonundan yapılır; US-020 AC2 kısmi eşleşme yok). Filtre: şehir/rayon, faaliyet
 * alanı, doğrulanmış (US-019 AC1).
 */
export const BUYER_DIRECTORY_SETTINGS: Settings = {
  searchableAttributes: ['legalName'],
  filterableAttributes: ['regionId', 'cityId', 'activityTypeId', 'verified'],
  // F2.18 (US-015 AC2): doğrulanmış perakendeci üstte. `verifiedRank` (1/0) yalnız indekste.
  // Sorgusuz listede önce rozet, sonra ünvan; aramada metin uygunluğu önce gelir, eşit uygunlukta
  // rozet üstte (varsayılan sıralama kuralları; VARSAYIM, PR'da).
  sortableAttributes: ['verifiedRank', 'legalName'],
  displayedAttributes: ['*'],
};

/** İndekse yazılan belge: port belgesi + sıralama alanı (F2.18). */
type IndexedDocument = BuyerDirectoryDocument & { readonly verifiedRank: 0 | 1 };

function toIndexed(document: BuyerDirectoryDocument): IndexedDocument {
  return { ...document, verifiedRank: document.verified ? 1 : 0 };
}

/** US-015 AC2: doğrulanmışlar üstte; sorgusuz listede sonra ünvan sırası. */
export function buyerDirectorySort(q: string | undefined): string[] {
  return q === undefined ? ['verifiedRank:desc', 'legalName:asc'] : ['verifiedRank:desc'];
}

export interface MeiliOptions {
  readonly url: string;
  readonly apiKey?: string;
  /** İndeks adı öneki (testlerde rastgele); boşsa yalnız `buyer_directory`. */
  readonly indexPrefix?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtre değeri yalnız UUID; tırnaklı yazılır (filtre ifadesine kullanıcı metni girmez). */
function quoted(id: string): string {
  if (!UUID.test(id)) throw new Error('meilisearch filtre değeri UUID değil');
  return `"${id}"`;
}

/** `BuyerDirectorySearch` → Meilisearch filtre ifadeleri (dizi elemanları VE ile bağlanır). */
export function buyerDirectoryFilter(query: BuyerDirectorySearch): string[] {
  const filters = query.regionGroups.map((group) => {
    const list = group.map(quoted).join(', ');
    return `(regionId IN [${list}] OR cityId IN [${list}])`;
  });
  if (query.activityTypeId !== undefined) {
    filters.push(`activityTypeId = ${quoted(query.activityTypeId)}`);
  }
  if (query.verified !== undefined) filters.push(`verified = ${String(query.verified)}`);
  return filters;
}

function assertSucceeded(task: Task, action: string): void {
  if (task.status !== 'succeeded') {
    // Görev hatasının kodu yeterli; belge içeriği loga/hataya girmez.
    throw new Error(`meilisearch ${action} başarısız: ${task.error?.code ?? task.status}`);
  }
}

export class MeiliBuyerDirectoryIndex extends BuyerDirectoryIndex {
  private readonly client: Meilisearch;
  readonly uid: string;
  private settingsApplied = false;

  constructor(
    options: MeiliOptions,
    private readonly clock: Clock,
  ) {
    super();
    this.client = new Meilisearch({
      host: options.url,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    });
    this.uid = `${options.indexPrefix ?? ''}${BUYER_DIRECTORY_INDEX_UID}`;
  }

  async search(query: BuyerDirectorySearch): Promise<BuyerDirectoryHits> {
    if (query.regionGroups.some((group) => group.length === 0)) return { ids: [], hasMore: false };
    try {
      const result = await this.client
        .index<BuyerDirectoryDocument>(this.uid)
        .search(query.q ?? '', {
          filter: buyerDirectoryFilter(query),
          offset: query.offset,
          limit: query.limit + 1,
          attributesToRetrieve: ['id'],
          sort: buyerDirectorySort(query.q),
        });
      const ids = result.hits.map((hit) => hit.id);
      return { ids: ids.slice(0, query.limit), hasMore: ids.length > query.limit };
    } catch (error) {
      // İndeks henüz açılmadıysa (hiç perakendeci yok) boş sonuç.
      if (error instanceof MeilisearchApiError && error.cause?.code === 'index_not_found') {
        return { ids: [], hasMore: false };
      }
      throw error;
    }
  }

  async upsert(documents: readonly BuyerDirectoryDocument[]): Promise<void> {
    if (documents.length === 0) return;
    await this.ensureLiveIndex();
    await this.addTo(this.uid, documents);
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.ensureLiveIndex();
    const task = await this.client
      .index(this.uid)
      .deleteDocuments([...ids])
      .waitTask();
    assertSucceeded(task, 'deleteDocuments');
  }

  async rebuild(fill: (write: BuyerDirectoryWriter) => Promise<void>): Promise<void> {
    await this.ensureLiveIndex();
    const tmp = `${this.uid}__rebuild_${String(this.clock.now().getTime())}`;
    await this.createWithSettings(tmp);
    try {
      await fill((documents) => this.addTo(tmp, documents));
      const swap = await this.client
        .swapIndexes([{ indexes: [this.uid, tmp], rename: false }])
        .waitTask();
      assertSucceeded(swap, 'swapIndexes');
    } finally {
      // Takastan sonra `tmp` eski canlı belgeleri taşır; hata olduysa yarım indekstir. İkisi de silinir.
      const drop = await this.client.deleteIndex(tmp).waitTask();
      assertSucceeded(drop, 'deleteIndex');
    }
  }

  private async addTo(uid: string, documents: readonly BuyerDirectoryDocument[]): Promise<void> {
    if (documents.length === 0) return;
    const task = await this.client
      .index<IndexedDocument>(uid)
      .addDocuments(documents.map(toIndexed), { primaryKey: 'id' })
      .waitTask();
    assertSucceeded(task, 'addDocuments');
  }

  /** Canlı indeks yoksa açılır; ayarlar süreç başına bir kez uygulanır (idempotent). */
  private async ensureLiveIndex(): Promise<void> {
    if (this.settingsApplied) return;
    await this.createWithSettings(this.uid);
    this.settingsApplied = true;
  }

  private async createWithSettings(uid: string): Promise<void> {
    const created = await this.client.createIndex(uid, { primaryKey: 'id' }).waitTask();
    if (created.status !== 'succeeded' && created.error?.code !== 'index_already_exists') {
      assertSucceeded(created, 'createIndex');
    }
    const settings = await this.client
      .index(uid)
      .updateSettings(BUYER_DIRECTORY_SETTINGS)
      .waitTask();
    assertSucceeded(settings, 'updateSettings');
  }
}
