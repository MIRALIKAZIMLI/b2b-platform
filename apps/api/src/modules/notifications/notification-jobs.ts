// `notifications` kuyruğuna worker'ın kendi eklediği işler (F1.11): push yeniden denemesi ve
// makbuz kontrolü. İş verisi yalnızca kimlik taşır; token ve metin Redis'e yazılmaz.
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { QUEUE_MAP } from '../../infrastructure/queue';

export const PUSH_DELIVER_JOB = 'push.deliver';
export const PUSH_RECEIPTS_JOB = 'push.receipts';

export const pushDeliverSchema = z.strictObject({
  notificationId: z.uuid(),
  userId: z.uuid(),
  /** 0: ilk gönderim; n: n. yeniden deneme. */
  attempt: z.number().int().min(0),
  /** Yalnızca bu token satırlarına (yeniden denemede başarısız grup). */
  tokenIds: z.array(z.uuid()).optional(),
});
export type PushDeliverJob = z.infer<typeof pushDeliverSchema>;

export const pushReceiptsSchema = z.strictObject({
  userId: z.uuid(),
  tickets: z.array(z.strictObject({ ticketId: z.string().min(1), pushTokenId: z.uuid() })).min(1),
});
export type PushReceiptsJob = z.infer<typeof pushReceiptsSchema>;

export type NotificationJob =
  | { readonly name: typeof PUSH_DELIVER_JOB; readonly data: PushDeliverJob }
  | { readonly name: typeof PUSH_RECEIPTS_JOB; readonly data: PushReceiptsJob };

export abstract class NotificationJobs {
  /** İşi `delayMs` sonra çalışacak şekilde ekler; aynı `jobId` ikinci kez eklenmez. */
  abstract add(job: NotificationJob, delayMs: number, jobId: string): Promise<void>;
}

@Injectable()
export class BullNotificationJobs extends NotificationJobs {
  constructor(@Inject(QUEUE_MAP) private readonly queues: Readonly<Record<string, Queue>>) {
    super();
  }

  async add(job: NotificationJob, delayMs: number, jobId: string): Promise<void> {
    const queue = this.queues.notifications;
    if (queue === undefined) throw new Error('notifications kuyruğu kayıtlı değil');
    await queue.add(job.name, job.data, { delay: delayMs, jobId });
  }
}
