import { describe, expect, it } from 'vitest';
import { DIRECTORY_BUYER_KEYS, parseExactLookup } from '../directory';

describe('F2.11b dizin (paylaşılan)', () => {
  it('F2.11b-AC7 tam eşleşme kutusu: telefon ve VÖEN tanınır, kısmi değer tanınmaz', () => {
    expect(parseExactLookup(' +994 (50) 123-45-67 ')).toEqual({ phone: '+994501234567' });
    expect(parseExactLookup('1234567891')).toEqual({ voen: '1234567891' });
    expect(parseExactLookup('123456789')).toBeUndefined();
    expect(parseExactLookup('1234567893')).toBeUndefined();
    expect(parseExactLookup('+99450')).toBeUndefined();
    expect(parseExactLookup('0501234567')).toBeUndefined();
  });

  it('F2.11b-AC9 yanıt anahtar listesinde bağlantı/alım alanı yok', () => {
    const keys: readonly string[] = DIRECTORY_BUYER_KEYS;
    for (const forbidden of [
      'connections',
      'purchaseVolume',
      'orders',
      'sellers',
      'listedInDirectory',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });
});
