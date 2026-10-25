import { type DynamicModule, Module } from '@nestjs/common';
import type { ServerEnv } from '@b2b/shared';
import { CoreModule } from './core/core.module';
import { OutboxDispatcherModule } from './core/outbox';
import { AccessWorkerModule } from './modules/access';
import { RedisModule } from './infrastructure/redis';

// Worker giriş noktasının modülü: outbox dağıtıcısı (F1.2b). Kuyruk tüketicileri: access (F1.8b), diğerleri F1.11 ve sonrasında.
// Ayarların Redis istemcisi (RedisModule) ile BullMQ bağlantısı ayrıdır (Müfettiş notu b).
@Module({})
export class WorkerModule {
  static register(env: ServerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        CoreModule.forRoot({ service: 'worker', env }),
        RedisModule.forRoot({ url: env.REDIS_URL }),
        OutboxDispatcherModule.register({ redisUrl: env.REDIS_URL }),
        AccessWorkerModule,
      ],
    };
  }
}
