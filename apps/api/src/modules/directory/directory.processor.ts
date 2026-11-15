// `directory` kuyruğunun tüketicisi (worker, F2.11a).
// - Outbox olayları (`buyer.registered`, `buyer.privacy_changed`, `buyer.profile_changed`):
//   perakendecinin indeks belgesi yenilenir veya silinir.
// - `directory.reindex`: gece tam yeniden indeksleme (kilitliyse atlanır).
// - `directory.dormant_accounts`: bağlantısız hesap gece işi (F2.17, US-027).
// Hata fırlatılırsa BullMQ işi yeniden dener; loga kişisel veri yazılmaz (yalnız kimlik).
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { InjectPinoLogger } from 'nestjs-pino';
import {
  DIRECTORY_EVENT_TYPES,
  DIRECTORY_REINDEX_JOB,
  directoryOutboxJobSchema,
} from './directory-events';
import { DirectoryIndexer } from './directory-indexer';
import { DirectoryReindexService } from './directory-reindex.service';
import { DORMANT_ACCOUNTS_JOB, DormantAccountsJob } from './jobs/dormant-accounts.job';

export interface DirectoryLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

@Processor('directory')
export class DirectoryProcessor extends WorkerHost {
  constructor(
    @Inject(DirectoryIndexer) private readonly indexer: Pick<DirectoryIndexer, 'refresh'>,
    @Inject(DirectoryReindexService)
    private readonly reindex: Pick<DirectoryReindexService, 'run'>,
    @Inject(DormantAccountsJob) private readonly dormant: Pick<DormantAccountsJob, 'run'>,
    @InjectPinoLogger(DirectoryProcessor.name) private readonly log: DirectoryLog,
  ) {
    super();
  }

  async process(job: Pick<Job, 'name' | 'data'>): Promise<void> {
    if (job.name === DIRECTORY_REINDEX_JOB) {
      const outcome = await this.reindex.run();
      this.log.info({ event: 'directory.reindex', ...outcome }, 'dizin yeniden indeksleme');
      return;
    }
    if (job.name === DORMANT_ACCOUNTS_JOB) {
      const outcome = await this.dormant.run();
      this.log.info({ event: DORMANT_ACCOUNTS_JOB, ...outcome }, 'bağlantısız hesap gece işi');
      return;
    }
    if (DIRECTORY_EVENT_TYPES.includes(job.name)) {
      const event = directoryOutboxJobSchema.parse(job.data);
      await this.indexer.refresh([event.payload.businessId]);
      return;
    }
    this.log.warn({ event: 'directory.unknown_job', jobName: job.name }, 'bilinmeyen iş, atlandı');
  }
}
