// `notifications` kuyruğunun tüketicisi (worker, F1.11).
// - Outbox olayları (ör. `notification.test`): alıcıya bildirim + push.
// - `push.deliver`: push yeniden denemesi. `push.receipts`: makbuz kontrolü.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { z } from 'zod';
import { NotificationDispatcher } from './notification-dispatcher';
import {
  PUSH_DELIVER_JOB,
  PUSH_RECEIPTS_JOB,
  pushDeliverSchema,
  pushReceiptsSchema,
} from './notification-jobs';
import { NOTIFICATION_EVENT_TYPES } from './notification-types';

const outboxJobSchema = z.object({ type: z.string(), payload: z.unknown() });

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  constructor(
    @Inject(NotificationDispatcher)
    private readonly dispatcher: Pick<
      NotificationDispatcher,
      'handleEvent' | 'deliver' | 'checkReceipts'
    >,
  ) {
    super();
  }

  async process(job: Pick<Job, 'name' | 'data'>): Promise<void> {
    if (job.name === PUSH_DELIVER_JOB) {
      await this.dispatcher.deliver(pushDeliverSchema.parse(job.data));
      return;
    }
    if (job.name === PUSH_RECEIPTS_JOB) {
      await this.dispatcher.checkReceipts(pushReceiptsSchema.parse(job.data));
      return;
    }
    if (NOTIFICATION_EVENT_TYPES.includes(job.name)) {
      const event = outboxJobSchema.parse(job.data);
      await this.dispatcher.handleEvent(event.type, event.payload);
    }
  }
}
