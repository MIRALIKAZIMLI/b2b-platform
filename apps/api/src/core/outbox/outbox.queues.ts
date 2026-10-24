// Dağıtıcının kuyruk erişimi. Gerçek uygulama BullMQ; testler sahte bir uygulama verebilir.
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { BULLMQ_CONNECTION, QUEUE_MAP } from '../../infrastructure/queue';
import type { OutboxQueueName } from './event-registry';

export interface OutboxJob {
  readonly queue: OutboxQueueName;
  readonly name: string;
  /** `outbox-<id>`: aynı olay yeniden eklenirse BullMQ ikinci iş açmaz. */
  readonly jobId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export abstract class OutboxQueues {
  /** Redis bağlantısı hazır mı? Hazır değilse dağıtım turu atlanır (K7). */
  abstract isReady(): boolean;
  abstract add(job: OutboxJob): Promise<void>;
}

@Injectable()
export class BullOutboxQueues extends OutboxQueues {
  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: Redis,
    @Inject(QUEUE_MAP) private readonly queues: Readonly<Record<OutboxQueueName, Queue>>,
  ) {
    super();
  }

  isReady(): boolean {
    return this.connection.status === 'ready';
  }

  async add(job: OutboxJob): Promise<void> {
    await this.queues[job.queue].add(job.name, job.data, { jobId: job.jobId });
  }
}
