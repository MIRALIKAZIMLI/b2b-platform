// Dosya deposu portu (integrations.md §4, ADR-0008, ADR-0023). Uygulama kodu hangi sağlayıcının
// kullanıldığını bilmez; sağlayıcı `STORAGE_PROVIDER` ile seçilir (infrastructure/storage).
// Anahtar yapısı `<businessId>/<purpose>/<fileId>.<ext>`: anahtar yalnızca `key` alan
// yöntemlerde hangi bucket'ta olduğunu `purpose` bölümünden bilir (fileBucketOfKey).
// Nest sağlayıcısı: `@Inject(FileStorage)` (StorageModule, global).

export type FileBucket = 'public' | 'private';

export const FILE_PURPOSES = [
  'product_image',
  'logo',
  'delivery_photo',
  'dispute_photo',
  'import',
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/** `purpose` → bucket (SF-09: ürün görseli ve logo public; gerisi private). */
export const FILE_PURPOSE_BUCKET: Readonly<Record<FilePurpose, FileBucket>> = {
  product_image: 'public',
  logo: 'public',
  delivery_photo: 'private',
  dispute_photo: 'private',
  import: 'private',
};

function isFilePurpose(value: string): value is FilePurpose {
  return (FILE_PURPOSES as readonly string[]).includes(value);
}

/**
 * Geçici yükleme anahtarlarının bölümü (F1.10b): istemci her zaman `private` bucket'taki
 * `<owner>/upload/<fileId>.<ext>` anahtarına yükler; `complete` doğrulayınca kalıcı anahtara
 * kopyalanır. Reddedilen veya tamamlanmamış dosya hiç `public` bucket'a çıkmaz.
 */
export const UPLOAD_STAGING_SEGMENT = 'upload';

/** Kalıcı anahtarın geçici yükleme karşılığı (`<owner>/<purpose>/<f>` → `<owner>/upload/<f>`). */
export function stagingKeyOf(objectKey: string): string {
  const parts = objectKey.split('/');
  const [owner, purpose, file] = parts;
  if (
    parts.length !== 3 ||
    owner === undefined ||
    file === undefined ||
    purpose === undefined ||
    !isFilePurpose(purpose)
  ) {
    throw new Error('Geçersiz dosya anahtarı');
  }
  return `${owner}/${UPLOAD_STAGING_SEGMENT}/${file}`;
}

/** Anahtarın bucket'ı (`<owner>/<purpose|upload>/<file>`); biçim dışı anahtar → hata. */
export function fileBucketOfKey(key: string): FileBucket {
  const parts = key.split('/');
  const segment = parts[1];
  if (parts.length !== 3 || segment === undefined) throw new Error('Geçersiz dosya anahtarı');
  if (segment === UPLOAD_STAGING_SEGMENT) return 'private';
  if (!isFilePurpose(segment)) throw new Error('Geçersiz dosya anahtarı');
  return FILE_PURPOSE_BUCKET[segment];
}

export interface UploadUrlInput {
  readonly bucket: FileBucket;
  readonly key: string;
  readonly contentType: string;
  readonly maxBytes: number;
  readonly ttlSeconds: number;
}

export abstract class FileStorage {
  /** Süreli imzalı yükleme (PUT) adresi ve istemcinin göndermesi gereken başlıklar. */
  abstract createUploadUrl(
    input: UploadUrlInput,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  /** Süreli imzalı okuma (GET) adresi. */
  abstract createDownloadUrl(input: { key: string; ttlSeconds: number }): Promise<string>;
  /** Nesne yoksa `null`. */
  abstract head(key: string): Promise<{ size: number; contentType: string } | null>;
  /** İlk `bytes` bayt (nesne daha kısaysa tamamı). */
  abstract readRange(key: string, bytes: number): Promise<Buffer>;
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Nesne yoksa sessizce geçer. */
  abstract delete(key: string): Promise<void>;
}
