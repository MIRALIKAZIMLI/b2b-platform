import { describe, expect, it } from 'vitest';
import { addressWithoutToken, appLink, isPhoneBrowser, readActivationToken } from '../token';

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

  it('F2.7b telefonda "Uygulamada aç" bağlantısı mobil şemayla aynı token’ı taşır', () => {
    expect(appLink('a+b/c')).toBe('b2b://activate?token=a%2Bb%2Fc');
    expect(isPhoneBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true);
    expect(isPhoneBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(isPhoneBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});
