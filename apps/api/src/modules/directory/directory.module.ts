import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses';
import { ConnectionsModule } from '../connections';
import { FilesModule } from '../files';
import { SettingsModule } from '../settings';
import { DirectorySearchService } from './directory-search.service';
import { DirectoryController } from './directory.controller';
import { DirectoryRateLimiter } from './directory-rate-limiter';
import { DirectoryIndexer } from './directory-indexer';
import { DirectoryRebuildTracker } from './directory-rebuild-tracker';
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
  providers: [
    DirectoryRepository,
    DirectoryRebuildTracker,
    DirectoryIndexer,
    DirectoryReindexService,
  ],
  exports: [DirectoryIndexer, DirectoryReindexService],
})
export class DirectoryIndexModule {}

/** Worker: `directory` kuyruğu tüketicisi ve gece yeniden indeksleme zamanlayıcısı. */
@Module({
  imports: [DirectoryIndexModule, SettingsModule],
  providers: [DirectoryProcessor, DirectoryReindexSchedule],
})
export class DirectoryWorkerModule {}

/**
 * API: arama ucu (F2.11b). `BuyerDirectoryIndex` global SearchModule'den; ilişki durumu
 * `connections`'tan (F2.12a).
 */
@Module({
  imports: [SettingsModule, BusinessesModule, FilesModule, ConnectionsModule],
  controllers: [DirectoryController],
  providers: [DirectoryRepository, DirectoryRateLimiter, DirectorySearchService],
})
export class DirectoryApiModule {}
