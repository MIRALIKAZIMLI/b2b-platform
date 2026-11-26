// `catalog` kuyruğunun tüketicisi (worker, F3.4a): ürün görseli küçültme işi. İş verisi outbox
// zarfıdır: yükte yalnız kimlikler, kiracı `businessIds[0]` (satıcı; kart K11).
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { InjectPinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { RESIZE_IMAGE_EVENT, ResizeImageJob } from './jobs/resize-image.job';

export interface CatalogJobLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

const imageAddedJobSchema = z.object({
  businessIds: z.tuple([z.uuid()]),
  payload: z.object({ imageId: z.uuid(), productId: z.uuid() }),
});

@Processor('catalog')
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
      const outcome = await this.resize.run(
        { businessId: data.businessIds[0], imageId: data.payload.imageId },
        this.log,
      );
      this.log.info(
        { event: 'catalog.image_resized', imageId: data.payload.imageId, outcome },
        'ürün görseli işi',
      );
      return;
    }
    this.log.warn({ event: 'catalog.unknown_job', jobName: job.name }, 'bilinmeyen iş, atlandı');
  }
}
