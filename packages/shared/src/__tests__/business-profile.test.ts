// F2.4 profil / VÖEN formu (US-006 AC1–AC3): istemci doğrulaması ve API hatası eşlemesi.
import { describe, expect, it } from 'vitest';
import {
  legalTypeHint,
  profileFailure,
  profileFormValues,
  validateProfile,
  voenStatus,
} from '../business-profile';

const initial = profileFormValues({
  legalName: 'Leyla Market',
  regionId: 'r1',
  voen: null,
  contactName: 'Leyla Əliyeva',
});

describe('validateProfile', () => {
  it('US-006-AC1: 10 haneli olmayan veya son hanesi 1/2 olmayan VÖEN reddedilir', () => {
    for (const voen of ['123456789', '12345678901', '123456789a', '1234567893', ' 1234567891']) {
      expect(validateProfile({ ...initial, voen }, initial)).toEqual({
        ok: false,
        fields: { voen: 'voen_invalid' },
      });
    }
  });

  it('US-006-AC2: geçerli VÖEN gövdeye girer; değişmeyen alanlar gönderilmez', () => {
    expect(validateProfile({ ...initial, voen: '1234567891' }, initial)).toEqual({
      ok: true,
      body: { voen: '1234567891' },
    });
    expect(validateProfile(initial, initial)).toEqual({ ok: true, body: {} });
  });

  it('F2.4-K3: girilmiş VÖEN silinemez; zorunlu ünvan boş olamaz; telefon biçimi', () => {
    const withVoen = { ...initial, voen: '1234567891' };
    expect(validateProfile({ ...withVoen, voen: '' }, withVoen)).toEqual({
      ok: false,
      fields: { voen: 'voen_invalid' },
    });
    expect(validateProfile({ ...initial, legalName: ' ', businessPhone: 'abc' }, initial)).toEqual({
      ok: false,
      fields: { legalName: 'required', businessPhone: 'phone_invalid' },
    });
  });
});

describe('F2.10b kişisel veri alanları', () => {
  it('F2.10b-AC1: yetkili adı zorunlu; kişisel telefon E.164, e-posta biçimi denetlenir', () => {
    expect(
      validateProfile(
        { ...initial, contactName: ' ', personalPhone: '050 123 45 67', email: 'a@' },
        initial,
      ),
    ).toEqual({
      ok: false,
      fields: { contactName: 'required', personalPhone: 'phone_invalid', email: 'email_invalid' },
    });
    expect(
      validateProfile(
        { ...initial, contactName: 'Rəşad', personalPhone: '+994501234567', email: 'a@b.az' },
        initial,
      ),
    ).toEqual({
      ok: true,
      body: { contactName: 'Rəşad', personalPhone: '+994501234567', email: 'a@b.az' },
    });
  });

  it('F2.10b-V5: boşaltılan kişisel telefon ve e-posta null gider; boş adres gönderilmez', () => {
    const filled = {
      ...initial,
      personalPhone: '+994501234567',
      email: 'a@b.az',
      addressLine: 'X',
    };
    expect(
      validateProfile({ ...filled, personalPhone: '', email: '', addressLine: '' }, filled),
    ).toEqual({ ok: true, body: { personalPhone: null, email: null } });
  });

  it('F2.10b: API e-posta hatası alana bağlanır', () => {
    expect(
      profileFailure({ code: 'VALIDATION_FAILED', details: { email: ['invalid_email'] } }),
    ).toEqual({ kind: 'fields', fields: { email: 'email_invalid' } });
  });
});

describe('profileFailure', () => {
  it('US-006-AC3: VOEN_ALREADY_REGISTERED → VÖEN alanında "kayıtlı" hatası', () => {
    expect(profileFailure({ code: 'VOEN_ALREADY_REGISTERED' })).toEqual({
      kind: 'fields',
      fields: { voen: 'voen_taken' },
    });
  });

  it('US-006-AC1: API VOEN_INVALID ayrıntısı alana bağlanır; bilinmeyen alan genel hata', () => {
    expect(
      profileFailure({ code: 'VALIDATION_FAILED', details: { voen: ['VOEN_INVALID'] } }),
    ).toEqual({ kind: 'fields', fields: { voen: 'voen_invalid' } });
    expect(profileFailure({ code: 'VALIDATION_FAILED', details: { logoFileId: ['x'] } })).toEqual({
      kind: 'general',
      code: 'VALIDATION_FAILED',
    });
    expect(profileFailure({ code: 'CAPABILITY_REQUIRED' })).toEqual({
      kind: 'fields',
      fields: { voen: 'voen_locked' },
    });
    expect(profileFailure(undefined)).toEqual({ kind: 'general', code: 'INTERNAL_ERROR' });
  });
});

describe('voenStatus / legalTypeHint', () => {
  it('US-006-AC2: VÖEN girilince "doğrulama bekliyor"; hukuki tip son haneden', () => {
    expect(voenStatus({ voen: null })).toBe('missing');
    expect(voenStatus({ voen: '1234567891', verified: false })).toBe('pending');
    expect(voenStatus({ voen: '1234567891', verified: true })).toBe('verified');
    expect(legalTypeHint('1234567891')).toBe('legal_entity');
    expect(legalTypeHint('1234567892')).toBe('individual_entrepreneur');
    expect(legalTypeHint('123')).toBeUndefined();
  });
});
