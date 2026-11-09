// Gece tam yeniden indeksleme zamanlayıcısı (F2.11a, ADR-0011 §1, §4). Worker açılışında
// `directory.reindex_hour_utc` ayarıyla BullMQ zamanlayıcısı kurulur veya güncellenir; aynı
// kimlikle kurulduğu için birden çok worker tek zamanlayıcı paylaşır. Ayar değişikliği bir
// sonraki worker açılışında geçerli olur.
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUE_MAP } from '../../infrastructure/queue';
import { SettingsService } from '../settings';
import { DIRECTORY_REINDEX_JOB } from './directory-events';

export type DirectoryScheduleQueue = Pick<Queue, 'upsertJobScheduler'>;

/** Her gün `hour`:00 UTC. */
export function reindexCronPattern(hour: number): string {
  return `0 ${String(hour)} * * *`;
}

@Injectable()
export class DirectoryReindexSchedule implements OnApplicationBootstrap {
  constructor(
    @Inject(QUEUE_MAP) private readonly queues: Readonly<Record<string, DirectoryScheduleQueue>>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const queue = this.queues.directory;
    if (queue === undefined) throw new Error('directory kuyruğu kayıtlı değil');
    const hour = await this.settings.get('directory.reindex_hour_utc');
    await queue.upsertJobScheduler(
      DIRECTORY_REINDEX_JOB,
      { pattern: reindexCronPattern(hour), tz: 'UTC' },
      { name: DIRECTORY_REINDEX_JOB, data: {} },
    );
  }
}
