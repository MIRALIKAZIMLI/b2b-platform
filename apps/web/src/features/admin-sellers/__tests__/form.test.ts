import { describe, expect, it } from 'vitest';
import { ApiError, planOptions, regionOptions } from '../api';
import { apiFormErrors, emptySellerForm, type SellerFormValues, validateSellerForm } from '../form';

const valid: SellerFormValues = {
  ...emptySellerForm(),
  legalName: ' Topdan MMC ',
  voen: '1234567891',
  regionId: 'r1',
  ownerName: 'Əli',
  ownerPhone: '+994501234567',
  planId: 'p1',
  serviceAreaRegionIds: ['r2'],
};

describe('Toptancı formu', () => {
  it('F2.1b-AC1: varsayılan para birimi AZN, saat dilimi Asia/Baku (D17)', () => {
    expect(emptySellerForm()).toMatchObject({ currency: 'AZN', timezone: 'Asia/Baku' });
  });

  it('F2.1b-AC1: geçerli form → API gövdesi; boş adres gönderilmez, metin kırpılır', () => {
    const result = validateSellerForm(valid);
    expect(result).toEqual({
      ok: true,
      body: {
        legalName: 'Topdan MMC',
        voen: '1234567891',
        regionId: 'r1',
        ownerName: 'Əli',
        ownerPhone: '+994501234567',
        planId: 'p1',
        serviceAreaRegionIds: ['r2'],
        currency: 'AZN',
        timezone: 'Asia/Baku',
      },
    });
    const withAddress = validateSellerForm({ ...valid, addressLine: 'Nizami 1' });
    expect(withAddress.ok && withAddress.body.addressLine).toBe('Nizami 1');
  });

  it('F2.1b-AC1: eksik ve yanlış alanlar alan hatası olur', () => {
    const result = validateSellerForm({
      ...emptySellerForm(),
      voen: '1234567893',
      currency: 'azn',
    });
    expect(result).toEqual({
      ok: false,
      fields: {
        legalName: 'required',
        voen: 'VOEN_INVALID',
        regionId: 'required',
        ownerName: 'required',
        ownerPhone: 'required',
        planId: 'required',
        currency: 'invalid_currency',
      },
    });
  });

  it('F2.1b-AC3: 409 VOEN_ALREADY_REGISTERED → VÖEN alanında hata', () => {
    expect(apiFormErrors({ code: 'VOEN_ALREADY_REGISTERED', message: 'x' })).toEqual({
      fields: { voen: 'VOEN_ALREADY_REGISTERED' },
    });
  });

  it('F2.1b-AC1: 422 details alanlara; bilinmeyen neden "invalid", bilinmeyen alan genel hata', () => {
    expect(
      apiFormErrors({
        code: 'VALIDATION_FAILED',
        details: {
          ownerPhone: ['invalid_phone'],
          'serviceAreaRegionIds.0': ['not_found'],
          timezone: ['Too long'],
        },
      }),
    ).toEqual({
      fields: {
        ownerPhone: 'invalid_phone',
        serviceAreaRegionIds: 'not_found',
        timezone: 'invalid',
      },
    });
    expect(apiFormErrors({ code: 'VALIDATION_FAILED', details: { applicationId: ['x'] } })).toEqual(
      {
        fields: {},
        general: 'VALIDATION_FAILED',
      },
    );
    expect(apiFormErrors(new TypeError('network'))).toEqual({
      fields: {},
      general: 'INTERNAL_ERROR',
    });
    expect(apiFormErrors({ code: 'FORBIDDEN' })).toEqual({ fields: {}, general: 'FORBIDDEN' });
  });

  it('F2.1b-AC1: plan listesi yalnız etkin seller planları; bölge etiketi "şehir · rayon"', () => {
    const plan = (id: string, capability: 'seller' | 'buyer', isActive: boolean) => ({
      id,
      code: id,
      name: { az: `Plan ${id}`, ru: `Тариф ${id}` },
      capability,
      price: '0',
      currencyCode: 'AZN',
      period: 'month' as const,
      isActive,
    });
    expect(
      planOptions(
        [plan('a', 'seller', true), plan('b', 'buyer', true), plan('c', 'seller', false)],
        'ru',
      ),
    ).toEqual([{ id: 'a', label: 'Тариф a' }]);

    const city = {
      id: 'c',
      countryCode: 'AZ',
      parentId: null,
      type: 'city' as const,
      name: { az: 'Bakı' },
    };
    const district = {
      id: 'd',
      countryCode: 'AZ',
      parentId: 'c',
      type: 'district' as const,
      name: { az: 'Nəsimi' },
    };
    expect(regionOptions([city, district], 'tr')).toEqual([
      { id: 'c', label: 'Bakı' },
      { id: 'd', label: 'Bakı · Nəsimi' },
    ]);
  });
});

describe('API hatası', () => {
  it('F2.1b-AC3: ApiError kodu ve ayrıntıları korur (409, 422, gövdesiz 403)', () => {
    expect(apiFormErrors(new ApiError({ code: 'VOEN_ALREADY_REGISTERED' }, 409))).toEqual({
      fields: { voen: 'VOEN_ALREADY_REGISTERED' },
    });
    expect(
      apiFormErrors(
        new ApiError({ code: 'VALIDATION_FAILED', details: { voen: ['VOEN_INVALID'] } }, 422),
      ),
    ).toEqual({ fields: { voen: 'VOEN_INVALID' } });
    expect(new ApiError(undefined, 403).code).toBe('FORBIDDEN');
    expect(new ApiError(undefined, 500).code).toBe('INTERNAL_ERROR');
  });
});
