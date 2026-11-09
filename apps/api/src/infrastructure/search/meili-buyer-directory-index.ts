// Meilisearch `buyer_directory` indeksi (F2.11a, ADR-0011). Her yazma Meilisearch görevinin
// bitmesini bekler; görev başarısızsa hata fırlatır (iş yeniden denenir).
import { Meilisearch, type Settings, type Task } from 'meilisearch';
import type { Clock } from '../../core/clock';
import {
  type BuyerDirectoryDocument,
  BuyerDirectoryIndex,
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
  sortableAttributes: ['legalName'],
  displayedAttributes: ['*'],
};

export interface MeiliOptions {
  readonly url: string;
  readonly apiKey?: string;
  /** İndeks adı öneki (testlerde rastgele); boşsa yalnız `buyer_directory`. */
  readonly indexPrefix?: string;
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
      .index<BuyerDirectoryDocument>(uid)
      .addDocuments([...documents], { primaryKey: 'id' })
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
