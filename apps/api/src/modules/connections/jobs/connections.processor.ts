// `connections` kuyruğunun tüketicisi (worker, F2.16): zamanlanmış süre dolumu işi.
// Hata fırlatılırsa BullMQ işi yeniden dener; loga kişisel veri yazılmaz (yalnız sayı).
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { InjectPinoLogger } from 'nestjs-pino';
import { EXPIRE_REQUESTS_JOB, ExpireRequestsJob } from './expire-requests.job';

export interface ConnectionsJobLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

@Processor('connections')
export class ConnectionsProcessor extends WorkerHost {
  constructor(
    @Inject(ExpireRequestsJob) private readonly expireRequests: Pick<ExpireRequestsJob, 'run'>,
    @InjectPinoLogger(ConnectionsProcessor.name) private readonly log: ConnectionsJobLog,
  ) {
    super();
  }

  async process(job: Pick<Job, 'name'>): Promise<void> {
    if (job.name === EXPIRE_REQUESTS_JOB) {
      const outcome = await this.expireRequests.run();
      this.log.info({ event: EXPIRE_REQUESTS_JOB, ...outcome }, 'bağlantı isteği süre dolumu');
      return;
    }
    this.log.warn(
      { event: 'connections.unknown_job', jobName: job.name },
      'bilinmeyen iş, atlandı',
    );
  }
}
