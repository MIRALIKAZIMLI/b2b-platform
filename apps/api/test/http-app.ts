// Birim testleri için HTTP uygulaması: AppModule + isteğe bağlı test controller'ları.
// Veritabanına bağlanmaz. Log çıktısı istenirse bellekte toplanır (LogCapture).
import 'reflect-metadata';
import { Writable } from 'node:stream';
import type { Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { ServerEnv } from '@b2b/shared';
import { AppModule } from '../src/app.module';
import { createFastifyAdapter } from '../src/core/request-id.middleware';
import { TEST_SERVER_ENV } from './env';

/** Log satırlarını bellekte toplayan akış. */
export class LogCapture extends Writable {
  readonly chunks: string[] = [];

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.chunks.push(chunk.toString('utf8'));
    done();
  }

  text(): string {
    return this.chunks.join('');
  }

  lines(): Record<string, unknown>[] {
    return this.text()
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

export interface TestAppOptions {
  readonly controllers?: Type[];
  readonly env?: Partial<ServerEnv>;
  readonly logStream?: LogCapture;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  const env: ServerEnv = { ...TEST_SERVER_ENV, ...options.env };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env, options.logStream ? { logStream: options.logStream } : {})],
    controllers: options.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
