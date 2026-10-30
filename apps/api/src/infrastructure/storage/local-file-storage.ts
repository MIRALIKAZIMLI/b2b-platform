// Yerel disk dosya deposu (ADR-0023): yalnızca local ve CI (production'da env şeması reddeder).
// Nesne `<dir>/<bucket>/<key>`, içerik türü yanında `<key>.meta.json` dosyasında.
// İmzalı bağlantılar `/api/v1/dev/storage?token=<token>` adresine gider (Fastify yol parametresi
// en fazla 100 karakter; token daha uzun); token = base64url(yük) + "." +
// HMAC-SHA256(yük). Anahtar süreç açılışında rastgele üretilir (yeniden başlatınca eski bağlantılar
// geçersiz olur). Süre `Clock`'tan denetlenir (F1.10-AC3).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Clock } from '../../core/clock';
import { FileStorage, fileBucketOfKey, type UploadUrlInput } from '../../core/ports/file-storage';

export const DEV_STORAGE_PATH = '/api/v1/dev/storage';

const tokenPayloadSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('put'),
    key: z.string().min(1),
    contentType: z.string().min(1),
    size: z.number().int().positive(),
    exp: z.number().int(),
  }),
  z.strictObject({ op: z.literal('get'), key: z.string().min(1), exp: z.number().int() }),
]);
export type LocalStorageToken = z.infer<typeof tokenPayloadSchema>;

const metaSchema = z.strictObject({ contentType: z.string() });

export interface LocalFileStorageOptions {
  /** Depo klasörü (mutlak veya süreç klasörüne göre). */
  readonly directory: string;
  /** Bağlantılardaki API adresi (sonunda `/` yok). */
  readonly baseUrl: string;
  /** Testler için sabit imza anahtarı; verilmezse rastgele. */
  readonly signingKey?: Buffer;
}

export class LocalFileStorage extends FileStorage {
  private readonly signingKey: Buffer;
  private readonly root: string;

  constructor(
    private readonly options: LocalFileStorageOptions,
    private readonly clock: Clock,
  ) {
    super();
    this.signingKey = options.signingKey ?? randomBytes(32);
    this.root = path.resolve(options.directory);
  }

  createUploadUrl(
    input: UploadUrlInput,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    if (fileBucketOfKey(input.key) !== input.bucket) {
      return Promise.reject(new Error('Anahtar ve bucket uyuşmuyor'));
    }
    const token = this.sign({
      op: 'put',
      key: input.key,
      contentType: input.contentType,
      size: input.maxBytes,
      exp: this.expiresAt(input.ttlSeconds),
    });
    return Promise.resolve({
      url: this.urlFor(token),
      headers: { 'Content-Type': input.contentType, 'If-None-Match': '*' },
    });
  }

  createDownloadUrl(input: { key: string; ttlSeconds: number }): Promise<string> {
    try {
      fileBucketOfKey(input.key);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('Geçersiz dosya anahtarı'));
    }
    const token = this.sign({ op: 'get', key: input.key, exp: this.expiresAt(input.ttlSeconds) });
    return Promise.resolve(this.urlFor(token));
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    const file = this.pathOf(key);
    try {
      const info = await stat(file);
      const meta = metaSchema.parse(JSON.parse(await readFile(`${file}.meta.json`, 'utf8')));
      return { size: info.size, contentType: meta.contentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async readRange(key: string, bytes: number): Promise<Buffer> {
    const handle = await open(this.pathOf(key), 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  /**
   * Yalnızca nesne yoksa yazar (R2'deki `If-None-Match: *` karşılığı, Müfettiş PR #28 M1).
   * Nesne zaten varsa `false`, hiçbir şey değişmez.
   */
  async putIfAbsent(key: string, body: Buffer, contentType: string): Promise<boolean> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(file, body, { flag: 'wx' });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false;
      throw error;
    }
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
    return true;
  }

  async delete(key: string): Promise<void> {
    const file = this.pathOf(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }

  /** Dev ucu için: imza ve süre geçerliyse token yükü, değilse `null`. */
  verify(token: string): LocalStorageToken | null {
    const [encoded, signature, extra] = token.split('.');
    if (encoded === undefined || signature === undefined || extra !== undefined) return null;
    const expected = this.mac(encoded);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
    const parsed = tokenPayloadSchema.safeParse(raw);
    if (!parsed.success) return null;
    if (parsed.data.exp <= this.clock.now().getTime()) return null;
    return parsed.data;
  }

  /** Dev ucu için: nesnenin içeriği ve türü; yoksa `null`. */
  async read(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    const info = await this.head(key);
    if (info === null) return null;
    return { body: await readFile(this.pathOf(key)), contentType: info.contentType };
  }

  private sign(payload: LocalStorageToken): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.mac(encoded).toString('base64url')}`;
  }

  private mac(encoded: string): Buffer {
    return createHmac('sha256', this.signingKey).update(encoded).digest();
  }

  private expiresAt(ttlSeconds: number): number {
    return this.clock.now().getTime() + ttlSeconds * 1000;
  }

  private urlFor(token: string): string {
    return `${this.options.baseUrl}${DEV_STORAGE_PATH}?token=${token}`;
  }

  /** Anahtar biçimi denetlenir (`..` veya mutlak yol kabul edilmez). */
  private pathOf(key: string): string {
    const bucket = fileBucketOfKey(key);
    if (!/^[A-Za-z0-9_-]+\/[a-z_]+\/[A-Za-z0-9-]+(\.[a-z0-9]{1,5})?$/.test(key)) {
      throw new Error('Geçersiz dosya anahtarı');
    }
    return path.join(this.root, bucket, ...key.split('/'));
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
