// Entegrasyon testleri için Redis istemcisi. Yerelde docker compose'daki Redis, CI'da servis
// container'ı kullanılır (REDIS_URL). Her istemci rastgele bir anahtar önekiyle çalışır;
// cleanup bu önekli anahtarları siler, böylece testler birbirini ve yerel veriyi bozmaz.
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { createRedisClient } from '../src/infrastructure/redis';

export interface TestRedis {
  readonly client: Redis;
  /** Bu istemcinin önekiyle yazılmış anahtarlar (önek olmadan). */
  keys(): Promise<string[]>;
  cleanup(): Promise<void>;
}

export function createTestRedis(url = process.env.REDIS_URL ?? ''): TestRedis {
  const keyPrefix = `test:${randomBytes(6).toString('hex')}:`;
  const client = createRedisClient({ url, keyPrefix });

  async function keys(): Promise<string[]> {
    // KEYS komutu öneki otomatik eklemez; desen açıkça önekle yazılır.
    const found = await client.keys(`${keyPrefix}*`);
    return found.map((key) => key.slice(keyPrefix.length));
  }

  async function cleanup(): Promise<void> {
    if (client.status === 'ready') {
      const found = await keys();
      if (found.length > 0) await client.del(...found);
    }
    client.disconnect();
  }

  return { client, keys, cleanup };
}
