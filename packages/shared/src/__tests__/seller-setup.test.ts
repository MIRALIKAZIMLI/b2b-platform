import { describe, expect, it } from 'vitest';
import {
  filterRegionOptions,
  normalizeAmount,
  sellerProfileFormValues,
  sellerSetupFailure,
  validateSellerProfile,
  validateWarehouse,
} from '../seller-setup';

describe('F2.6 satıcı profili formu', () => {
  const initial = sellerProfileFormValues({
    description: { az: 'Topdan', en: 'Wholesale' },
    minOrderAmount: '100.00',
    requireDeliveryPhoto: false,
  });

  it('F2.6 sunucu değeri forma dolar (yalnız az/ru/tr)', () => {
    expect(initial).toEqual({
      description: { az: 'Topdan', ru: '', tr: '' },
      minOrderAmount: '100.00',
      requireDeliveryPhoto: false,
    });
    expect(sellerProfileFormValues(undefined).minOrderAmount).toBe('');
  });

  it('F2.6 yalnız değişen alanlar gönderilir; boş tutar null olur', () => {
    expect(validateSellerProfile(initial, initial)).toEqual({ ok: true, body: {} });
    const changed = validateSellerProfile(
      {
        description: { az: 'Topdan', ru: ' Оптом ', tr: '' },
        minOrderAmount: '',
        requireDeliveryPhoto: true,
      },
      initial,
    );
    expect(changed).toEqual({
      ok: true,
      body: {
        description: { az: 'Topdan', ru: 'Оптом' },
        minOrderAmount: null,
        requireDeliveryPhoto: true,
      },
    });
  });

  it('F2.6 tüm diller boşsa tanıtım metni silinir (null)', () => {
    const result = validateSellerProfile(
      { ...initial, description: { az: ' ', ru: '', tr: '' } },
      initial,
    );
    expect(result).toEqual({ ok: true, body: { description: null } });
  });

  it('F2.6 minimum tutar: virgül kabul, negatif / 3 ondalık / harf reddedilir', () => {
    expect(normalizeAmount(' 1 250,5 ')).toBe('1250.5');
    expect(validateSellerProfile({ ...initial, minOrderAmount: '150,5' }, initial)).toEqual({
      ok: true,
      body: { minOrderAmount: '150.5' },
    });
    for (const value of ['-5', '1.234', 'abc', '1e3', '1234567890123']) {
      expect(validateSellerProfile({ ...initial, minOrderAmount: value }, initial)).toEqual({
        ok: false,
        errors: { minOrderAmount: 'invalid_amount' },
      });
    }
  });

  it('F2.6 tanıtım metni 2000 karakteri geçemez', () => {
    const result = validateSellerProfile(
      { ...initial, description: { az: 'a'.repeat(2001), ru: '', tr: '' } },
      initial,
    );
    expect(result).toEqual({ ok: false, errors: { 'description.az': 'too_long' } });
  });
});

describe('F2.6 depo formu', () => {
  it('US-011-AC1 ad zorunlu, adres isteğe bağlı', () => {
    expect(validateWarehouse({ name: '  ', addressLine: '' })).toEqual({
      ok: false,
      errors: { name: 'required' },
    });
    expect(validateWarehouse({ name: ' Ana depo ', addressLine: '' })).toEqual({
      ok: true,
      body: { name: 'Ana depo' },
    });
    expect(validateWarehouse({ name: 'A', addressLine: ' Bakı ' })).toEqual({
      ok: true,
      body: { name: 'A', addressLine: 'Bakı' },
    });
    expect(validateWarehouse({ name: 'a'.repeat(121), addressLine: 'b'.repeat(301) })).toEqual({
      ok: false,
      errors: { name: 'too_long', addressLine: 'too_long' },
    });
  });

  it('US-011-AC2 hak sınırı plan yükseltme mesajına, 409 varsayılan kuralına eşlenir', () => {
    expect(sellerSetupFailure({ code: 'ENTITLEMENT_LIMIT_REACHED' })).toEqual({
      kind: 'plan_limit',
    });
    expect(sellerSetupFailure({ code: 'INVALID_STATE_TRANSITION' })).toEqual({
      kind: 'default_rule',
    });
    expect(sellerSetupFailure({ code: 'NOT_FOUND' })).toEqual({ kind: 'code', code: 'NOT_FOUND' });
    expect(sellerSetupFailure(undefined)).toEqual({ kind: 'code', code: 'INTERNAL_ERROR' });
  });
});

describe('F2.6 hizmet bölgesi araması', () => {
  it('F2.6 harf duyarsız süzer', () => {
    const options = [
      { id: '1', label: 'Bakı' },
      { id: '2', label: 'Gəncə' },
      { id: '3', label: 'Bakı · Yasamal' },
    ];
    expect(filterRegionOptions(options, 'bak', 'az').map((o) => o.id)).toEqual(['1', '3']);
    expect(filterRegionOptions(options, '', 'az')).toHaveLength(3);
    expect(filterRegionOptions(options, 'GƏN', 'az').map((o) => o.id)).toEqual(['2']);
  });
});
