// `notifications` kuyruğunun tüketicisi (worker, F1.11).
// - Outbox olayları (ör. `notification.test`): alıcıya bildirim + push.
// - `push.deliver`: push yeniden denemesi. `push.receipts`: makbuz kontrolü.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { InjectPinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { NotificationDispatcher, type NotificationLog } from './notification-dispatcher';
import {
  PUSH_DELIVER_JOB,
  PUSH_RECEIPTS_JOB,
  pushDeliverSchema,
  pushReceiptsSchema,
} from './notification-jobs';
import { NOTIFICATION_EVENT_TYPES } from './notification-types';

const outboxJobSchema = z.object({
  /** outbox_events.id (bigint, metin); idempotens anahtarı (ADR-0010 §4). */
  eventId: z.string().regex(/^\d{1,19}$/),
  type: z.string(),
  payload: z.unknown(),
});

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  constructor(
    @Inject(NotificationDispatcher)
    private readonly dispatcher: Pick<
      NotificationDispatcher,
      'handleEvent' | 'deliver' | 'checkReceipts'
    >,
    @InjectPinoLogger(NotificationsProcessor.name)
    private readonly log: Pick<NotificationLog, 'warn'>,
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
      await this.dispatcher.handleEvent(event.type, event.payload, event.eventId);
      return;
    }
    this.log.warn(
      { event: 'notifications.unknown_job', jobName: job.name },
      'bilinmeyen iş, atlandı',
    );
  }
}
