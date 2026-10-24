import { UUID_V7_PATTERN } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../clock';
import { UuidV7IdGenerator } from '../id-generator';

describe('IdGenerator (UUIDv7)', () => {
  it('zaman damgasını Clock’tan alır', () => {
    const clock = new FixedClock(new Date('2026-10-25T12:00:00.000Z'));
    const id = new UuidV7IdGenerator(clock).next();

    expect(id).toMatch(UUID_V7_PATTERN);
    const ms = Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
    expect(ms).toBe(clock.now().getTime());
  });

  it('saat durduğunda da benzersiz ve sıralı kimlik üretir', () => {
    const generator = new UuidV7IdGenerator(new FixedClock(new Date('2026-10-25T12:00:00.000Z')));
    const ids = Array.from({ length: 100 }, () => generator.next());

    expect(new Set(ids).size).toBe(100);
    expect([...ids].sort()).toEqual(ids);
  });
});
