import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { ServerEnv } from '@b2b/shared';
import type { DestinationStream } from 'pino';
import { CoreModule } from './core/core.module';
import { GlobalExceptionFilter } from './core/errors/exception.filter';
import { HealthModule } from './core/health/health.module';
import { IdempotencyModule } from './core/idempotency';
import { OutboxModule } from './core/outbox';
import { RequestIdMiddleware } from './core/request-id.middleware';
import { RedisModule } from './infrastructure/redis';
import { BillingModule } from './modules/billing';
import { BusinessesModule } from './modules/businesses';
import { I18nModule } from './modules/i18n';
import { SettingsModule } from './modules/settings';

export interface AppModuleOptions {
  /** Testler için: loglar bu akışa yazılır. */
  readonly logStream?: DestinationStream;
}

@Module({})
export class AppModule implements NestModule {
  static register(env: ServerEnv, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot({
          service: 'api',
          env,
          ...(options.logStream === undefined ? {} : { stream: options.logStream }),
        }),
        RedisModule.forRoot({ url: env.REDIS_URL }),
        HealthModule,
        SettingsModule,
        I18nModule,
        BusinessesModule,
        BillingModule,
        IdempotencyModule,
        OutboxModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
