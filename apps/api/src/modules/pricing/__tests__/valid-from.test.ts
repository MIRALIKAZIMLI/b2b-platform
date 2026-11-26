// F3.6a geçerlilik günü → an (US-034 AC6, R29).
import { describe, expect, it } from 'vitest';
import { isFutureDay, localMidnight } from '../valid-from';

describe('F3.6a geçerlilik günü', () => {
  it('F3.6a-AC6 Asia/Baku 00:00 = önceki gün 20:00Z', () => {
    expect(localMidnight('2026-11-11', 'Asia/Baku').toISOString()).toBe('2026-11-10T20:00:00.000Z');
  });

  it('F3.6a-AC6 başka dilimler ve yaz saati geçişi', () => {
    expect(localMidnight('2026-11-11', 'UTC').toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(localMidnight('2026-11-11', 'Europe/Istanbul').toISOString()).toBe(
      '2026-11-10T21:00:00.000Z',
    );
    // Europe/Berlin: 29 Mart 2026 02:00'de yaz saatine geçer; gün başı hâlâ +1.
    expect(localMidnight('2026-03-29', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(localMidnight('2026-03-30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
  });

  it('F3.6a-AC6 ileri gün: Baku 23:59 iken yarın ileri, bugün değil; 00:01 iken gün döner', () => {
    const lateEvening = new Date('2026-11-10T19:59:00Z'); // Baku 2026-11-10 23:59
    expect(isFutureDay('2026-11-11', lateEvening, 'Asia/Baku')).toBe(true);
    expect(isFutureDay('2026-11-10', lateEvening, 'Asia/Baku')).toBe(false);
    const afterMidnight = new Date('2026-11-10T20:01:00Z'); // Baku 2026-11-11 00:01
    expect(isFutureDay('2026-11-11', afterMidnight, 'Asia/Baku')).toBe(false);
    expect(isFutureDay('2026-11-12', afterMidnight, 'Asia/Baku')).toBe(true);
  });
});
