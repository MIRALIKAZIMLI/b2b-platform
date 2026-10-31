import { describe, expect, it } from 'vitest';
import { compareVersions, isAppVersion } from '../version';

describe('uygulama sürümü (US-060)', () => {
  it('US-060 AC1: sayısal karşılaştırma (metin değil)', () => {
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('0.0.0', '0.0.1')).toBeLessThan(0);
  });

  it('US-060 AC1: biçim dışı sürüm reddedilir', () => {
    expect(isAppVersion('1.2')).toBe(false);
    expect(isAppVersion('1.2.3-beta')).toBe(false);
    expect(isAppVersion('1.2.3')).toBe(true);
    expect(() => compareVersions('1.2', '1.2.3')).toThrow(RangeError);
  });
});
