// F2.12a ConnectionPolicy birim testleri (test-strategy §3.2, US-021 AC1–AC7, US-022 AC2).
// Politika saftır: veritabanı ve saat yok; zaman `now` ile verilir.
import { describe, expect, it } from 'vitest';
import {
  canRequest,
  effectiveDailyQuota,
  type PairState,
  type RequestPolicyInput,
  relationOf,
  secondsUntilLocalMidnight,
} from '../connection-policy';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T08:00:00Z');
const BAKU = 'Asia/Baku';

const clean: PairState = {
  activeConnection: false,
  pendingRequest: false,
  blocked: false,
  lastRejectedAt: null,
  lastBuyerCancelAt: null,
  lastCancelAt: null,
};

function input(pair: Partial<PairState> = {}, overrides: Partial<RequestPolicyInput> = {}) {
  return {
    pair: { ...clean, ...pair },
    cooldown: { afterRejectDays: 30, afterBuyerCancelDays: 30 },
    quota: { sentToday: 0, dailyQuota: 20, timeZone: BAKU },
    now: NOW,
    ...overrides,
  } satisfies RequestPolicyInput;
}

describe('F2.12a ConnectionPolicy.canRequest', () => {
  it('US-021-AC1 temiz çift ve kota varsa izin', () => {
    expect(canRequest(input())).toEqual({ ok: true });
  });

  it('US-021-AC2 bekleyen istek → CONNECTION_REQUEST_ALREADY_PENDING', () => {
    expect(canRequest(input({ pendingRequest: true }))).toEqual({
      ok: false,
      code: 'CONNECTION_REQUEST_ALREADY_PENDING',
    });
  });

  it('US-021-AC3 aktif bağlantı → CONNECTION_ALREADY_ACTIVE', () => {
    expect(canRequest(input({ activeConnection: true }))).toEqual({
      ok: false,
      code: 'CONNECTION_ALREADY_ACTIVE',
    });
  });

  it('US-021-AC4 engel → CONNECTION_BLOCKED', () => {
    expect(canRequest(input({ blocked: true }))).toEqual({ ok: false, code: 'CONNECTION_BLOCKED' });
  });

  it('US-021-AC5 30 gün içinde red → CONNECTION_COOLDOWN_ACTIVE + bitiş tarihi', () => {
    const rejectedAt = new Date(NOW.getTime() - 10 * DAY);
    expect(canRequest(input({ lastRejectedAt: rejectedAt, lastCancelAt: null }))).toEqual({
      ok: false,
      code: 'CONNECTION_COOLDOWN_ACTIVE',
      details: { cooldownUntil: new Date(rejectedAt.getTime() + 30 * DAY).toISOString() },
    });
  });

  it('US-021-AC5 perakendeci iptalinden sonra bekleme; süre bitince izin', () => {
    const cancelledAt = new Date(NOW.getTime() - 29 * DAY);
    const blocked = canRequest(
      input({ lastBuyerCancelAt: cancelledAt, lastCancelAt: cancelledAt }),
    );
    expect(blocked).toMatchObject({ ok: false, code: 'CONNECTION_COOLDOWN_ACTIVE' });
    const over = new Date(NOW.getTime() - 30 * DAY);
    expect(canRequest(input({ lastBuyerCancelAt: over, lastCancelAt: over }))).toEqual({
      ok: true,
    });
  });

  it('US-021-AC5 iki kaynak varsa geç biten bitiş tarihi döner; ayar gün sayısı kullanılır', () => {
    const rejectedAt = new Date(NOW.getTime() - 2 * DAY);
    const cancelledAt = new Date(NOW.getTime() - 1 * DAY);
    const decision = canRequest(
      input(
        { lastRejectedAt: rejectedAt, lastBuyerCancelAt: cancelledAt, lastCancelAt: cancelledAt },
        { cooldown: { afterRejectDays: 60, afterBuyerCancelDays: 7 } },
      ),
    );
    expect(decision).toEqual({
      ok: false,
      code: 'CONNECTION_COOLDOWN_ACTIVE',
      details: { cooldownUntil: new Date(rejectedAt.getTime() + 60 * DAY).toISOString() },
    });
  });

  it('US-021-AC6 kota dolu → 429 kodu ve satıcının gece yarısına kalan saniye', () => {
    // 08:00Z = Bakü 12:00 → gece yarısına 12 saat.
    expect(
      canRequest(input({}, { quota: { sentToday: 20, dailyQuota: 20, timeZone: BAKU } })),
    ).toEqual({
      ok: false,
      code: 'CONNECTION_DAILY_QUOTA_EXCEEDED',
      details: { retryAfter: 12 * 60 * 60 },
    });
    expect(
      canRequest(input({}, { quota: { sentToday: 19, dailyQuota: 20, timeZone: BAKU } })),
    ).toEqual({ ok: true });
    expect(
      canRequest(input({}, { quota: { sentToday: 5000, dailyQuota: null, timeZone: BAKU } })),
    ).toEqual({ ok: true });
  });

  it('US-021-AC7 satıcının kendi iptalinden sonra bekleme yok', () => {
    const cancelledAt = new Date(NOW.getTime() - 1 * DAY);
    expect(canRequest(input({ lastCancelAt: cancelledAt }))).toEqual({ ok: true });
  });

  it('US-022-AC2 kota sayımı çağırana aittir: geri çekilen istek dahil sayılan sayı reddeder', () => {
    // Politika yalnız sayıyı görür; geri çekilen istekler sayıma dahildir (repository testi).
    expect(
      canRequest(input({}, { quota: { sentToday: 1, dailyQuota: 1, timeZone: BAKU } })),
    ).toMatchObject({ ok: false, code: 'CONNECTION_DAILY_QUOTA_EXCEEDED' });
  });

  it('F2.12a sıra (SF-03): aktif → bekleyen → engel → bekleme → kota', () => {
    const all: Partial<PairState> = {
      activeConnection: true,
      pendingRequest: true,
      blocked: true,
      lastRejectedAt: new Date(NOW.getTime() - DAY),
    };
    const full = { quota: { sentToday: 99, dailyQuota: 1, timeZone: BAKU } };
    expect(canRequest(input(all, full))).toMatchObject({ code: 'CONNECTION_ALREADY_ACTIVE' });
    expect(canRequest(input({ ...all, activeConnection: false }, full))).toMatchObject({
      code: 'CONNECTION_REQUEST_ALREADY_PENDING',
    });
    expect(
      canRequest(input({ ...all, activeConnection: false, pendingRequest: false }, full)),
    ).toMatchObject({ code: 'CONNECTION_BLOCKED' });
    expect(
      canRequest(
        input({ ...all, activeConnection: false, pendingRequest: false, blocked: false }, full),
      ),
    ).toMatchObject({ code: 'CONNECTION_COOLDOWN_ACTIVE' });
  });
});

