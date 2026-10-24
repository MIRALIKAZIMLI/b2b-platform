import { describe, expect, it } from 'vitest';
import { createUuidV7Generator, UUID_V7_PATTERN, uuidv7 } from '../uuidv7';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

/** UUID'nin ilk 48 biti (milisaniye zaman damgası). */
function timestampOf(id: string): number {
  return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
}

describe('UUIDv7 (shared/uuidv7.ts, RFC 9562)', () => {
  it('sürüm 7 ve varyant 10xx bitlerini taşır', () => {
    const id = uuidv7(NOW);
    expect(id).toMatch(UUID_V7_PATTERN);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('ilk 48 bit verilen milisaniye zamanıdır', () => {
    expect(timestampOf(uuidv7(NOW))).toBe(NOW);
  });

  it('aynı milisaniyede üretilenler benzersiz ve sıralıdır', () => {
    const next = createUuidV7Generator();
    const ids = Array.from({ length: 5000 }, () => next(NOW));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('artan zamanla üretilenler sıralıdır', () => {
    const next = createUuidV7Generator();
    const ids = [NOW, NOW + 1, NOW + 2, NOW + 1000].map((ms) => next(ms));
    expect([...ids].sort()).toEqual(ids);
  });

  it('saat geri giderse sıra bozulmaz (son zaman damgası kullanılır)', () => {
    const next = createUuidV7Generator();
    const first = next(NOW);
    const second = next(NOW - 5000);
    expect(second > first).toBe(true);
  });

  it('geçersiz zaman reddedilir', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError);
    expect(() => uuidv7(1.5)).toThrow(RangeError);
    expect(() => uuidv7(2 ** 48)).toThrow(RangeError);
  });
});
