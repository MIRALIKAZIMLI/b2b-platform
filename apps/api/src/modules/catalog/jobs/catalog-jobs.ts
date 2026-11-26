// `catalog` kuyruğuna worker'ın kendi eklediği işler (F3.4b, Müfettiş 27 #79): geçici depo
// hatasında görsel küçültmenin gecikmeli yeniden denemesi. İş verisi yalnız kimlik taşır.
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { QUEUE_MAP } from '../../../infrastructure/queue';

export const RESIZE_RETRY_JOB = 'product_image.resize_retry';

export const resizeRetrySchema = z.strictObject({
  businessId: z.uuid(),
  imageId: z.uuid(),
  /** Önceki başarısız deneme sayısı (ilk yeniden deneme 1). */
  attempt: z.number().int().min(1),
});
export type ResizeRetryJob = z.infer<typeof resizeRetrySchema>;

export abstract class CatalogJobs {
  /** İşi `delayMs` sonra çalışacak şekilde ekler; aynı `jobId` ikinci kez eklenmez. */
  abstract addResizeRetry(data: ResizeRetryJob, delayMs: number): Promise<void>;
}

@Injectable()
export class BullCatalogJobs extends CatalogJobs {
  constructor(@Inject(QUEUE_MAP) private readonly queues: Readonly<Record<string, Queue>>) {
    super();
  }

  async addResizeRetry(data: ResizeRetryJob, delayMs: number): Promise<void> {
    const queue = this.queues.catalog;
    if (queue === undefined) throw new Error('catalog kuyruğu kayıtlı değil');
    await queue.add(RESIZE_RETRY_JOB, data, {
      delay: delayMs,
      jobId: `image-retry-${data.imageId}-${String(data.attempt)}`,
    });
  }
}
