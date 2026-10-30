import { type DynamicModule, Module } from '@nestjs/common';
import type { WorkerEnv } from '@b2b/shared';
import { CoreModule } from './core/core.module';
import { OutboxDispatcherModule } from './core/outbox';
import { AccessWorkerModule } from './modules/access';
import { PushModule } from './infrastructure/push';
import { RedisModule } from './infrastructure/redis';
import { NotificationsWorkerModule } from './modules/notifications';

// Worker giriş noktasının modülü: outbox dağıtıcısı (F1.2b). Kuyruk tüketicileri: access (F1.8b),
// notifications (F1.11; push sağlayıcısı PUSH_PROVIDER ile).
// Ayarların Redis istemcisi (RedisModule) ile BullMQ bağlantısı ayrıdır (Müfettiş notu b).
@Module({})
export class WorkerModule {
  static register(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        CoreModule.forRoot({ service: 'worker', env }),
        RedisModule.forRoot({ url: env.REDIS_URL }),
        OutboxDispatcherModule.register({ redisUrl: env.REDIS_URL }),
        AccessWorkerModule,
        PushModule.forRoot({
          provider: env.PUSH_PROVIDER,
          ...(env.EXPO_ACCESS_TOKEN === undefined
            ? {}
            : { expoAccessToken: env.EXPO_ACCESS_TOKEN }),
        }),
        NotificationsWorkerModule,
      ],
    };
  }
}
