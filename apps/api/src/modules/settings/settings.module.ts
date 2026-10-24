import { Module } from '@nestjs/common';
import { SettingsCache } from './settings.cache';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

/** Ayarlar (F1.4a). Redis istemcisi global RedisModule'den (REDIS_CLIENT) gelir. */
@Module({
  providers: [SettingsRepository, SettingsCache, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
