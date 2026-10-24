import { describe, expect, it } from 'vitest';
import { Clock, FixedClock, SystemClock } from '../clock';

describe('Clock', () => {
  it('SystemClock şimdiki zamanı verir', () => {
    const clock: Clock = new SystemClock();
    const before = Date.now();
    const now = clock.now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('FixedClock verilen zamanı verir; set ve advance ile değişir', () => {
    const clock = new FixedClock(new Date('2026-10-24T10:00:00.000Z'));

    expect(clock.now().toISOString()).toBe('2026-10-24T10:00:00.000Z');
    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-10-24T10:01:30.000Z');
    clock.set(new Date('2027-01-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('FixedClock dönen tarihi değiştirmek saati değiştirmez', () => {
    const clock = new FixedClock(new Date('2026-10-24T10:00:00.000Z'));

    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-10-24T10:00:00.000Z');
  });
});
