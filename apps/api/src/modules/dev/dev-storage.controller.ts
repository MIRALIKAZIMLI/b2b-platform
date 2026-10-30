import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  type OnModuleInit,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Public } from '../../core/auth/access-decorators';
import { DomainError } from '../../core/errors/domain-error';
import { FileStorage } from '../../core/ports/file-storage';
import { LocalFileStorage } from '../../infrastructure/storage';

/** Yüklemede ham gövde olarak okunan türler (NFR-49 + genel ikili). */
const RAW_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];

/** Kullanılan Fastify yöntemleri (fastify doğrudan bağımlılık değil; yapısal tip). */
interface RawBodyHost {
  hasContentTypeParser(type: string): boolean;
  addContentTypeParser(
    type: string,
    options: { parseAs: 'buffer'; bodyLimit: number },
    parser: (request: unknown, body: Buffer, done: (error: null, body: Buffer) => void) => void,
  ): void;
}

interface HeaderReply {
  header(name: string, value: string): unknown;
}

/** Ham gövde üst sınırı: `files.*_max_mb` ayarlarının izin verdiği en büyük değer (50 MB). */
const RAW_BODY_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * Yerel dosya deposunun imzalı yükleme/okuma ucu (ADR-0023). Yalnızca DevModule açıkken ve
 * `STORAGE_PROVIDER=local` iken kayıtlıdır; production'da `local` env şemasınca yasak, DevModule
 * de kayıtlı değildir → yol yok (404). Erişim token'daki HMAC imzası ve süreyle.
 */
@Controller('api/v1/dev/storage')
export class DevStorageController implements OnModuleInit {
  constructor(
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter.getInstance<RawBodyHost>();
    for (const type of RAW_CONTENT_TYPES) {
      if (fastify.hasContentTypeParser(type)) continue;
      fastify.addContentTypeParser(
        type,
        { parseAs: 'buffer', bodyLimit: RAW_BODY_LIMIT_BYTES },
        (_request, body, done) => {
          done(null, body);
        },
      );
    }
  }

  @Public()
  @Put()
  @HttpCode(204)
  async upload(
    @Query('token') token: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    const local = this.local();
    const payload = typeof token === 'string' ? local.verify(token) : null;
    if (payload?.op !== 'put') throw new DomainError('PERMISSION_DENIED');
    if (
      contentType !== payload.contentType ||
      !Buffer.isBuffer(body) ||
      body.length !== payload.size
    ) {
      throw new DomainError('PERMISSION_DENIED');
    }
    // Tek yazım (R2 `If-None-Match: *` karşılığı): nesne varsa üzerine yazılmaz (PR #28 M1).
    if (!(await local.putIfAbsent(payload.key, body, payload.contentType))) {
      throw new DomainError('PERMISSION_DENIED');
    }
  }

  @Public()
  @Get()
  async download(
    @Query('token') token: unknown,
    @Res({ passthrough: true }) reply: HeaderReply,
  ): Promise<Buffer> {
    const local = this.local();
    const payload = typeof token === 'string' ? local.verify(token) : null;
    if (payload?.op !== 'get') throw new DomainError('PERMISSION_DENIED');
    const object = await local.read(payload.key);
    if (object === null) throw new DomainError('NOT_FOUND');
    void reply.header('content-type', object.contentType);
    return object.body;
  }

  private local(): LocalFileStorage {
    if (!(this.storage instanceof LocalFileStorage)) throw new DomainError('NOT_FOUND');
    return this.storage;
  }
}
