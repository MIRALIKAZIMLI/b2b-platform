import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { createRedisClient, type RedisClientOptions } from './redis.client';

/** Paylaşılan ioredis istemcisinin DI anahtarı. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onApplicationShutdown(): void {
    this.client.disconnect();
  }
}

/** REDIS_URL ile tek istemci; uygulama kapanırken bağlantı kapatılır. */
@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisClientOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        { provide: REDIS_CLIENT, useFactory: () => createRedisClient(options) },
        RedisShutdown,
      ],
      exports: [REDIS_CLIENT],
    };
  }
}
