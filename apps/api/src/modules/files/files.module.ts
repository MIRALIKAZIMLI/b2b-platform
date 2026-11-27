import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { SettingsModule } from '../settings';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';

/** Dosya yükleme (F1.10). `FileStorage` global StorageModule'den gelir. */
@Module({
  imports: [AccessModule, SettingsModule],
  controllers: [FilesController],
  providers: [FilesRepository, FilesService],
  exports: [FilesService, FilesRepository],
})
export class FilesModule {}

/**
 * Worker (F3.5a): uç ve erişim kontrolü olmadan dosya servisi (içe aktarma dosyasını okuma, hata
 * raporu yazma). `AccessModule` API'ye özgü bağımlılıklar getirdiği için worker'da yüklenmez.
 */
@Module({
  imports: [SettingsModule],
  providers: [FilesRepository, FilesService],
  exports: [FilesService],
})
export class FilesWorkerModule {}
