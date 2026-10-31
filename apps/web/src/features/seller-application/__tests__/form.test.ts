import { describe, expect, it } from 'vitest';
import { sellerEntry, SELLER_MODE } from '../entry';
import {
  applicationApiErrors,
  type ApplicationFormValues,
  emptyApplicationForm,
  validateApplicationForm,
} from '../form';

const REGION = '0190f0a0-0000-7000-8000-000000000001';

function valid(overrides: Partial<ApplicationFormValues> = {}): ApplicationFormValues {
  return {
    legalName: ' Başvuru Topdan MMC ',
    voen: '1234567891',
    contactName: 'Vüsal Həsənov',
    phone: '+994501234567',
    regionId: REGION,
    categoryNote: '',
    ...overrides,
  };
}

describe('toptancı başvuru formu (F2.2b)', () => {
  it('US-008-AC1 geçerli form → API gövdesi; boşluklar kırpılır, boş not gönderilmez', () => {
    expect(validateApplicationForm(valid())).toEqual({
      ok: true,
      body: {
        legalName: 'Başvuru Topdan MMC',
        voen: '1234567891',
        contactName: 'Vüsal Həsənov',
        phone: '+994501234567',
        regionId: REGION,
      },
    });
    const withNote = validateApplicationForm(valid({ categoryNote: ' Ərzaq ' }));
    expect(withNote.ok && withNote.body.categoryNote).toBe('Ərzaq');
  });

  it('US-008-AC1 boş form → zorunlu alan hataları; not zorunlu değil', () => {
    const result = validateApplicationForm(emptyApplicationForm());
    expect(result).toEqual({
      ok: false,
      fields: {
        legalName: 'required',
        voen: 'VOEN_INVALID',
        contactName: 'required',
        phone: 'invalid_phone',
        regionId: 'required',
      },
    });
  });

  it('F2.2b sınırlar: geçersiz VÖEN, telefon, uzun not', () => {
    const result = validateApplicationForm(
      valid({ voen: '1234567893', phone: '0501234567', categoryNote: 'x'.repeat(501) }),
    );
    expect(result).toEqual({
      ok: false,
      fields: { voen: 'VOEN_INVALID', phone: 'invalid_phone', categoryNote: 'too_long' },
    });
  });

  it('US-008-AC3 409 SELLER_APPLICATION_ALREADY_PENDING → VÖEN alanında', () => {
    expect(applicationApiErrors({ code: 'SELLER_APPLICATION_ALREADY_PENDING' })).toEqual({
      fields: { voen: 'SELLER_APPLICATION_ALREADY_PENDING' },
    });
  });

  it('F2.2b 422 details alanlara; bilinmeyen alan ve diğer kodlar genel hata', () => {
    expect(
      applicationApiErrors({ code: 'VALIDATION_FAILED', details: { regionId: ['not_found'] } }),
    ).toEqual({ fields: { regionId: 'not_found' } });
    expect(applicationApiErrors({ code: 'VALIDATION_FAILED', details: { other: ['x'] } })).toEqual({
      fields: {},
      general: 'VALIDATION_FAILED',
    });
    expect(applicationApiErrors({ code: 'RATE_LIMITED' })).toEqual({
      fields: {},
      general: 'RATE_LIMITED',
    });
    expect(applicationApiErrors(new TypeError('network'))).toEqual({
      fields: {},
      general: 'INTERNAL_ERROR',
    });
  });

  it('US-008-AC2 onboarding.seller_mode = manual → toptancıya kayıt değil, yalnız başvuru yolu', () => {
    expect(SELLER_MODE).toBe('manual');
    expect(sellerEntry('manual', 'az')).toEqual({
      kind: 'application',
      href: '/az/seller-application',
    });
  });
});
