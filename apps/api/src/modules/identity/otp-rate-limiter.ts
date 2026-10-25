// OTP hız sınırları ve numara kilidi Redis'te (NFR-45, SF-01; Mimar kararı 2, data-model §4.2).
// - Numara: son istekten `otp.resend_interval_seconds` geçmeli; kayan 1 saatte en çok
//   `otp.max_per_hour` istek. IP: kayan 1 saatte en çok `otp.ip_max_per_hour`.
// - Kilit: değer, kilidin bittiği an (Clock, ms); Redis TTL yalnızca temizlik içindir. Böylece
//   süreler uygulamanın saatine göre hesaplanır (coding-guidelines §3.10).
// - Günlük SMS sayacı: UTC güne göre (`sms.daily_cap`).
// Anahtarlarda telefon ve IP düz yazılmaz (HMAC özeti, otp-code.ts).
// Redis'e ulaşılamazsa güvenli tarafta kalınır: işlem yapılmaz, `503 SMS_UNAVAILABLE`.
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DomainError } from '../../core/errors/domain-error';
import { REDIS_CLIENT } from '../../infrastructure/redis';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type RateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface ReserveRequestInput {
  readonly phoneKey: string;
  /** İstek IP'sinin özeti; IP bilinmiyorsa IP sınırı uygulanmaz. */
  readonly ipKey?: string;
  readonly nowMs: number;
  /** Bu isteğin benzersiz kimliği (challengeId). */
  readonly member: string;
  readonly resendIntervalSeconds: number;
  readonly maxPerHour: number;
  readonly ipMaxPerHour: number;
}

// Kontrol ve kayıt tek atomik adımda: sınır aşılmışsa hiçbir şey yazılmaz, bekleme (ms) döner.
const RESERVE_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local resend = tonumber(ARGV[3])
local maxPhone = tonumber(ARGV[4])
local maxIp = tonumber(ARGV[5])
local member = ARGV[6]
local hasIp = ARGV[7] == '1'
local wait = 0
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local last = redis.call('ZRANGE', KEYS[1], -1, -1, 'WITHSCORES')
if last[2] then
  local since = now - tonumber(last[2])
  if since < resend then wait = math.max(wait, resend - since) end
end
if redis.call('ZCARD', KEYS[1]) >= maxPhone then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  wait = math.max(wait, tonumber(oldest[2]) + window - now)
end
if hasIp then
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - window)
  if redis.call('ZCARD', KEYS[2]) >= maxIp then
    local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
    wait = math.max(wait, tonumber(oldest[2]) + window - now)
  end
end
if wait > 0 then return wait end
redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], window)
if hasIp then
  redis.call('ZADD', KEYS[2], now, member)
  redis.call('PEXPIRE', KEYS[2], window)
end
return 0
`;

function toRetryAfterSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'unknown';
  }
  return error instanceof Error ? error.name : 'unknown';
}

@Injectable()
export class OtpRateLimiter {
  private readonly logger = new Logger(OtpRateLimiter.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Numara kilitliyse kalan süre (sn); değilse undefined. */
  async lockRemainingSeconds(phoneKey: string, nowMs: number): Promise<number | undefined> {
    const until = await this.call(() => this.redis.get(`otp:lock:${phoneKey}`));
    if (until === null) return undefined;
    const remaining = Number(until) - nowMs;
    return Number.isFinite(remaining) && remaining > 0 ? toRetryAfterSeconds(remaining) : undefined;
  }

  /** Numarayı `lockMinutes` boyunca kilitler (US-001 AC4). */
  async lock(phoneKey: string, nowMs: number, lockMinutes: number): Promise<void> {
    const durationMs = lockMinutes * 60 * 1000;
    await this.call(() =>
      this.redis.set(`otp:lock:${phoneKey}`, String(nowMs + durationMs), 'PX', durationMs),
    );
  }

  /** Sınırlar uygunsa isteği sayar; değilse bekleme süresini döner (US-001 AC3). */
  async reserveRequest(input: ReserveRequestInput): Promise<RateDecision> {
    const phoneSet = `otp:req:phone:${input.phoneKey}`;
    const ipSet = `otp:req:ip:${input.ipKey ?? 'none'}`;
    const waitMs = await this.call(() =>
      this.redis.eval(
        RESERVE_SCRIPT,
        2,
        phoneSet,
        ipSet,
        input.nowMs,
        HOUR_MS,
        input.resendIntervalSeconds * 1000,
        input.maxPerHour,
        input.ipMaxPerHour,
        input.member,
        input.ipKey === undefined ? '0' : '1',
      ),
    );
    const wait = Number(waitMs);
    return wait > 0
      ? { allowed: false, retryAfterSeconds: toRetryAfterSeconds(wait) }
      : { allowed: true };
  }

  /** Günün (UTC) SMS sayacını artırır; sınır aşıldıysa false (F1.5-AC8). */
  async countDailySms(nowMs: number, dailyCap: number): Promise<boolean> {
    const day = new Date(nowMs).toISOString().slice(0, 10);
    const key = `otp:sms:daily:${day}`;
    const count = await this.call(async () => {
      const value = await this.redis.incr(key);
      if (value === 1) await this.redis.pexpire(key, 2 * DAY_MS);
      return value;
    });
    return count <= dailyCap;
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      this.logger.warn(
        `otp.redis_unavailable: Redis'e ulaşılamadı, işlem yapılmadı (kod: ${errorCode(error)})`,
      );
      throw new DomainError('SMS_UNAVAILABLE');
    }
  }
}
