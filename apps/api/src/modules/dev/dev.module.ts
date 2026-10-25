import { Module } from '@nestjs/common';
import { DevSmsOutboxController } from './dev-sms-outbox.controller';

/**
 * Geliştirici uçları (`/api/v1/dev/*`). Yalnızca APP_ENV local / test / staging iken
 * AppModule'e eklenir (isDevModuleEnabled); production'da hiç kaydedilmez (AGENTS.md "Yapma").
 * DevSmsOutboxRepository global SmsModule'den gelir.
 */
@Module({
  controllers: [DevSmsOutboxController],
})
export class DevModule {}
