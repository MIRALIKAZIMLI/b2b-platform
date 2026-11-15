import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { OpsMetricsModule } from '../../core/ops-metrics';
import { OutboxModule } from '../../core/outbox';
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
import { DormantAccountsJob, DormantAccountsSchedule } from './jobs/dormant-accounts.job';
import { DormantRepository } from './jobs/dormant.repository';

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

/**
 * Worker: `directory` kuyruğu tüketicisi, gece yeniden indeksleme zamanlayıcısı ve bağlantısız
 * hesap gece işi (F2.17).
 */
@Module({
  imports: [DirectoryIndexModule, SettingsModule, AuditModule, OutboxModule, OpsMetricsModule],
  providers: [
    DirectoryProcessor,
    DirectoryReindexSchedule,
    DormantRepository,
    DormantAccountsJob,
    DormantAccountsSchedule,
  ],
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
