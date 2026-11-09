import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { DirectoryIndexer } from './directory-indexer';
import { DirectoryReindexService } from './directory-reindex.service';
import { DirectoryReindexSchedule } from './directory-schedule';
import { DirectoryProcessor } from './directory.processor';
import { DirectoryRepository } from './directory.repository';

/**
 * Yeniden indeksleme (F2.11a): `search:reindex` komutu bunu doğrudan kullanır.
 * `BuyerDirectoryIndex` global SearchModule'den, Redis global RedisModule'den gelir.
 */
@Module({
  imports: [SettingsModule],
  providers: [DirectoryRepository, DirectoryIndexer, DirectoryReindexService],
  exports: [DirectoryIndexer, DirectoryReindexService],
})
export class DirectoryIndexModule {}

/** Worker: `directory` kuyruğu tüketicisi ve gece yeniden indeksleme zamanlayıcısı. */
@Module({
  imports: [DirectoryIndexModule, SettingsModule],
  providers: [DirectoryProcessor, DirectoryReindexSchedule],
})
export class DirectoryWorkerModule {}
