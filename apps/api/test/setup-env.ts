// Entegrasyon testi dosyası başına çalışır (vitest setupFiles).
// globalSetup'ın hazırladığı adresleri (PostgreSQL, Redis) ortam değişkenine yazar; havuz tek bağlantılıdır,
// böylece "işlem sonrası ayar sızmaz" testleri aynı bağlantıyı kullanır.
import { afterAll, inject } from 'vitest';
import { closeDb } from '../src/core/db/client';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.DATABASE_MIGRATOR_URL = inject('migratorUrl');
process.env.DB_POOL_MAX = '1';
process.env.REDIS_URL = inject('redisUrl');

afterAll(async () => {
  await closeDb();
});
