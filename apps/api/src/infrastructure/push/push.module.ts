// Push sağlayıcı seçimi (integrations §3): `PUSH_PROVIDER` (yalnızca worker). Production'da mock ile
// worker açılmaz (env şeması, F1.11).
import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { PushProvider } from '@b2b/shared';
import { PushSender } from '../../core/ports/push-sender';
import { ExpoPushSender } from './expo-push-sender';
import { MockPushSender } from './mock-push-sender';

export interface PushModuleOptions {
  readonly provider: PushProvider;
  readonly expoAccessToken?: string;
}

export function createPushSender(options: PushModuleOptions): PushSender {
  switch (options.provider) {
    case 'expo':
      return new ExpoPushSender(
        options.expoAccessToken === undefined ? {} : { accessToken: options.expoAccessToken },
      );
    case 'mock':
      return new MockPushSender();
  }
}

@Global()
@Module({})
export class PushModule {
  static forRoot(options: PushModuleOptions): DynamicModule {
    return {
      module: PushModule,
      providers: [{ provide: PushSender, useFactory: () => createPushSender(options) }],
      exports: [PushSender],
    };
  }
}
