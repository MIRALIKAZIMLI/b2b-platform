import { getQueueToken, BullModule } from '@nestjs/bullmq';
import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { type BullConnectionOptions, createBullConnection } from './bullmq.connection';

/** BullMQ'ya ayrılmış ioredis bağlantısının DI anahtarı. */
export const BULLMQ_CONNECTION = Symbol('BULLMQ_CONNECTION');

/** Kayıtlı kuyruklar: ad → BullMQ `Queue`. */
export const QUEUE_MAP = Symbol('QUEUE_MAP');

@Injectable()
class BullConnectionShutdown implements OnApplicationShutdown {
  constructor(@Inject(BULLMQ_CONNECTION) private readonly client: Redis) {}

  onApplicationShutdown(): void {
    this.client.disconnect();
  }
}

@Module({})
class BullConnectionModule {
  static forRoot(options: BullConnectionOptions): DynamicModule {
    return {
      module: BullConnectionModule,
      providers: [
        { provide: BULLMQ_CONNECTION, useFactory: () => createBullConnection(options) },
        BullConnectionShutdown,
      ],
      exports: [BULLMQ_CONNECTION],
    };
  }
}

export interface QueueModuleOptions extends BullConnectionOptions {
  readonly queues: readonly string[];
  /** Redis anahtar öneki (testlerde rastgele). */
  readonly prefix?: string;
}

/**
 * BullMQ kuyrukları (@nestjs/bullmq), kendi Redis bağlantısıyla. Global: kuyruk tüketicileri
 * gecikmeli iş eklemek için `QUEUE_MAP`'i alabilir (ör. push yeniden denemesi, F1.11).
 */
@Module({})
export class QueueModule {
  static forRoot(options: QueueModuleOptions): DynamicModule {
    const connection = BullConnectionModule.forRoot({ url: options.url });
    return {
      module: QueueModule,
      global: true,
      imports: [
        connection,
        BullModule.forRootAsync({
          imports: [connection],
          inject: [BULLMQ_CONNECTION],
          useFactory: (client: Redis) => ({
            connection: client,
            ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
          }),
        }),
        BullModule.registerQueue(...options.queues.map((name) => ({ name }))),
      ],
      providers: [
        {
          provide: QUEUE_MAP,
          inject: options.queues.map((name) => getQueueToken(name)),
          useFactory: (...queues: Queue[]): Readonly<Record<string, Queue>> => {
            const map: Record<string, Queue> = {};
            queues.forEach((queue, index) => {
              const name = options.queues[index];
              if (name !== undefined) map[name] = queue;
            });
            return map;
          },
        },
      ],
      exports: [connection, QUEUE_MAP],
    };
  }
}
