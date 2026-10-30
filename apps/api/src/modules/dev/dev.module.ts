import { type DynamicModule, Module } from '@nestjs/common';
import type { StorageProvider } from '@b2b/shared';
import { DevSmsOutboxController } from './dev-sms-outbox.controller';
import { DevStorageController } from './dev-storage.controller';

export interface DevModuleOptions {
  readonly storageProvider: StorageProvider;
}

/**
 * Geliştirici uçları (`/api/v1/dev/*`). Yalnızca APP_ENV local / test / staging iken
 * AppModule'e eklenir (isDevModuleEnabled); production'da hiç kaydedilmez (AGENTS.md "Yapma").
 * DevSmsOutboxRepository global SmsModule'den gelir. `/dev/storage` yalnızca yerel depoda
 * (`STORAGE_PROVIDER=local`, ADR-0023); staging R2 kullandığı için orada da yoktur.
 */
@Module({})
export class DevModule {
  static register(options: DevModuleOptions): DynamicModule {
    return {
      module: DevModule,
      controllers: [
        DevSmsOutboxController,
        ...(options.storageProvider === 'local' ? [DevStorageController] : []),
      ],
    };
  }
}
