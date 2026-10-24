// ioredis istemcisi (önbellek; F1.2b'de BullMQ da kullanır). Adres loglanmaz.
// - lazyConnect: bağlantı ilk komutta açılır (açılışta Redis yoksa süreç düşmez).
// - maxRetriesPerRequest: 1 → Redis yokken komut, bir yeniden bağlanma denemesinden sonra hata
//   verir (sonsuza kadar beklemez); çağıran (ör. SettingsCache) veritabanına düşer. Bağlantı
//   kurulurken gelen komut kuyrukta bekler (ilk komut boşa düşmez).
import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface RedisClientOptions {
  readonly url: string;
  /** Anahtar öneki (testlerde rastgele). */
  readonly keyPrefix?: string;
}

const logger = new Logger('Redis');

export function createRedisClient(options: RedisClientOptions): Redis {
  const client = new Redis(options.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    ...(options.keyPrefix === undefined ? {} : { keyPrefix: options.keyPrefix }),
  });
  // Dinleyici yoksa 'error' olayı süreci düşürür. Mesaja yalnızca hata kodu yazılır.
  client.on('error', (error: Error & { code?: unknown }) => {
    const code = typeof error.code === 'string' ? error.code : 'unknown';
    logger.warn(`redis.error: Redis bağlantı hatası (kod: ${code})`);
  });
  return client;
}
