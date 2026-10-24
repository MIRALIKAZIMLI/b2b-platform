import { describe, expect, it } from 'vitest';
import { isValidVoen, VOEN_PATTERN, voenSchema } from '../voen';

describe('VÖEN biçim doğrulaması (shared/voen.ts)', () => {
  it('F1.7-AC2: 1234567891 geçerli', () => {
    expect(isValidVoen('1234567891')).toBe(true);
    expect(isValidVoen('1234567892')).toBe(true);
  });

  it('F1.7-AC2: 1234567893 geçersiz (son hane 1 veya 2 olmalı)', () => {
    expect(isValidVoen('1234567893')).toBe(false);
    expect(isValidVoen('1234567890')).toBe(false);
  });

  it('F1.7-AC2: 9 hane geçersiz', () => {
    expect(isValidVoen('123456781')).toBe(false);
  });

  it('F1.7-AC2: 11 hane geçersiz', () => {
    expect(isValidVoen('12345678911')).toBe(false);
  });

  it('F1.7-AC2: harf geçersiz', () => {
    expect(isValidVoen('12345A7891')).toBe(false);
  });

  it('F1.7-AC2: boşluk ve boş metin geçersiz (kırpma yapılmaz)', () => {
    expect(isValidVoen(' 1234567891')).toBe(false);
    expect(isValidVoen('1234567891 ')).toBe(false);
    expect(isValidVoen('')).toBe(false);
  });

  it('F1.7-AC2: Zod şeması aynı kuralı uygular; desen openapi.yaml Voen ile aynı', () => {
    expect(voenSchema.safeParse('1234567891').success).toBe(true);
    expect(voenSchema.safeParse('1234567893').success).toBe(false);
    expect(VOEN_PATTERN.source).toBe('^[0-9]{9}[12]$');
  });
});
