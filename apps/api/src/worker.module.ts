import { type DynamicModule, Module } from '@nestjs/common';
import type { WorkerEnv } from '@b2b/shared';
import { CoreModule } from './core/core.module';
import { OutboxDispatcherModule } from './core/outbox';
import { AccessWorkerModule } from './modules/access';
import { ConnectionsWorkerModule } from './modules/connections';
import { PushModule } from './infrastructure/push';
import { RedisModule } from './infrastructure/redis';
import { SearchModule } from './infrastructure/search';
import { DirectoryWorkerModule } from './modules/directory';
import { NotificationsWorkerModule } from './modules/notifications';

// Worker giriş noktasının modülü: outbox dağıtıcısı (F1.2b). Kuyruk tüketicileri: access (F1.8b),
// notifications (F1.11; push sağlayıcısı PUSH_PROVIDER ile), directory (F2.11a; Meilisearch),
// connections (F2.16; istek süre dolumu zamanlanmış işi).
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
        SearchModule.forRoot({ url: env.MEILI_URL, apiKey: env.MEILI_MASTER_KEY }),
        DirectoryWorkerModule,
        ConnectionsWorkerModule,
      ],
    };
  }
}
