// İlk abonelik dönemi (F2.1a, Mimar kararı: işletme saat diliminde bugün → +1 dönem −1 gün).
import { describe, expect, it } from 'vitest';
import { firstSubscriptionPeriod, localDate } from '../subscription-period';

describe('ilk abonelik dönemi', () => {
  it('F2.1a-AC1: aylık plan — bugün → bir ay sonrasının bir gün öncesi', () => {
    const now = new Date('2026-10-31T10:00:00Z');
    expect(firstSubscriptionPeriod(now, 'Asia/Baku', 'month')).toEqual({
      start: '2026-10-31',
      end: '2026-11-29',
    });
    expect(firstSubscriptionPeriod(new Date('2026-03-15T08:00:00Z'), 'Asia/Baku', 'month')).toEqual(
      { start: '2026-03-15', end: '2026-04-14' },
    );
  });

  it('F2.1a-AC1: yıllık plan ve yıl geçişi', () => {
    expect(firstSubscriptionPeriod(new Date('2026-12-20T08:00:00Z'), 'Asia/Baku', 'year')).toEqual({
      start: '2026-12-20',
      end: '2027-12-19',
    });
    expect(firstSubscriptionPeriod(new Date('2026-12-20T08:00:00Z'), 'Asia/Baku', 'month')).toEqual(
      { start: '2026-12-20', end: '2027-01-19' },
    );
  });

  it('F2.1a-AC1: ay sonu kırpılır (31 Ocak → 27 Şubat; artık yılda 28 Şubat)', () => {
    expect(firstSubscriptionPeriod(new Date('2027-01-31T08:00:00Z'), 'Asia/Baku', 'month')).toEqual(
      { start: '2027-01-31', end: '2027-02-27' },
    );
    expect(firstSubscriptionPeriod(new Date('2028-01-31T08:00:00Z'), 'Asia/Baku', 'month')).toEqual(
      { start: '2028-01-31', end: '2028-02-28' },
    );
  });

  it('F2.1a-AC1: gün işletmenin saat diliminde (Bakü UTC+4)', () => {
    // 2026-10-31 21:30 UTC = 2026-11-01 01:30 Bakü
    const lateUtc = new Date('2026-10-31T21:30:00Z');
    expect(localDate(lateUtc, 'Asia/Baku')).toBe('2026-11-01');
    expect(localDate(lateUtc, 'UTC')).toBe('2026-10-31');
    expect(firstSubscriptionPeriod(lateUtc, 'Asia/Baku', 'month').start).toBe('2026-11-01');
  });
});
