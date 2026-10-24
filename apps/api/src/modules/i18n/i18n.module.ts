import { Module } from '@nestjs/common';
import { ERROR_MESSAGE_RESOLVER } from '../../core/errors/error-message.port';
import { SettingsModule } from '../settings';
import { I18nController } from './i18n.controller';
import { I18nRepository } from './i18n.repository';
import { I18nService } from './i18n.service';

/**
 * Diller, çeviriler, para birimleri, ülkeler, bölgeler (F1.3). Hata filtresi mesajları
 * ERROR_MESSAGE_RESOLVER üzerinden bu modülden alır.
 */
@Module({
  imports: [SettingsModule],
  controllers: [I18nController],
  providers: [
    I18nRepository,
    I18nService,
    { provide: ERROR_MESSAGE_RESOLVER, useExisting: I18nService },
  ],
  exports: [I18nService, ERROR_MESSAGE_RESOLVER],
})
export class I18nModule {}
