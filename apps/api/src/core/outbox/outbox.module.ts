import { type DynamicModule, Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue';
import { SettingsModule } from '../../modules/settings';
import { OUTBOX_QUEUE_NAMES } from './event-registry';
import { OutboxDispatcher } from './outbox.dispatcher';
import { BullOutboxQueues, OutboxQueues } from './outbox.queues';
import { OutboxWriter } from './outbox.writer';

/** Olay yazıcı (api ve worker). Veritabanı işlemi çağırandan gelir. */
@Module({
  providers: [OutboxWriter],
  exports: [OutboxWriter],
})
export class OutboxModule {}

export interface OutboxDispatcherOptions {
  readonly redisUrl: string;
}

/** Dağıtıcı (yalnızca worker): BullMQ kuyrukları kendi Redis bağlantısıyla (K7, Müfettiş notu b). */
@Module({})
export class OutboxDispatcherModule {
  static register(options: OutboxDispatcherOptions): DynamicModule {
    return {
      module: OutboxDispatcherModule,
      imports: [
        SettingsModule,
        QueueModule.forRoot({ url: options.redisUrl, queues: OUTBOX_QUEUE_NAMES }),
      ],
      providers: [OutboxDispatcher, { provide: OutboxQueues, useClass: BullOutboxQueues }],
      exports: [OutboxDispatcher],
    };
  }
}
