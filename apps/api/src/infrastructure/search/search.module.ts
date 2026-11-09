// Arama indeksi sağlayıcısı (F2.11a, ADR-0011). Global: dizin tüketicisi ve yeniden indeksleme
// `BuyerDirectoryIndex` portunu alır. Adres `MEILI_URL`; local/test'te varsayılan (env şeması K5).
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { MEILI_LOCAL_DEFAULT_URL } from '@b2b/shared';
import { Clock } from '../../core/clock';
import { BuyerDirectoryIndex } from '../../core/ports/buyer-directory-index';
import { MeiliBuyerDirectoryIndex } from './meili-buyer-directory-index';

export interface SearchModuleOptions {
  readonly url: string | undefined;
  readonly apiKey: string | undefined;
}

export function createBuyerDirectoryIndex(
  options: SearchModuleOptions,
  clock: Clock,
): MeiliBuyerDirectoryIndex {
  return new MeiliBuyerDirectoryIndex(
    {
      url: options.url ?? MEILI_LOCAL_DEFAULT_URL,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    },
    clock,
  );
}

@Global()
@Module({})
export class SearchModule {
  static forRoot(options: SearchModuleOptions): DynamicModule {
    return {
      module: SearchModule,
      providers: [
        {
          provide: BuyerDirectoryIndex,
          inject: [Clock],
          useFactory: (clock: Clock) => createBuyerDirectoryIndex(options, clock),
        },
      ],
      exports: [BuyerDirectoryIndex],
    };
  }
}
