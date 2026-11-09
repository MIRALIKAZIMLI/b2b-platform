// Tam yeniden indeksleme (F2.11a, ADR-0011 §1, §4): ayarlardan sayfa boyu ve kilit süresi;
// aynı anda tek çalışma (Redis kilidi). Gece işi ve `search:reindex` komutu bunu çağırır.
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT, type RedisLockClient, withRedisLock } from '../../infrastructure/redis';
import { SettingsService } from '../settings';
import { DIRECTORY_REINDEX_LOCK_KEY } from './directory-events';
import { DirectoryIndexer } from './directory-indexer';

export type ReindexOutcome =
  | { readonly status: 'done'; readonly indexed: number }
  | {
      readonly status: 'locked';
    };

@Injectable()
export class DirectoryReindexService {
  constructor(
    @Inject(DirectoryIndexer) private readonly indexer: Pick<DirectoryIndexer, 'rebuild'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(REDIS_CLIENT) private readonly redis: RedisLockClient,
  ) {}

  async run(): Promise<ReindexOutcome> {
    const lockSeconds = await this.settings.get('directory.reindex_lock_seconds');
    const batchSize = await this.settings.get('directory.reindex_batch_size');
    const result = await withRedisLock(this.redis, DIRECTORY_REINDEX_LOCK_KEY, lockSeconds, () =>
      this.indexer.rebuild(batchSize),
    );
    return result.acquired
      ? { status: 'done', indexed: result.value.indexed }
      : { status: 'locked' };
  }
}
