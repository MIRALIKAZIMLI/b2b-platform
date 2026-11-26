// `catalog` kuyruğunun tüketicisi (worker, F3.4a): ürün görseli küçültme işi. İş verisi outbox
// zarfıdır: yükte yalnız kimlikler, kiracı `businessIds[0]` (satıcı; kart K11). Geçici hatada
// worker'ın eklediği `product_image.resize_retry` işi de burada (F3.4b).
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { InjectPinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { RESIZE_RETRY_JOB, resizeRetrySchema } from './jobs/catalog-jobs';
import { RESIZE_IMAGE_EVENT, ResizeImageJob } from './jobs/resize-image.job';

/**
 * Aynı anda tek görsel (Müfettiş 27 #79): 40 MP bir görselin çözümü yüzlerce MB tutar; worker
 * bellek tepesi tek işle sınırlanır. Worker açılışında sabittir (BullMQ seçeneği).
 */
export const CATALOG_WORKER_CONCURRENCY = 1;

export interface CatalogJobLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

const imageAddedJobSchema = z.object({
  businessIds: z.tuple([z.uuid()]),
  payload: z.object({ imageId: z.uuid(), productId: z.uuid() }),
});

@Processor('catalog', { concurrency: CATALOG_WORKER_CONCURRENCY })
export class CatalogProcessor extends WorkerHost {
  constructor(
    @Inject(ResizeImageJob) private readonly resize: Pick<ResizeImageJob, 'run'>,
    @InjectPinoLogger(CatalogProcessor.name) private readonly log: CatalogJobLog,
  ) {
    super();
  }

  async process(job: Pick<Job, 'name' | 'data'>): Promise<void> {
    if (job.name === RESIZE_IMAGE_EVENT) {
      const data = imageAddedJobSchema.parse(job.data);
      await this.runResize({ businessId: data.businessIds[0], imageId: data.payload.imageId });
      return;
    }
    if (job.name === RESIZE_RETRY_JOB) {
      await this.runResize(resizeRetrySchema.parse(job.data));
      return;
    }
    this.log.warn({ event: 'catalog.unknown_job', jobName: job.name }, 'bilinmeyen iş, atlandı');
  }

  private async runResize(input: {
    readonly businessId: string;
    readonly imageId: string;
    readonly attempt?: number;
  }): Promise<void> {
    const outcome = await this.resize.run(input, this.log);
    this.log.info(
      {
        event: 'catalog.image_resized',
        imageId: input.imageId,
        attempt: input.attempt ?? 0,
        outcome,
      },
      'ürün görseli işi',
    );
  }
}
