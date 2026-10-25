import { describe, expect, it } from 'vitest';
import { generateOtpCode, hashOtpCode, ipKey, otpCodeMatches, phoneKey } from '../otp-code';

const KEY = 'test-only-otp-hash-key-0123456789abcdef';
const CHALLENGE = '0190f1a2-0000-7000-8000-000000000001';

describe('OTP kodu ve özeti (Mimar kararı 1)', () => {
  it('US-001 AC1: kod 6 hanelidir (baştaki sıfırlar korunur)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it('özet HMAC-SHA256 hex; kodun kendisini içermez', () => {
    const hash = hashOtpCode(KEY, CHALLENGE, '012345');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('012345');
    expect(hashOtpCode(KEY, CHALLENGE, '012345')).toBe(hash);
  });

  it('doğru kod eşleşir; yanlış kod, başka challenge veya başka anahtar eşleşmez', () => {
    const hash = hashOtpCode(KEY, CHALLENGE, '482913');

    expect(otpCodeMatches(KEY, CHALLENGE, '482913', hash)).toBe(true);
    expect(otpCodeMatches(KEY, CHALLENGE, '482914', hash)).toBe(false);
    expect(otpCodeMatches(KEY, '0190f1a2-0000-7000-8000-000000000002', '482913', hash)).toBe(false);
    expect(otpCodeMatches(`${KEY}-other`, CHALLENGE, '482913', hash)).toBe(false);
  });

  it('bozuk veya kısa özet hata atmadan reddedilir', () => {
    expect(otpCodeMatches(KEY, CHALLENGE, '482913', '')).toBe(false);
    expect(otpCodeMatches(KEY, CHALLENGE, '482913', 'abcd')).toBe(false);
  });

  it('Redis anahtarları telefonu ve IP adresini düz içermez', () => {
    const phone = phoneKey(KEY, '+994501234567');
    const ip = ipKey(KEY, '127.0.0.1');

    expect(phone).toMatch(/^[0-9a-f]{64}$/);
    expect(phone).not.toContain('994501234567');
    expect(ip).not.toContain('127.0.0.1');
    expect(phoneKey(KEY, '+994501234567')).toBe(phone);
  });
});
