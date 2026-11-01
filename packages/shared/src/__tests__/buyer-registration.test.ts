import { describe, expect, it } from 'vitest';
import {
  clampPercent,
  createIdempotencyKey,
  DATA_SHARING_TEXT_VERSION,
  emptyRegistration,
  type RegistrationValues,
  registrationFailure,
  validateRegistration,
} from '../buyer-registration';
import { settingDefault } from '../settings';

const filled: RegistrationValues = {
  fullName: '  Leyla Əliyeva ',
  legalName: 'Leyla Market',
  activityTypeId: '0190a3b4-0000-7000-8000-000000000001',
  regionId: '0190a3b4-0000-7000-8000-000000000002',
  consent: true,
};

describe('Perakendeci kayıt formu (shared/buyer-registration.ts)', () => {
  it('US-005-AC3 boş formda tüm zorunlu alanlar ve onay kutusu işaretlenir', () => {
    expect(validateRegistration(emptyRegistration())).toEqual({
      ok: false,
      fields: {
        fullName: 'required',
        legalName: 'required',
        activityTypeId: 'required',
        regionId: 'required',
        consent: 'consent_required',
      },
    });
  });

  it.each(['fullName', 'legalName', 'activityTypeId', 'regionId'] as const)(
    'US-005-AC3 yalnız %s boşsa yalnız o alan işaretlenir',
    (key) => {
      const result = validateRegistration({ ...filled, [key]: '   ' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(Object.keys(result.fields)).toEqual([key]);
    },
  );

  it('US-005-AC3 veri paylaşım metni onaylanmadan kayıt gönderilmez', () => {
    expect(validateRegistration({ ...filled, consent: false })).toEqual({
      ok: false,
      fields: { consent: 'consent_required' },
    });
  });

  it('US-005-AC1 geçerli form → kırpılmış gövde, metin sürümü ve arayüz dili', () => {
    expect(validateRegistration(filled, 'ru')).toEqual({
      ok: true,
      body: {
        fullName: 'Leyla Əliyeva',
        legalName: 'Leyla Market',
        activityTypeId: filled.activityTypeId,
        regionId: filled.regionId,
        consentVersion: 'v1',
        preferredLanguage: 'ru',
      },
    });
  });

  it('F2.3b desteklenmeyen arayüz dili gönderilmez (API varsayılanı kullanır)', () => {
    const result = validateRegistration(filled, 'en');
    expect(result.ok && 'preferredLanguage' in result.body).toBe(false);
  });

  it('F2.3b uzun ünvan (200+) alanında too_long', () => {
    const result = validateRegistration({ ...filled, legalName: 'x'.repeat(201) });
    expect(result).toEqual({ ok: false, fields: { legalName: 'too_long' } });
  });

  it('NFR-63 istemcideki metin sürümü sunucu ayarının izinli değerlerinden biri', () => {
    expect(DATA_SHARING_TEXT_VERSION).toBe(settingDefault('legal.data_sharing_version'));
  });
});

describe('Kayıt API hatası eşlemesi', () => {
  it('US-005-AC4 409 PHONE_ALREADY_REGISTERED → giriş akışı', () => {
    expect(registrationFailure({ code: 'PHONE_ALREADY_REGISTERED' })).toEqual({
      kind: 'already_registered',
    });
  });

  it('F2.3b 401 → kayıt anahtarı süresi doldu, telefon yeniden doğrulanır', () => {
    expect(registrationFailure({ code: 'UNAUTHENTICATED' })).toEqual({ kind: 'expired' });
  });

  it('US-005-AC3 422 ayrıntıları alanlara düşer; consentVersion onay kutusuna', () => {
    expect(
      registrationFailure({
        code: 'VALIDATION_FAILED',
        details: { regionId: ['not_found'], consentVersion: ['outdated'], legalName: 'weird' },
      }),
    ).toEqual({
      kind: 'fields',
      fields: { regionId: 'not_found', consent: 'outdated', legalName: 'invalid' },
    });
  });

  it('F2.3b alana bağlanamayan 422 ve diğer kodlar genel hata', () => {
    expect(
      registrationFailure({ code: 'VALIDATION_FAILED', details: { preferredLanguage: ['x'] } }),
    ).toEqual({ kind: 'general', code: 'VALIDATION_FAILED' });
    expect(registrationFailure({ code: 'RATE_LIMITED' })).toEqual({
      kind: 'general',
      code: 'RATE_LIMITED',
    });
    expect(registrationFailure(new TypeError('network'))).toEqual({
      kind: 'general',
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('Yardımcılar', () => {
  it('F2.3b idempotens anahtarı 16–64 karakter ve her çağrıda farklı', () => {
    const a = createIdempotencyKey();
    const b = createIdempotencyKey();
    expect(a).toMatch(/^reg-[0-9a-f]{32}$/);
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(a).not.toBe(b);
  });

  it('US-005-AC2 doluluk yüzdesi 0–100 aralığına sıkıştırılır', () => {
    expect(clampPercent(40)).toBe(40);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});
