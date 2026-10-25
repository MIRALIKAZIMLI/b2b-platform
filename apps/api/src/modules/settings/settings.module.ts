import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { SettingsCache } from './settings.cache';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

/**
 * Ayarlar (F1.4a). Redis istemcisi global RedisModule'den (REDIS_CLIENT) gelir; ayar
 * değişikliği AuditService ile aynı işlemde audit'e yazılır (F1.9).
 */
@Module({
  imports: [AuditModule],
  providers: [SettingsRepository, SettingsCache, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
