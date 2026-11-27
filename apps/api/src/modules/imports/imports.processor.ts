// `imports` kuyruğunun tüketicisi (worker, F3.5a): doğrulama (`import.uploaded` outbox olayı),
// uygulama (F3.5c, `import.apply_requested`) ve zamanlanmış süre dolumu / zaman aşımı. İş verisi outbox zarfıdır: yükte yalnız kimlik, kiracı
// `businessIds[0]` (satıcı). Loga dosya içeriği ve kişisel veri yazılmaz (yalnız kimlik ve sayı).
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';
import { InjectPinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { SettingsService } from '../settings';
import { APPLY_IMPORT_EVENT, ApplyImportJob } from './jobs/apply-import.job';
import { EXPIRE_IMPORTS_JOB, ExpireImportsJob } from './jobs/expire-imports.job';
import { VALIDATE_IMPORT_EVENT, ValidateImportJob } from './jobs/validate-import.job';

/**
 * Dekoratördeki başlangıç eşzamanlılığı: .xlsx açma belleği tek işle sınırlı (R32). Gerçek değer
 * açılışta `imports.worker_concurrency` ayarından okunur (F3.5c K13, Müfettiş 29 not 4).
 */
export const IMPORTS_WORKER_CONCURRENCY = 1;

export interface ImportsJobLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

const jobEnvelopeSchema = z.object({
  businessIds: z.tuple([z.uuid()]),
  payload: z.object({ jobId: z.uuid() }),
});

@Processor('imports', { concurrency: IMPORTS_WORKER_CONCURRENCY })
export class ImportsProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    @Inject(ValidateImportJob) private readonly validate: Pick<ValidateImportJob, 'run'>,
    @Inject(ApplyImportJob) private readonly applyJob: Pick<ApplyImportJob, 'run'>,
    @Inject(ExpireImportsJob) private readonly expire: Pick<ExpireImportsJob, 'run'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @InjectPinoLogger(ImportsProcessor.name) private readonly log: ImportsJobLog,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    this.worker.concurrency = await this.settings.get('imports.worker_concurrency');
  }

  async process(job: Pick<Job, 'name' | 'data'>): Promise<void> {
    if (job.name === APPLY_IMPORT_EVENT) {
      const data = jobEnvelopeSchema.parse(job.data);
      const outcome = await this.applyJob.run(
        { businessId: data.businessIds[0], jobId: data.payload.jobId },
        this.log,
      );
      this.log.info(
        { event: 'imports.applied', jobId: data.payload.jobId, outcome },
        'içe aktarma uygulandı',
      );
      return;
    }
    if (job.name === VALIDATE_IMPORT_EVENT) {
      const data = jobEnvelopeSchema.parse(job.data);
      const outcome = await this.validate.run({
        businessId: data.businessIds[0],
        jobId: data.payload.jobId,
      });
      this.log.info(
        { event: 'imports.validated', jobId: data.payload.jobId, outcome },
        'içe aktarma doğrulandı',
      );
      return;
    }
    if (job.name === EXPIRE_IMPORTS_JOB) {
      const outcome = await this.expire.run(this.log);
      this.log.info({ event: EXPIRE_IMPORTS_JOB, ...outcome }, 'içe aktarma önizleme süre dolumu');
      return;
    }
    this.log.warn({ event: 'imports.unknown_job', jobName: job.name }, 'bilinmeyen iş, atlandı');
  }
}
