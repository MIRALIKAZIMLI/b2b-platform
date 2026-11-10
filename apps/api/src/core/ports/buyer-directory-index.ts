// Perakendeci dizini arama indeksi portu (F2.11a, ADR-0011). Uygulaması Meilisearch
// (`infrastructure/search`); testler bellek içi sahte uygulama verebilir.
// Belge yalnızca açık alanları taşır (US-007, TM-09); kapalı alan indekse hiç yazılmaz.

/** İndeks belgesinin alanları: sabit izin listesi (US-007 AC6, TM-10). */
export const BUYER_DIRECTORY_DOCUMENT_KEYS = [
  'id',
  'legalName',
  'activityTypeId',
  'regionId',
  'cityId',
  'verified',
  'logoFileId',
  'addressLine',
  'businessPhone',
  'voen',
  'contactName',
] as const;

export interface BuyerDirectoryDocument {
  readonly id: string;
  readonly legalName: string;
  readonly activityTypeId: string;
  readonly regionId: string;
  /** Bölge rayonsa üst şehri, şehirse kendisi (şehir filtresi, US-019 AC1). */
  readonly cityId: string;
  readonly verified: boolean;
  readonly logoFileId: string | null;
  readonly addressLine: string | null;
  readonly businessPhone: string | null;
  readonly voen: string | null;
  readonly contactName: string | null;
}

/** Yeniden indekslemede belgeleri yeni indekse yazan geri çağırma. */
export type BuyerDirectoryWriter = (documents: readonly BuyerDirectoryDocument[]) => Promise<void>;

/**
 * Arama (F2.11b). `regionGroups`: her grup kendi içinde VEYA (belgenin `regionId`'si veya
 * `cityId`'si gruptaki bir kimlik), gruplar arasında VE (ör. kullanıcı filtresi ∩ temsilci
 * bölgeleri). Boş dizi bölge kısıtı yok demektir. `q` yoksa sıra ünvana göredir.
 */
export interface BuyerDirectorySearch {
  readonly q: string | undefined;
  readonly regionGroups: readonly (readonly string[])[];
  readonly activityTypeId: string | undefined;
  readonly verified: boolean | undefined;
  readonly offset: number;
  readonly limit: number;
}

/** Arama sonucu: yalnız kimlikler (alanlar DB'den taze okunur, Mimar K6). */
export interface BuyerDirectoryHits {
  readonly ids: readonly string[];
  readonly hasMore: boolean;
}

export abstract class BuyerDirectoryIndex {
  /** Filtreli arama; indeks henüz yoksa boş sonuç. */
  abstract search(query: BuyerDirectorySearch): Promise<BuyerDirectoryHits>;
  /** Belgeleri ekler veya tümüyle değiştirir (aynı `id`). İşlem bitene kadar bekler. */
  abstract upsert(documents: readonly BuyerDirectoryDocument[]): Promise<void>;
  /** Kimlikleri indeksten siler; olmayan kimlik hata değildir. İşlem bitene kadar bekler. */
  abstract remove(ids: readonly string[]): Promise<void>;
  /**
   * Boş bir geçici indeks açar, `fill` ile doldurur ve canlı indeksle takas eder (kesintisiz).
   * `fill` hata verirse canlı indeks değişmez, geçici indeks silinir.
   */
  abstract rebuild(fill: (write: BuyerDirectoryWriter) => Promise<void>): Promise<void>;
}

/** Belgenin bölgesi her grupta var mı (`regionGroups` anlamı; sahte indeks ve DB süzmesi). */
export function inRegionGroups(
  place: { readonly regionId: string; readonly cityId: string },
  groups: readonly (readonly string[])[],
): boolean {
  return groups.every((group) => group.includes(place.regionId) || group.includes(place.cityId));
}
