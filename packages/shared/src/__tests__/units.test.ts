// F3.1 birim kataloğu (US-028): paylaşılan doğrulama ve form kuralları.
import { describe, expect, it } from 'vitest';
import {
  unitAbbreviationSchema,
  unitCodeSchema,
  unitConversionFormBody,
  unitFactorSchema,
  unitFailure,
  unitFormBody,
  type UnitFormValues,
} from '../units';

const TEXT = { az: 'Kiloqram', ru: 'Килограмм', tr: 'Kilogram', en: '' };
const ABBR = { az: 'kq', ru: 'кг', tr: 'kg', en: '' };

describe('F3.1 birim kuralları', () => {
  it('F3.1-AC1 kod UN/ECE biçiminde (2–3 büyük harf/rakam)', () => {
    expect(unitCodeSchema.safeParse('KGM').success).toBe(true);
    expect(unitCodeSchema.safeParse('H87').success).toBe(true);
    expect(unitCodeSchema.safeParse('kgm').success).toBe(false);
    expect(unitCodeSchema.safeParse('KGMX').success).toBe(false);
    expect(unitAbbreviationSchema.safeParse({ az: 'kq', ru: 'кг' }).success).toBe(false);
  });

  it('F3.1-AC2 oran sıfırdan büyük, en çok 6 ondalık', () => {
    expect(unitFactorSchema.safeParse('1000').success).toBe(true);
    expect(unitFactorSchema.safeParse('0.000001').success).toBe(true);
    expect(unitFactorSchema.safeParse('0').success).toBe(false);
    expect(unitFactorSchema.safeParse('0.000').success).toBe(false);
    expect(unitFactorSchema.safeParse('-1').success).toBe(false);
    expect(unitFactorSchema.safeParse('1.1234567').success).toBe(false);
  });

  it('F3.1-AC1 form: yeni birimde kod büyük harfe çevrilir; düzenlemede kod ve tür gönderilmez', () => {
    const values: UnitFormValues = {
      code: ' kgm ',
      kind: 'weight',
      name: TEXT,
      abbreviation: ABBR,
      allowsDecimal: true,
    };
    expect(unitFormBody(values, 'create')).toEqual({
      ok: true,
      body: {
        code: 'KGM',
        kind: 'weight',
        name: { az: 'Kiloqram', ru: 'Килограмм', tr: 'Kilogram' },
        abbreviation: { az: 'kq', ru: 'кг', tr: 'kg' },
        allowsDecimal: true,
      },
    });
    const edit = unitFormBody(values, 'edit');
    expect(edit.ok && 'code' in edit.body).toBe(false);
    expect(
      unitFormBody({ ...values, code: 'K', abbreviation: { ...ABBR, ru: '' } }, 'create'),
    ).toEqual({
      ok: false,
      errors: { code: 'invalid', 'abbreviation.ru': 'required' },
    });
  });

  it('F3.1-AC2 dönüşüm formu: virgül noktaya çevrilir; aynı birim ve geçersiz oran hata', () => {
    expect(unitConversionFormBody({ fromCode: 'KGM', toCode: 'GRM', factor: '1000,5' })).toEqual({
      ok: true,
      body: { fromCode: 'KGM', toCode: 'GRM', factor: '1000.5' },
    });
    expect(unitConversionFormBody({ fromCode: 'KGM', toCode: 'KGM', factor: 'x' })).toEqual({
      ok: false,
      errors: { toCode: 'invalid', factor: 'invalid' },
    });
  });

  it('F3.1 API hatası ekran mesajına eşlenir', () => {
    expect(unitFailure({ code: 'VALIDATION_FAILED', details: { code: ['taken'] } })).toEqual({
      kind: 'unit',
      reason: 'code_taken',
    });
    expect(
      unitFailure({ code: 'VALIDATION_FAILED', details: { toCode: ['reverse_exists'] } }),
    ).toEqual({ kind: 'unit', reason: 'reverse_exists' });
    expect(unitFailure({ code: 'PERMISSION_DENIED' })).toEqual({
      kind: 'code',
      code: 'PERMISSION_DENIED',
    });
  });
});
