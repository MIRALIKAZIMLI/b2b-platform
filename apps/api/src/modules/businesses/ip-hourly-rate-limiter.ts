// Kimliksiz uçların IP başına saatlik hız sınırı (F2 spesifikasyonu §6 kural 6):
// - `seller_app`: toptancı başvurusu (F2.2; ayar `seller_application.ip_max_per_hour`).
// - `buyer_reg`: perakendeci kaydı (F2.3a; ayar `buyer_registration.ip_max_per_hour`).
// Kayan 1 saatlik pencere Redis'te (OtpRateLimiter kalıbı); anahtarda IP düz yazılmaz (HMAC).
// Redis'e ulaşılamazsa istek engellenmez, uyarı loglanır (F2.2 Mimar kararı, fail-open):
// başvuru VÖEN başına tek açık başvuruyla, kayıt OTP ile doğrulanmış telefon başına tek kullanıcıyla
// zaten sınırlıdır (US-008 AC3, US-005).
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

export type IpRateScope = 'seller_app' | 'buyer_reg';

const LOG_EVENT: Readonly<Record<IpRateScope, string>> = {
  seller_app: 'seller_application.redis_unavailable',
  buyer_reg: 'buyer_registration.redis_unavailable',
};

export type IpRateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

@Injectable()
export class IpHourlyRateLimiter {
  private readonly logger = new Logger(IpHourlyRateLimiter.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async reserve(input: {
    readonly scope: IpRateScope;
    readonly ipKey: string;
    readonly nowMs: number;
    readonly maxPerHour: number;
    /** Bu isteğin benzersiz kimliği (başvuru / işletme kimliği). */
    readonly member: string;
  }): Promise<IpRateDecision> {
    let waitMs: unknown;
    try {
      waitMs = await this.redis.eval(
        RESERVE_SCRIPT,
        1,
        `${input.scope}:req:ip:${input.ipKey}`,
        input.nowMs,
        HOUR_MS,
        input.maxPerHour,
        input.member,
      );
    } catch (error) {
      const code = error instanceof Error ? error.name : 'unknown';
      this.logger.warn(
        `${LOG_EVENT[input.scope]}: Redis'e ulaşılamadı, hız sınırı uygulanmadı (kod: ${code})`,
      );
      return { allowed: true };
    }
    const wait = Number(waitMs);
    if (!Number.isFinite(wait) || wait <= 0) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)) };
  }
}