describe('F2.12a kota yardımcıları', () => {
  it('§3.2 Bakü 23:59 → 60 sn, 00:01 → 86.340 sn (gün satıcının saat diliminde)', () => {
    // Asia/Baku = UTC+4. 23:59 Bakü = 19:59Z.
    expect(secondsUntilLocalMidnight(new Date('2026-11-10T19:59:00Z'), BAKU)).toBe(60);
    expect(secondsUntilLocalMidnight(new Date('2026-11-10T20:01:00Z'), BAKU)).toBe(86_340);
    // Aynı an UTC'de farklı gün kalanı verir.
    expect(secondsUntilLocalMidnight(new Date('2026-11-10T19:59:00Z'), 'UTC')).toBe(4 * 3600 + 60);
  });

  it('K1 etkin kota: ayar ile plan hakkının küçüğü; hak null ise ayar', () => {
    expect(effectiveDailyQuota(20, 100)).toBe(20);
    expect(effectiveDailyQuota(20, 5)).toBe(5);
    expect(effectiveDailyQuota(20, null)).toBe(20);
    expect(effectiveDailyQuota(20, 0)).toBe(0);
  });
});

describe('F2.12a dizin ilişki durumu (relationOf)', () => {
  const cooldown = { afterRejectDays: 30, afterBuyerCancelDays: 30 };
  const rel = (pair: Partial<PairState>) => relationOf({ ...clean, ...pair }, cooldown, NOW);

  it('hiç ilişki yok → none, istek gönderilebilir', () => {
    expect(rel({})).toEqual({ status: 'none', cooldownUntil: null, canRequest: true });
  });

  it('aktif, bekleyen ve engel istek göndermeyi kapatır', () => {
    expect(rel({ activeConnection: true })).toEqual({
      status: 'active',
      cooldownUntil: null,
      canRequest: false,
    });
    expect(rel({ pendingRequest: true })).toMatchObject({ status: 'pending', canRequest: false });
    expect(rel({ blocked: true })).toMatchObject({ status: 'blocked', canRequest: false });
  });

  it('bekleme süresinde rejected/cancelled + bitiş; süre bitince yine durum, istek açık', () => {
    const rejectedAt = new Date(NOW.getTime() - DAY);
    expect(rel({ lastRejectedAt: rejectedAt })).toEqual({
      status: 'rejected',
      cooldownUntil: new Date(rejectedAt.getTime() + 30 * DAY).toISOString(),
      canRequest: false,
    });
    const old = new Date(NOW.getTime() - 40 * DAY);
    expect(rel({ lastBuyerCancelAt: old, lastCancelAt: old })).toEqual({
      status: 'cancelled',
      cooldownUntil: null,
      canRequest: true,
    });
    // Satıcı iptali: bekleme yok, geçmiş "cancelled".
    expect(rel({ lastCancelAt: new Date(NOW.getTime() - DAY) })).toEqual({
      status: 'cancelled',
      cooldownUntil: null,
      canRequest: true,
    });
  });
});
