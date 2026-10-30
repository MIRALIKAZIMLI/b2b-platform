// Cloudflare R2 (S3 uyumlu API) dosya deposu (integrations §4, ADR-0023). Staging ve production'da.
// İmza zamanı `Clock`'tan alınır: testte FixedClock ile URL'nin süresi bellidir (F1.10-AC3).
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Clock } from '../../core/clock';
import {
  type FileBucket,
  FileStorage,
  fileBucketOfKey,
  type UploadUrlInput,
} from '../../core/ports/file-storage';

export interface S3FileStorageOptions {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly buckets: Readonly<Record<FileBucket, string>>;
  /** Testler için: hazır istemci (ağsız). */
  readonly client?: S3Client;
}

export function createR2Client(options: S3FileStorageOptions): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata.httpStatusCode === 404)
  );
}

export class S3FileStorage extends FileStorage {
  private readonly client: S3Client;

  constructor(
    private readonly options: S3FileStorageOptions,
    private readonly clock: Clock,
  ) {
    super();
    this.client = options.client ?? createR2Client(options);
  }

  async createUploadUrl(
    input: UploadUrlInput,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    if (fileBucketOfKey(input.key) !== input.bucket) {
      throw new Error('Anahtar ve bucket uyuşmuyor');
    }
    // Boyut imzaya girer: istemci bildirdiğinden farklı boyutta yükleyemez.
    // `If-None-Match: *` imzaya girer: nesne yalnızca bir kez yazılır; doğrulanmış (`ready`) dosyanın
    // üzerine aynı URL ile başka içerik yazılamaz (Müfettiş PR #28 M1; R2 koşullu yazma → 412).
    const command = new PutObjectCommand({
      Bucket: this.options.buckets[input.bucket],
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.maxBytes,
      IfNoneMatch: '*',
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.ttlSeconds,
      signingDate: this.clock.now(),
      signableHeaders: new Set(['content-type', 'content-length', 'if-none-match']),
    });
    return {
      url,
      headers: {
        'Content-Type': input.contentType,
        'Content-Length': String(input.maxBytes),
        'If-None-Match': '*',
      },
    };
  }

  async createDownloadUrl(input: { key: string; ttlSeconds: number }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketOf(input.key),
      Key: input.key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: input.ttlSeconds,
      signingDate: this.clock.now(),
    });
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketOf(key), Key: key }),
      );
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readRange(key: string, bytes: number): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketOf(key),
        Key: key,
        Range: `bytes=0-${String(bytes - 1)}`,
      }),
    );
    if (result.Body === undefined) return Buffer.alloc(0);
    return Buffer.from(await result.Body.transformToByteArray()).subarray(0, bytes);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketOf(key),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketOf(key), Key: key }));
  }

  private bucketOf(key: string): string {
    return this.options.buckets[fileBucketOfKey(key)];
  }
}
