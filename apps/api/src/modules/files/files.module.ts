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
  exports: [FilesService],
})
export class FilesModule {}
