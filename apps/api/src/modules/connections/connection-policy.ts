// Bağlantı isteği kuralları (F2.12a; US-021 AC1–AC7, SF-03, test-strategy §3.2, c4 §ConnectionPolicy).
// Saf fonksiyonlar: veritabanı ve saat yok; durum ve zaman çağırandan gelir. Sıra SF-03 ile aynı:
// aktif bağlantı → bekleyen istek → engel → bekleme süresi → günlük kota.
import type { ErrorCode } from '@b2b/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_DAY = 24 * 60 * 60;

/** Satıcı–alıcı çiftinin satıcının gördüğü durumu. */
export interface PairState {
  readonly activeConnection: boolean;
  readonly pendingRequest: boolean;
  readonly blocked: boolean;
  /** Son reddedilen isteğin yanıt anı (engel de reddir). */
  readonly lastRejectedAt: Date | null;
  /** Perakendecinin son iptal ettiği bağlantının bitişi. */
  readonly lastBuyerCancelAt: Date | null;
  /** Herhangi bir tarafın son iptal ettiği bağlantının bitişi (geçmiş gösterimi). */
  readonly lastCancelAt: Date | null;
}

/** Bekleme süreleri (gün; `connection.cooldown_after_*`, satıcı kapsamında çözülür). */
export interface CooldownSettings {
  readonly afterRejectDays: number;
  readonly afterBuyerCancelDays: number;
}

export interface QuotaState {
  /** Satıcının saat dilimindeki bugün gönderilen istekler (geri çekilenler dahil, US-022 AC2). */
  readonly sentToday: number;
  /** `null` = sınırsız. */
  readonly dailyQuota: number | null;
  readonly timeZone: string;
}

export interface RequestPolicyInput {
  readonly pair: PairState;
  readonly cooldown: CooldownSettings;
  readonly quota: QuotaState;
  readonly now: Date;
}

export type PolicyDecision =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: Extract<
        ErrorCode,
        | 'CONNECTION_ALREADY_ACTIVE'
        | 'CONNECTION_REQUEST_ALREADY_PENDING'
        | 'CONNECTION_BLOCKED'
        | 'CONNECTION_COOLDOWN_ACTIVE'
        | 'CONNECTION_DAILY_QUOTA_EXCEEDED'
      >;
      readonly details?: Readonly<Record<string, string | number>>;
    };

interface Cooldown {
  readonly until: Date;
  readonly source: 'rejected' | 'cancelled';
}

function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * MS_PER_DAY);
}

/** Süren bekleme; iki kaynak varsa geç biten. Satıcı iptali bekleme başlatmaz (US-021 AC7). */
function activeCooldown(pair: PairState, cooldown: CooldownSettings, now: Date): Cooldown | null {
  const candidates: Cooldown[] = [];
  if (pair.lastRejectedAt !== null) {
    candidates.push({
      until: addDays(pair.lastRejectedAt, cooldown.afterRejectDays),
      source: 'rejected',
    });
  }
  if (pair.lastBuyerCancelAt !== null) {
    candidates.push({
      until: addDays(pair.lastBuyerCancelAt, cooldown.afterBuyerCancelDays),
      source: 'cancelled',
    });
  }
  let latest: Cooldown | null = null;
  for (const candidate of candidates) {
    if (candidate.until.getTime() <= now.getTime()) continue;
    if (latest === null || candidate.until.getTime() > latest.until.getTime()) latest = candidate;
  }
  return latest;
}

/** `now` anından satıcının saat dilimindeki bir sonraki gece yarısına kalan saniye (≥ 1). */
export function secondsUntilLocalMidnight(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? '0');
  const elapsed = part('hour') * 3600 + part('minute') * 60 + part('second');
  return Math.max(1, SECONDS_PER_DAY - elapsed);
}

/**
 * Etkin günlük kota (Mimar K1 önerisi, kullanıcı kararı bekleniyor): ayar
 * (`connection.daily_request_quota`) ile plan hakkının (`connection_requests.daily`) küçüğü;
 * hak `null` (sınırsız) ise ayar. Karar değişirse yalnız bu fonksiyon değişir.
 */
export function effectiveDailyQuota(setting: number, entitlement: number | null): number {
  return entitlement === null ? setting : Math.min(setting, entitlement);
}

/** `ConnectionPolicy.canRequest` (c4): ilk ihlal edilen kural döner. */
export function canRequest(input: RequestPolicyInput): PolicyDecision {
  const { pair } = input;
  if (pair.activeConnection) return { ok: false, code: 'CONNECTION_ALREADY_ACTIVE' };
  if (pair.pendingRequest) return { ok: false, code: 'CONNECTION_REQUEST_ALREADY_PENDING' };
  if (pair.blocked) return { ok: false, code: 'CONNECTION_BLOCKED' };
  const cooldown = activeCooldown(pair, input.cooldown, input.now);
  if (cooldown !== null) {
    return {
      ok: false,
      code: 'CONNECTION_COOLDOWN_ACTIVE',
      details: { cooldownUntil: cooldown.until.toISOString() },
    };
  }
  const { quota } = input;
  if (quota.dailyQuota !== null && quota.sentToday >= quota.dailyQuota) {
    return {
      ok: false,
      code: 'CONNECTION_DAILY_QUOTA_EXCEEDED',
      details: { retryAfter: secondsUntilLocalMidnight(input.now, quota.timeZone) },
    };
  }
  return { ok: true };
}

export type RelationStatus = 'none' | 'pending' | 'active' | 'rejected' | 'cancelled' | 'blocked';

export interface Relation {
  readonly status: RelationStatus;
  readonly cooldownUntil: string | null;
  /** Çift kuralları istek göndermeye izin veriyor mu (kota satıcıya aittir, burada yok). */
  readonly canRequest: boolean;
}

/** Dizin kartındaki ilişki (openapi `DirectoryBuyer.relation`), satıcının bakışı. */
export function relationOf(pair: PairState, cooldown: CooldownSettings, now: Date): Relation {
  if (pair.activeConnection) return { status: 'active', cooldownUntil: null, canRequest: false };
  if (pair.pendingRequest) return { status: 'pending', cooldownUntil: null, canRequest: false };
  if (pair.blocked) return { status: 'blocked', cooldownUntil: null, canRequest: false };
  const active = activeCooldown(pair, cooldown, now);
  if (active !== null) {
    return { status: active.source, cooldownUntil: active.until.toISOString(), canRequest: false };
  }
  const rejected = pair.lastRejectedAt?.getTime() ?? null;
  const cancelled = pair.lastCancelAt?.getTime() ?? null;
  if (rejected === null && cancelled === null) {
    return { status: 'none', cooldownUntil: null, canRequest: true };
  }
  const status = (cancelled ?? -1) >= (rejected ?? -1) ? 'cancelled' : 'rejected';
  return { status, cooldownUntil: null, canRequest: true };
}

/**
 * Kabulde bağlantının başlangıç vadesi (F2.13a K1, Mimar onayı; kullanıcı kararı bekliyor):
 * perakendeci kabul ederken önerilen vadeyi gördüğü için önerilen vade yazılır; öneri yoksa `0`.
 * Karar değişirse bu fonksiyon ve `0023` `connections_guard` (Müfettiş 17 M2) birlikte değişir.
 */
export function initialPaymentTermDays(proposedPaymentTermDays: number | null): number {
  return proposedPaymentTermDays ?? 0;
}
