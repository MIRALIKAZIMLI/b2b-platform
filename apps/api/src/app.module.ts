import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { ApiEnv } from '@b2b/shared';
import type { DestinationStream } from 'pino';
import { CoreModule } from './core/core.module';
import { GlobalExceptionFilter } from './core/errors/exception.filter';
import { HealthModule } from './core/health/health.module';
import { IdempotencyModule } from './core/idempotency';
import { OutboxModule } from './core/outbox';
import { RequestIdMiddleware } from './core/request-id.middleware';
import { RedisModule } from './infrastructure/redis';
import { SmsModule, type SmsRetryPolicy } from './infrastructure/sms';
import { AccessModule } from './modules/access';
import { BillingModule } from './modules/billing';
import { BusinessesModule } from './modules/businesses';
import { DevModule, isDevModuleEnabled } from './modules/dev';
import { I18nModule } from './modules/i18n';
import { IdentityModule } from './modules/identity';
import { SettingsModule } from './modules/settings';

export interface AppModuleOptions {
  /** Testler için: loglar bu akışa yazılır. */
  readonly logStream?: DestinationStream;
  /** Testler için: SMS yeniden deneme bekleme süreleri. */
  readonly smsRetryPolicy?: SmsRetryPolicy;
}

@Module({})
export class AppModule implements NestModule {
  static register(env: ApiEnv, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot({
          service: 'api',
          env,
          ...(options.logStream === undefined ? {} : { stream: options.logStream }),
        }),
        RedisModule.forRoot({ url: env.REDIS_URL }),
        SmsModule.forRoot({
          provider: env.SMS_PROVIDER,
          ...(options.smsRetryPolicy === undefined ? {} : { retryPolicy: options.smsRetryPolicy }),
        }),
        HealthModule,
        SettingsModule,
        I18nModule,
        BusinessesModule,
        BillingModule,
        AccessModule,
        IdentityModule.forRoot({
          otpHashKey: env.OTP_HASH_KEY,
          totpEncryptionKey: Buffer.from(env.TOTP_ENCRYPTION_KEY, 'base64'),
          jwt: {
            current: { id: env.JWT_KEY_ID, secret: env.JWT_SIGNING_KEY },
            ...(env.JWT_PREVIOUS_KEY_ID === undefined || env.JWT_PREVIOUS_SIGNING_KEY === undefined
              ? {}
              : {
                  previous: { id: env.JWT_PREVIOUS_KEY_ID, secret: env.JWT_PREVIOUS_SIGNING_KEY },
                }),
          },
        }),
        // /api/v1/dev/* production'da hiç kaydedilmez (NFR-96, ADR-0021).
        ...(isDevModuleEnabled(env.APP_ENV) ? [DevModule] : []),
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
