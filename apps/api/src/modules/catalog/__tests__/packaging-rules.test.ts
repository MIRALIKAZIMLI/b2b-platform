// F3.3a-AC2 ambalaj kuralları (kart K4), temel birime dönüşüm ve sipariş miktarı denetimi.
import type { PackagingLevel } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import {
  checkOrderQuantity,
  type PackagingShape,
  packagingProblems,
  toBaseQty,
  type UnitFacts,
} from '../packaging-rules';

const UNITS = new Map<string, UnitFacts>([
  ['H87', { allowsDecimal: false }],
  ['XCT', { allowsDecimal: false }],
  ['XPX', { allowsDecimal: false }],
  ['XPK', { allowsDecimal: false }],
  ['KGM', { allowsDecimal: true }],
]);

function pack(
  level: PackagingLevel,
  unitCode: string,
  baseQty: string,
  extra: Partial<PackagingShape> = {},
): PackagingShape {
  return {
    level,
    unitCode,
    baseQty,
    isSalesUnit: false,
    minOrderQty: '1',
    orderMultiple: '1',
    ...extra,
  };
}

const SHAMPOO = [
  pack('unit', 'H87', '1'),
  pack('case', 'XCT', '24', { isSalesUnit: true, minOrderQty: '2' }),
  pack('pallet', 'XPX', '1440'),
];

describe('F3.3a-AC2 ambalaj kuralları', () => {
  it('F3.3a-AC2 geçerli zincir (adet → koli 24 → palet 60 koli) sorunsuz', () => {
    expect(packagingProblems(SHAMPOO, 'H87', UNITS, 'p')).toEqual({});
  });

  it('F3.3a-AC2 seviye tekrarı, unit seviyesi, artmayan baseQty, satış birimi yok', () => {
    expect(
      packagingProblems(
        [pack('unit', 'XCT', '2'), pack('unit', 'H87', '1'), pack('case', 'XCT', '1')],
        'H87',
        UNITS,
        'p',
      ),
    ).toEqual({
      'p.0.baseQty': ['must_be_one'],
      'p.0.unitCode': ['must_match_base_unit'],
      'p.1.level': ['duplicate'],
      'p.2.baseQty': ['not_increasing'],
      p: ['sales_unit_required'],
    });
  });

  it('F3.3a-AC2 sıra girdi sırasından bağımsız (palet önce yazılsa da)', () => {
    expect(packagingProblems([...SHAMPOO].reverse(), 'H87', UNITS, 'p')).toEqual({});
  });

  it('F3.3a-AC2 ondalığa izin vermeyen birimde tam sayı; kg ile 0,5 paket geçerli', () => {
    expect(
      packagingProblems(
        [
          pack('case', 'XCT', '24.5', {
            isSalesUnit: true,
            minOrderQty: '1.5',
            orderMultiple: '0.5',
          }),
        ],
        'H87',
        UNITS,
        'p',
      ),
    ).toEqual({
      'p.0.baseQty': ['integer_required'],
      'p.0.minOrderQty': ['integer_required'],
      'p.0.orderMultiple': ['integer_required'],
    });
    expect(
      packagingProblems([pack('inner', 'XPK', '0.5', { isSalesUnit: true })], 'KGM', UNITS, 'p'),
    ).toEqual({});
  });

  it('F3.3a-AC2 en az miktar sipariş katının katı olmalı', () => {
    expect(
      packagingProblems(
        [pack('case', 'XCT', '24', { isSalesUnit: true, minOrderQty: '3', orderMultiple: '2' })],
        'H87',
        UNITS,
        'p',
      ),
    ).toEqual({ 'p.0.minOrderQty': ['not_multiple_of_order_multiple'] });
    expect(
      packagingProblems(
        [pack('case', 'XCT', '24', { isSalesUnit: true, minOrderQty: '1', orderMultiple: '2' })],
        'H87',
        UNITS,
        'p',
      ),
    ).toEqual({ 'p.0.minOrderQty': ['not_multiple_of_order_multiple'] });
  });

  it('F3.3a-AC2 temel birime dönüşüm (ondalık hatasız)', () => {
    expect(toBaseQty({ baseQty: '24' }, '3')).toBe('72');
    expect(toBaseQty({ baseQty: '1440' }, '2')).toBe('2880');
    expect(toBaseQty({ baseQty: '0.1' }, '3')).toBe('0.3');
  });

  it('F3.3a-AC2 perakendeci yalnız satış biriminde, en az miktardan ve katlarında sipariş verir', () => {
    const caseUnit = { isSalesUnit: true, minOrderQty: '2', orderMultiple: '2' };
    const count = { allowsDecimal: false };
    expect(checkOrderQuantity(caseUnit, count, '2')).toBe('ok');
    expect(checkOrderQuantity(caseUnit, count, '6')).toBe('ok');
    expect(checkOrderQuantity(caseUnit, count, '1')).toBe('below_minimum');
    expect(checkOrderQuantity(caseUnit, count, '3')).toBe('not_multiple');
    expect(checkOrderQuantity(caseUnit, count, '2.5')).toBe('integer_required');
    expect(checkOrderQuantity({ ...caseUnit, isSalesUnit: false }, count, '2')).toBe(
      'not_sales_unit',
    );
    expect(checkOrderQuantity(caseUnit, count, '0')).toBe('invalid');
    expect(checkOrderQuantity(caseUnit, count, '-2')).toBe('invalid');
    expect(
      checkOrderQuantity(
        { isSalesUnit: true, minOrderQty: '0.5', orderMultiple: '0.25' },
        { allowsDecimal: true },
        '0.75',
      ),
    ).toBe('ok');
  });
});
