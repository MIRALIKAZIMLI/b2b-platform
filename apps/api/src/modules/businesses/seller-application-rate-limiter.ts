// Kimliksiz toptancı başvurusunun IP hız sınırı (F2.2; ayar `seller_application.ip_max_per_hour`).
// Kayan 1 saatlik pencere Redis'te (OtpRateLimiter kalıbı); anahtarda IP düz yazılmaz (HMAC).
// Redis'e ulaşılamazsa başvuru engellenmez, uyarı loglanır: form kişisel veri veya para hareketi
// açmaz; kayıt yine VÖEN başına tek açık başvuruyla sınırlıdır (US-008 AC3).
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis';

const HOUR_MS = 60 * 60 * 1000;

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

export type ApplicationRateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

@Injectable()
export class SellerApplicationRateLimiter {
  private readonly logger = new Logger(SellerApplicationRateLimiter.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async reserve(input: {
    readonly ipKey: string;
    readonly nowMs: number;
    readonly maxPerHour: number;
    /** Bu isteğin benzersiz kimliği (başvuru kimliği). */
    readonly member: string;
  }): Promise<ApplicationRateDecision> {
    let waitMs: unknown;
    try {
      waitMs = await this.redis.eval(
        RESERVE_SCRIPT,
        1,
        `seller_app:req:ip:${input.ipKey}`,
        input.nowMs,
        HOUR_MS,
        input.maxPerHour,
        input.member,
      );
    } catch (error) {
      const code = error instanceof Error ? error.name : 'unknown';
      this.logger.warn(
        `seller_application.redis_unavailable: Redis'e ulaşılamadı, hız sınırı uygulanmadı (kod: ${code})`,
      );
      return { allowed: true };
    }
    const wait = Number(waitMs);
    if (!Number.isFinite(wait) || wait <= 0) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)) };
  }
}
