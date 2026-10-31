import { describe, expect, it } from 'vitest';
import { addressWithoutToken, readActivationToken } from '../token';

describe("Aktivasyon token'ı", () => {
  it('F2.1b-AC4: token sorgudan okunur; boş, eksik veya çok uzun token yok sayılır', () => {
    expect(readActivationToken('?token=abc_DEF-123')).toBe('abc_DEF-123');
    expect(readActivationToken('?token=a%2Bb')).toBe('a+b');
    expect(readActivationToken('')).toBeUndefined();
    expect(readActivationToken('?token=')).toBeUndefined();
    expect(readActivationToken(`?token=${'x'.repeat(257)}`)).toBeUndefined();
  });

  it('F2.1b-AC4: token adresten silinir; diğer parametreler ve # korunur', () => {
    expect(addressWithoutToken('/az/activate', '?token=abc', '')).toBe('/az/activate');
    expect(addressWithoutToken('/az/activate', '?a=1&token=abc', '#x')).toBe('/az/activate?a=1#x');
  });
});
