// Tek çalışma kilidi (ADR-0011 §4): `SET key token NX EX`; yalnız sahibi (token) bırakır.
// Zamanlanmış işler ve yeniden indeksleme gibi aynı anda bir kopyası çalışması gereken işler için.
import { randomUUID } from 'node:crypto';

export interface RedisLockClient {
  set(key: string, value: string, mode: 'EX', seconds: number, flag: 'NX'): Promise<'OK' | null>;
  eval(script: string, keys: number, ...args: string[]): Promise<unknown>;
}

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * Kilidi alırsa `fn`'i çalıştırır ve `{ acquired: true, value }` döner; başka kopya tutuyorsa
 * `fn` çalışmaz, `{ acquired: false }` döner. Kilit `ttlSeconds` sonunda kendiliğinden düşer.
 */
export async function withRedisLock<T>(
  redis: RedisLockClient,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const token = randomUUID();
  const ok = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  if (ok !== 'OK') return { acquired: false };
  try {
    return { acquired: true, value: await fn() };
  } finally {
    await redis.eval(RELEASE_SCRIPT, 1, key, token);
  }
}
