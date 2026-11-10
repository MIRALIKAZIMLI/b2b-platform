// Dizin araması hız sınırı (F2.11b, US-019 AC5): kullanıcı başına kayan 1 dakikalık pencere,
// sınır `directory.search_max_per_minute`. Filtreli arama ve tam telefon/VÖEN araması birlikte
// sayılır. Redis'e ulaşılamazsa istek engellenmez, uyarı loglanır (Mimar K4, F2.2 kararıyla aynı).
// Anahtarda yalnız kullanıcı kimliği (UUID) durur; telefon/VÖEN anahtara ve loga girmez.
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis';

const MINUTE_MS = 60 * 1000;

// Kontrol ve kayıt tek atomik adımda: sınır aşılmışsa yazılmaz, bekleme (ms) döner.
const RESERVE_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= max then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return math.max(1, tonumber(oldest[2]) + window - now)
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return 0
`;

export type DirectoryRateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export function directoryRateKey(userId: string): string {
  return `directory_search:user:${userId}`;
}

@Injectable()
export class DirectoryRateLimiter {
  private readonly logger = new Logger(DirectoryRateLimiter.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async reserve(input: {
    readonly userId: string;
    readonly nowMs: number;
    readonly maxPerMinute: number;
    /** Bu isteğin benzersiz kimliği (aynı milisaniyedeki istekler ayrı sayılsın). */
    readonly member: string;
  }): Promise<DirectoryRateDecision> {
    let waitMs: unknown;
    try {
      waitMs = await this.redis.eval(
        RESERVE_SCRIPT,
        1,
        directoryRateKey(input.userId),
        input.nowMs,
        MINUTE_MS,
        input.maxPerMinute,
        input.member,
      );
    } catch (error) {
      const code = error instanceof Error ? error.name : 'unknown';
      this.logger.warn(
        `directory.search.redis_unavailable: Redis'e ulaşılamadı, hız sınırı uygulanmadı (kod: ${code})`,
      );
      return { allowed: true };
    }
    const wait = Number(waitMs);
    if (!Number.isFinite(wait) || wait <= 0) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)) };
  }
}
