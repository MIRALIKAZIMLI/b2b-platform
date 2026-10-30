// Dosya yükleme (SF-09, NFR-49, F1.10). İstemci dosyayı API'den aldığı süreli imzalı URL ile
// doğrudan depoya yükler; `complete` boyutu ve dosya imzasını (ilk 16 bayt) doğrular.
// `private` dosya yalnızca süreli imzalı URL ile okunur (getReadUrl; uç noktası yok, sonraki fazlar
// çağırır). Süre ve boyut sınırları SettingsService'ten (AGENTS kural 6).
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PermissionCode } from '@b2b/shared';
import { Clock } from '../../core/clock';
import type { TenantTxContext } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import {
  FILE_PURPOSE_BUCKET,
  type FilePurpose,
  FileStorage,
  stagingKeyOf,
} from '../../core/ports/file-storage';
import type { TenantContext } from '../../core/tenant-context';
import { FILES_PUBLIC_BASE_URL } from '../../infrastructure/storage';
import { assertAllowed } from '../access';
import { SettingsService } from '../settings';
import {
  type AllowedContentType,
  CONTENT_TYPE_EXTENSION,
  detectContentType,
  IMAGE_CONTENT_TYPES,
  SIGNATURE_BYTES,
  XLSX_CONTENT_TYPE,
} from './file-signature';
import { type FileRow, FilesRepository } from './files.repository';

/**
 * `purpose` → izin (c4-component §5'teki kodlar; Mimar onayı F1.10 S1). Birden çok kod: biri yeter.
 */
export const FILE_PURPOSE_PERMISSIONS: Readonly<
  Record<FilePurpose, readonly [PermissionCode, ...PermissionCode[]]>
> = {
  product_image: ['catalog.manage'],
  logo: ['business.manage'],
  delivery_photo: ['delivery.update_own'],
  dispute_photo: ['orders.confirm_delivery', 'orders.resolve_dispute'],
  import: ['imports.run'],
};

/** `purpose` → kabul edilen türler (NFR-49: görsel JPEG/PNG/WebP, içe aktarma .xlsx). */
const PURPOSE_CONTENT_TYPES: Readonly<Record<FilePurpose, readonly AllowedContentType[]>> = {
  product_image: IMAGE_CONTENT_TYPES,
  logo: IMAGE_CONTENT_TYPES,
  delivery_photo: IMAGE_CONTENT_TYPES,
  dispute_photo: IMAGE_CONTENT_TYPES,
  import: [XLSX_CONTENT_TYPE],
};

const BYTES_PER_MB = 1024 * 1024;

