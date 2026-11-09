// `search:reindex` komutu (F2.11a, ADR-0011, RB-05): perakendeci dizinini veritabanından
// sıfırdan kurar ve canlı indeksle takas eder. Worker'ın gece işiyle aynı kilidi kullanır;
// kilit tutuluyorsa çalışmaz. Ortam: DATABASE_URL, REDIS_URL, APP_ENV, MEILI_URL, MEILI_MASTER_KEY.
import 'reflect-metadata';
import { type DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { parseSearchEnv, parseServerEnv } from '@b2b/shared';
import { CoreModule } from './core/core.module';
import { RedisModule } from './infrastructure/redis';
import { SearchModule } from './infrastructure/search';
import { DirectoryIndexModule, DirectoryReindexService } from './modules/directory';

@Module({})
class SearchReindexModule {
  static register(): DynamicModule {
    const env = parseServerEnv(process.env);
    const search = parseSearchEnv(process.env);
    return {
      module: SearchReindexModule,
      imports: [
        CoreModule.forRoot({ service: 'worker', env }),
        RedisModule.forRoot({ url: env.REDIS_URL }),
        SearchModule.forRoot({ url: search.MEILI_URL, apiKey: search.MEILI_MASTER_KEY }),
        DirectoryIndexModule,
      ],
    };
  }
}

export async function searchReindex(): Promise<string> {
  const app = await NestFactory.createApplicationContext(SearchReindexModule.register(), {
    logger: false,
  });
  try {
    const outcome = await app.get(DirectoryReindexService).run();
    return outcome.status === 'done'
      ? `search:reindex tamamlandı: buyer_directory ${String(outcome.indexed)} belge.`
      : 'search:reindex atlandı: başka bir yeniden indeksleme çalışıyor (kilit).';
  } finally {
    await app.close();
  }
}
