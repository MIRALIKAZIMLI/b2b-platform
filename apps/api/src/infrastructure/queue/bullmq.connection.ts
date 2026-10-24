// BullMQ'nun kendi ioredis bağlantısı (F1.2b, Müfettiş notu b). Ayarların önbellek istemcisi
// (infrastructure/redis) paylaşılmaz: BullMQ `maxRetriesPerRequest: null` ister, önbellek ise
// komutun hızla hata vermesini ister (maxRetriesPerRequest: 1).
// - enableOfflineQueue: false → Redis yokken komut kuyrukta beklemez, hemen hata verir;
//   dağıtıcı turu atlar (attempts artmaz).
// - lazyConnect yok: BullMQ bağlantının kendiliğinden açılmasını bekler.
// Adres loglanmaz; hata mesajında yalnızca kod.
import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface BullConnectionOptions {
  readonly url: string;
}

const logger = new Logger('BullMQ');

export function createBullConnection(options: BullConnectionOptions): Redis {
  const client = new Redis(options.url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  // Dinleyici yoksa 'error' olayı süreci düşürür.
  client.on('error', (error: Error & { code?: unknown }) => {
    const code = typeof error.code === 'string' ? error.code : 'unknown';
    logger.warn(`bullmq.redis_error: BullMQ Redis bağlantı hatası (kod: ${code})`);
  });
  return client;
}