export interface UploadUrlRequest {
  readonly purpose: FilePurpose;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface UploadUrlResult {
  readonly fileId: string;
  readonly uploadUrl: string;
  readonly method: 'PUT';
  readonly headers: Record<string, string>;
  readonly expiresAt: string;
}

export interface CompletedFile {
  readonly fileId: string;
  readonly status: 'ready';
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly url?: string;
}

/** `purpose` için izinlerden biri yoksa hata (ilk kodun hatası: yetenek veya izin). */
export function assertPurposeAllowed(tenant: TenantContext, purpose: FilePurpose): void {
  const [first, ...rest] = FILE_PURPOSE_PERMISSIONS[purpose];
  for (const code of rest) {
    try {
      assertAllowed(tenant, code);
      return;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  assertAllowed(tenant, first);
}

function isAllowedType(
  purpose: FilePurpose,
  contentType: string,
): contentType is AllowedContentType {
  return (PURPOSE_CONTENT_TYPES[purpose] as readonly string[]).includes(contentType);
}

/** Okunan içeriğin boyutu ve ilk 16 bayt imzası (aynı buffer kalıcı anahtara yazılır). */
function validateContent(file: FileRow, body: Buffer): string | null {
  if (body.length !== file.sizeBytes) return 'size';
  if (detectContentType(body.subarray(0, SIGNATURE_BYTES)) !== file.contentType) return 'signature';
  return null;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(FilesRepository) private readonly repository: FilesRepository,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(FILES_PUBLIC_BASE_URL) private readonly publicBaseUrl: string | null,
  ) {}

  /** SF-09 adım 1: tür, boyut ve izin denetimi; satır `pending`; 10 dk'lık yükleme URL'si. */
  async createUploadUrl(tenant: TenantContext, input: UploadUrlRequest): Promise<UploadUrlResult> {
    assertPurposeAllowed(tenant, input.purpose);
    if (!isAllowedType(input.purpose, input.contentType)) {
      throw new DomainError('FILE_INVALID', { reason: 'content_type' });
    }
    const maxBytes = await this.maxBytes(input.contentType, tenant.businessId);
    if (input.sizeBytes > maxBytes) {
      throw new DomainError('FILE_INVALID', { reason: 'size', maxBytes });
    }

    const fileId = this.ids.next();
    const bucket = FILE_PURPOSE_BUCKET[input.purpose];
    const key = `${tenant.businessId}/${input.purpose}/${fileId}.${CONTENT_TYPE_EXTENSION[input.contentType]}`;
    const ttlMinutes = await this.settings.get('files.upload_url_ttl_minutes', tenant.businessId);
    const now = this.clock.now();

    await this.repository.insertPending(tenant, {
      id: fileId,
      purpose: input.purpose,
      bucket,
      objectKey: key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      now,
    });
    // İstemci private bucket'taki geçici anahtara yükler (F1.10b); kalıcı anahtara (public
    // olabilir) yalnızca complete doğrulayınca kopyalanır. Boyut imzaya girer.
    const upload = await this.storage.createUploadUrl({
      bucket: 'private',
      key: stagingKeyOf(key),
      contentType: input.contentType,
      maxBytes: input.sizeBytes,
      ttlSeconds: ttlMinutes * 60,
    });
    return {
      fileId,
      uploadUrl: upload.url,
      method: 'PUT',
      headers: upload.headers,
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
    };
  }

  /**
   * SF-09 adım 2: geçici anahtarda `head` + ilk 16 bayt imza. Geçersiz → geçici nesne silinir,
   * satır `rejected`, `FILE_INVALID`. Geçerli → kalıcı anahtara kopyalanır, satır `ready`, geçici
   * silinir (F1.10b). Başka işletmenin dosyası RLS ile görünmez → `NOT_FOUND`.
   */
  async complete(tenant: TenantContext, fileId: string): Promise<CompletedFile> {
    const file = await this.repository.findById(tenant, fileId);
    if (file === undefined) throw new DomainError('NOT_FOUND');
    assertPurposeAllowed(tenant, file.purpose);

    if (file.status === 'ready') return await this.completedView(tenant, file);
    if (file.status === 'rejected') throw new DomainError('FILE_INVALID', { reason: 'rejected' });

    const stagingKey = stagingKeyOf(file.objectKey);
    const object = await this.storage.head(stagingKey);
    // Henüz yüklenmemiş: satır pending kalır, yükleme URL'si süresi içinde tekrar denenebilir.
    if (object === null) throw new DomainError('FILE_INVALID', { reason: 'not_uploaded' });

    // Tek okuma (Müfettiş PR #29 H1): doğrulanan baytlar ile kalıcı anahtara yazılan baytlar aynı
    // buffer. Boyut sınırı önce `head` ile (sınırı aşan dosya belleğe alınmaz); bildirilen boyuttan
    // uzun içerik yakalansın diye bir bayt fazla okunur.
    let reason = await this.validateSize(file, object.size, tenant.businessId);
    let body: Buffer | null = null;
    if (reason === null) {
      body = await this.storage.readRange(stagingKey, file.sizeBytes + 1);
      reason = validateContent(file, body);
    }
    if (reason !== null || body === null) {
      await this.storage.delete(stagingKey);
      await this.repository.finish(tenant, file.id, { status: 'rejected' }, this.clock.now());
      throw new DomainError('FILE_INVALID', { reason: reason ?? 'size' });
    }

    // Kalıcı anahtara yalnızca sunucu ve yalnızca bir kez yazar: eşzamanlı başka bir complete
    // zaten kopyaladıysa (o da doğrulanmış baytlar) üzerine yazılmaz.
    await this.storage.putIfAbsent(file.objectKey, body, file.contentType);

    const finished = await this.repository.finish(
      tenant,
      file.id,
      { status: 'ready', contentType: file.contentType, sizeBytes: object.size },
      this.clock.now(),
    );
    if (!finished) {
      // Eşzamanlı başka bir complete sonuçlandırdı: güncel durumu dön.
      return await this.complete(tenant, fileId);
    }
    // Satır ready: geçici nesnenin silinememesi yalnızca private'ta artık bırakır; yanıt yine ready
    // (Müfettiş PR #29 M1). Anahtar loglanmaz, yalnız dosya kimliği.
    try {
      await this.storage.delete(stagingKey);
    } catch (error) {
      this.logger.warn(
        `files.staging_delete_failed fileId=${file.id} (${error instanceof Error ? error.name : 'unknown'})`,
      );
    }
    return await this.completedView(tenant, { ...file, status: 'ready', sizeBytes: object.size });
  }

  /**
   * Okuma adresi (uç noktası yok; teslim fotoğrafı vb. sonraki fazlarda çağırır).
   * public → CDN adresi; private → `files.download_url_ttl_minutes` süreli imzalı URL.
   * Yalnızca `ready` dosya; başka işletmenin dosyası → `NOT_FOUND`.
   */
  async getReadUrl(ctx: TenantTxContext, fileId: string): Promise<string> {
    const file = await this.repository.findById(ctx, fileId);
    if (file?.status !== 'ready') throw new DomainError('NOT_FOUND');
    return await this.readUrl(file, ctx.businessId);
  }

  private async completedView(tenant: TenantContext, file: FileRow): Promise<CompletedFile> {
    return {
      fileId: file.id,
      status: 'ready',
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      ...(file.bucket === 'public' ? { url: await this.readUrl(file, tenant.businessId) } : {}),
    };
  }

  private async readUrl(file: FileRow, businessId: string): Promise<string> {
    if (file.bucket === 'public' && this.publicBaseUrl !== null) {
      return `${this.publicBaseUrl}/${file.objectKey}`;
    }
    // private veya yerel depo (CDN yok): süreli imzalı okuma.
    const ttlMinutes = await this.settings.get('files.download_url_ttl_minutes', businessId);
    return await this.storage.createDownloadUrl({
      key: file.objectKey,
      ttlSeconds: ttlMinutes * 60,
    });
  }

  /** Boyut sınırı (head'den); geçersizlik nedeni veya `null`. */
  private async validateSize(
    file: FileRow,
    size: number,
    businessId: string,
  ): Promise<string | null> {
    if (size <= 0 || size !== file.sizeBytes) return 'size';
    if (!isAllowedType(file.purpose, file.contentType)) return 'content_type';
    if (size > (await this.maxBytes(file.contentType, businessId))) return 'size';
    return null;
  }

  private async maxBytes(contentType: AllowedContentType, businessId: string): Promise<number> {
    const key = contentType === XLSX_CONTENT_TYPE ? 'files.xlsx_max_mb' : 'files.image_max_mb';
    return (await this.settings.get(key, businessId)) * BYTES_PER_MB;
  }
}
