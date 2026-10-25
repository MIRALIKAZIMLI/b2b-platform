// SMS sağlayıcı seçimi (NFR-95): `SMS_PROVIDER` ortam değişkeni. Şimdilik yalnızca `mock`
// (gerçek sağlayıcı F6.5). Production'da mock ile api açılmaz (env şeması, NFR-97).
import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { SmsProvider } from '@b2b/shared';
import { Clock } from '../../core/clock';
import { IdGenerator } from '../../core/id-generator';
import { SmsSender } from '../../core/ports/sms-sender';
import { DevSmsOutboxRepository } from './dev-sms-outbox.repository';
import { MockSmsSender } from './mock-sms-sender';
import {
  DEFAULT_SMS_RETRY_POLICY,
  RetryingSmsSender,
  type SmsRetryPolicy,
} from './retrying-sms-sender';

export interface SmsModuleOptions {
  readonly provider: SmsProvider;
  /** Testler için (bekleme süreleri kısaltılır). */
  readonly retryPolicy?: SmsRetryPolicy;
}

type ProviderFactory = (
  outbox: DevSmsOutboxRepository,
  ids: IdGenerator,
  clock: Clock,
) => SmsSender;

/** Sağlayıcı adı → uygulama. Gerçek sağlayıcı F6.5'te buraya eklenir (uygulama kodu değişmez, NFR-98). */
const PROVIDERS: Readonly<Record<SmsProvider, ProviderFactory>> = {
  mock: (outbox, ids, clock) => new MockSmsSender(outbox, ids, clock),
};

@Global()
@Module({})
export class SmsModule {
  static forRoot(options: SmsModuleOptions): DynamicModule {
    return {
      module: SmsModule,
      providers: [
        DevSmsOutboxRepository,
        {
          provide: SmsSender,
          useFactory: (outbox: DevSmsOutboxRepository, ids: IdGenerator, clock: Clock) => {
            return new RetryingSmsSender(
              PROVIDERS[options.provider](outbox, ids, clock),
              options.retryPolicy ?? DEFAULT_SMS_RETRY_POLICY,
            );
          },
          inject: [DevSmsOutboxRepository, IdGenerator, Clock],
        },
      ],
      exports: [SmsSender, DevSmsOutboxRepository],
    };
  }
}
