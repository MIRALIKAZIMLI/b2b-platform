import { describe, expect, it } from 'vitest';
import { parsePhoneE164 } from '../phone';

describe('telefon doğrulama (PhoneE164, libphonenumber-js)', () => {
  it('geçerli Azerbaycan mobil numarası ve ülke kodu', () => {
    expect(parsePhoneE164('+994501234567')).toEqual({
      e164: '+994501234567',
      countryCode: '+994',
    });
  });

  it('başka ülkenin geçerli numarası kendi ülke koduyla döner', () => {
    expect(parsePhoneE164('+905321234567')).toEqual({
      e164: '+905321234567',
      countryCode: '+90',
    });
  });

  it('E.164 olmayan veya geçersiz numara reddedilir', () => {
    for (const raw of [
      '',
      '994501234567',
      '+994 50 123 45 67',
      '+99412',
      '+9945012345678901',
      '+0994501234567',
      '+994001234567',
    ]) {
      expect(parsePhoneE164(raw), raw).toBeUndefined();
    }
  });
});
