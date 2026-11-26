// Önizleme süre dolumu (F3.5a; SF-08 "Önizleme 24 saat onaylanmaz → iş ve dosya silinir").
// Worker'da `imports` kuyruğunda `imports.expire_interval_minutes` aralıkla. Aynı anda tek kopya
// (Redis kilidi, `ScheduledJobRunner`); satırlar FOR UPDATE SKIP LOCKED ile alındığından kilit düşse
// bile her iş bir kez silinir. Satırlar DEFINER fonksiyonuyla bağlamsız sistem işleminde silinir;
// depo nesneleri işlem bittikten sonra silinir (silinemeyen nesne yalnız artık bırakır, F2.16b).
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Clock } from '../../../core/clock';
import { withSystemTx } from '../../../core/db';
import { ScheduledJobRunner, type ScheduledJobOutcome } from '../../../core/ops-metrics';
import { FileStorage } from '../../../core/ports/file-storage';
import { QUEUE_MAP } from '../../../infrastructure/queue';
import { SettingsService } from '../../settings';
import { ImportsRepository } from '../imports.repository';

/** BullMQ iş adı ve zamanlayıcı kimliği; aynı zamanda kilit ve `ops_metrics` adı. */
export const EXPIRE_IMPORTS_JOB = 'imports.expire_previews';

export interface ExpireImportsLog {
  warn(obj: Record<string, unknown>, msg: string): void;
}

@Injectable()
export class ExpireImportsJob {
  constructor(
    @Inject(ImportsRepository) private readonly repository: Pick<ImportsRepository, 'expireTx'>,
    @Inject(FileStorage) private readonly storage: Pick<FileStorage, 'delete'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ScheduledJobRunner) private readonly runner: Pick<ScheduledJobRunner, 'run'>,
  ) {}

  /** Süresi dolmuş `preview_ready` işleri siler; silinen iş sayısı. */
  async run(log: ExpireImportsLog): Promise<ScheduledJobOutcome> {
    const ttlHours = await this.settings.get('imports.preview_ttl_hours');
    const batchSize = await this.settings.get('imports.expire_batch_size');
    const lockSeconds = await this.settings.get('imports.expire_lock_seconds');
    return await this.runner.run(EXPIRE_IMPORTS_JOB, lockSeconds, async () => {
      const cutoff = new Date(this.clock.now().getTime() - ttlHours * 3_600_000);
      let total = 0;
      for (;;) {
        const removed = await withSystemTx((tx) => this.repository.expireTx(tx, cutoff, batchSize));
        const jobs = new Set(removed.map((row) => row.jobId));
        total += jobs.size;
        for (const row of removed) {
          if (row.objectKey === null) continue;
          try {
            await this.storage.delete(row.objectKey);
          } catch (error) {
            // Anahtar loglanmaz (işletme kimliği taşır); yalnız iş kimliği ve hata adı.
            log.warn(
              {
                event: 'imports.object_delete_failed',
                jobId: row.jobId,
                error: error instanceof Error ? error.name : 'unknown',
              },
              'içe aktarma dosyası depodan silinemedi',
            );
          }
        }
        if (jobs.size < batchSize) return total;
      }
    });
  }
}

export type ExpireImportsQueue = Pick<Queue, 'upsertJobScheduler'>;

@Injectable()
export class ExpireImportsSchedule implements OnApplicationBootstrap {
  constructor(
    @Inject(QUEUE_MAP) private readonly queues: Readonly<Record<string, ExpireImportsQueue>>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const queue = this.queues.imports;
    if (queue === undefined) throw new Error('imports kuyruğu kayıtlı değil');
    const minutes = await this.settings.get('imports.expire_interval_minutes');
    await queue.upsertJobScheduler(
      EXPIRE_IMPORTS_JOB,
      { every: minutes * 60_000 },
      { name: EXPIRE_IMPORTS_JOB, data: {} },
    );
  }
}
