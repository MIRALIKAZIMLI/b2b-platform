// Dosya deposu sağlayıcı seçimi (integrations §4, ADR-0023): `STORAGE_PROVIDER` (api ve worker;
// worker görsel küçültmede yalnız okur/yazar, imzalı bağlantı üretmez, F3.4a).
// Production'da `local` ile api açılmaz (env şeması, F1.10-AC5).
import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { WorkerEnv } from '@b2b/shared';
import { Clock } from '../../core/clock';
import { FileStorage } from '../../core/ports/file-storage';
import { LocalFileStorage } from './local-file-storage';
import { S3FileStorage } from './s3-file-storage';

/** Public dosyanın okuma adresi kökü; `null` → yerel depo (imzalı okuma bağlantısı kullanılır). */
export const FILES_PUBLIC_BASE_URL = Symbol('FILES_PUBLIC_BASE_URL');

type StorageEnv = Pick<
  WorkerEnv,
  | 'PORT'
  | 'STORAGE_PROVIDER'
  | 'R2_ACCOUNT_ID'
  | 'R2_ACCESS_KEY_ID'
  | 'R2_SECRET_ACCESS_KEY'
  | 'R2_BUCKET_PUBLIC'
  | 'R2_BUCKET_PRIVATE'
  | 'FILES_PUBLIC_BASE_URL'
  | 'STORAGE_LOCAL_DIR'
> & { readonly STORAGE_LOCAL_BASE_URL?: string | undefined };

function required(value: string | undefined, name: string): string {
  // env şeması r2 için bunları zaten zorunlu kılar; burası tip daraltması.
  if (value === undefined) throw new Error(`${name} eksik`);
  return value;
}

export function createFileStorage(env: StorageEnv, clock: Clock): FileStorage {
  switch (env.STORAGE_PROVIDER) {
    case 'r2':
      return new S3FileStorage(
        {
          accountId: required(env.R2_ACCOUNT_ID, 'R2_ACCOUNT_ID'),
          accessKeyId: required(env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID'),
          secretAccessKey: required(env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY'),
          buckets: {
            public: required(env.R2_BUCKET_PUBLIC, 'R2_BUCKET_PUBLIC'),
            private: required(env.R2_BUCKET_PRIVATE, 'R2_BUCKET_PRIVATE'),
          },
        },
        clock,
      );
    case 'local':
      return new LocalFileStorage(
        {
          directory: env.STORAGE_LOCAL_DIR,
          baseUrl: (env.STORAGE_LOCAL_BASE_URL ?? `http://localhost:${String(env.PORT)}`).replace(
            /\/$/,
            '',
          ),
        },
        clock,
      );
  }
}

@Global()
@Module({})
export class StorageModule {
  static forRoot(env: StorageEnv): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        {
          provide: FileStorage,
          useFactory: (clock: Clock) => createFileStorage(env, clock),
          inject: [Clock],
        },
        {
          provide: FILES_PUBLIC_BASE_URL,
          useValue:
            env.STORAGE_PROVIDER === 'r2'
              ? required(env.FILES_PUBLIC_BASE_URL, 'FILES_PUBLIC_BASE_URL').replace(/\/$/, '')
              : null,
        },
      ],
      exports: [FileStorage, FILES_PUBLIC_BASE_URL],
    };
  }
}
