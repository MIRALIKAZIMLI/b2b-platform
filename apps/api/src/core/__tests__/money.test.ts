import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors/domain-error';
import {
  add,
  applyDiscountPercent,
  compare,
  fromDecimalString,
  multiply,
  roundLineTotal,
  roundUnitPrice,
  subtract,
  toDecimalString,
  ZERO,
} from '../money';

const m = fromDecimalString;

describe('money: yuvarlama (test-strategy P11, yarım yukarı)', () => {
  it('F1.2-AC8: 0.125 → 0.13 (satır toplamı 2 hane)', () => {
    expect(toDecimalString(roundLineTotal(m('0.125')), 2)).toBe('0.13');
  });

  it('F1.2-AC8: yarım yukarı, bankacı yuvarlaması değil (0.135 → 0.14, 0.145 → 0.15)', () => {
    expect(toDecimalString(roundLineTotal(m('0.135')), 2)).toBe('0.14');
    expect(toDecimalString(roundLineTotal(m('0.145')), 2)).toBe('0.15');
    expect(toDecimalString(roundLineTotal(m('0.124')), 2)).toBe('0.12');
  });

  it('F1.2-AC8: negatif değer sıfırdan uzağa yuvarlanır (−0.125 → −0.13)', () => {
    expect(toDecimalString(roundLineTotal(m('-0.125')), 2)).toBe('-0.13');
    expect(toDecimalString(roundLineTotal(m('-0.124')), 2)).toBe('-0.12');
  });

  it('F1.2-AC8: 2.00005 birim fiyat → 2.0001 (4 hane)', () => {
    const unitPrice = multiply(m('4.0001'), m('0.5'));
    expect(unitPrice.toString()).toBe('2.00005');
    expect(toDecimalString(roundUnitPrice(unitPrice), 4)).toBe('2.0001');
  });

  it('sıfıra yuvarlanan negatif değer "-0.00" değil "0.00" yazılır', () => {
    expect(toDecimalString(roundLineTotal(m('-0.004')), 2)).toBe('0.00');
  });
});

describe('money: hesap', () => {
  it('F1.2-AC8: toplama/çarpma decimal ile (0.1 + 0.2 = 0.3)', () => {
    expect(toDecimalString(add(m('0.1'), m('0.2')), 2)).toBe('0.30');
    expect(add(m('0.1'), m('0.2')).equals(m('0.3'))).toBe(true);
    expect(toDecimalString(multiply(m('19.99'), m('3')), 2)).toBe('59.97');
    expect(toDecimalString(subtract(m('10'), m('0.01')), 2)).toBe('9.99');
    expect(toDecimalString(add(ZERO, m('12.5')), 2)).toBe('12.50');
  });

  it('satır toplamı: birim fiyat × miktar, 2 haneye', () => {
    // 3.3333 × 3 = 9.9999 → 10.00
    expect(toDecimalString(roundLineTotal(multiply(m('3.3333'), m('3'))), 2)).toBe('10.00');
  });

  it('toDecimalString istenen hane sayısını sabit yazar', () => {
    expect(toDecimalString(m('12.5'), 2)).toBe('12.50');
    expect(toDecimalString(m('12.5'), 4)).toBe('12.5000');
    expect(toDecimalString(m('7'), 2)).toBe('7.00');
  });
});

describe('money: dönüşüm (openapi Decimal şeması)', () => {
  it.each(['0', '12', '12.5', '-3.25', '1.2345', '1000000000000.0001'])(
    'geçerli metin okunur: %s',
    (text) => {
      expect(m(text).equals(m(text))).toBe(true);
    },
  );

  it.each(['', ' 1', '1.', '.5', '1,5', '1.23456', '1e3', 'NaN', 'Infinity', '+1', '0x10'])(
    'geçersiz metin reddedilir: "%s"',
    (text) => {
      expect(() => m(text)).toThrow(DomainError);
    },
  );

  it('F1.2-AC8: number girişi tip hatası', () => {
    // @ts-expect-error number kabul edilmez; para yalnızca metinden okunur.
    expect(() => fromDecimalString(0.1)).toThrow(TypeError);
    // @ts-expect-error Money yerine number verilemez.
    expect(() => add(m('1'), 2)).toThrow(TypeError);
    // @ts-expect-error Money yerine number verilemez.
    expect(() => multiply(3, m('1'))).toThrow(TypeError);
  });
});

describe('F3.6a yüzde indirim ve karşılaştırma', () => {
  it('F3.6a-P8 indirim 4 haneye yarım yukarı; 0 ve 100 sınır', () => {
    const value = fromDecimalString('3.3333');
    expect(toDecimalString(applyDiscountPercent(value, fromDecimalString('3')), 4)).toBe('3.2333');
    expect(
      toDecimalString(
        applyDiscountPercent(fromDecimalString('1.2345'), fromDecimalString('10')),
        4,
      ),
    ).toBe('1.1111');
    expect(toDecimalString(applyDiscountPercent(value, fromDecimalString('0')), 4)).toBe('3.3333');
    expect(toDecimalString(applyDiscountPercent(value, fromDecimalString('100')), 4)).toBe(
      '0.0000',
    );
  });

  it('F3.6a yüzde 0–100 dışında RangeError', () => {
    const value = fromDecimalString('1');
    expect(() => applyDiscountPercent(value, fromDecimalString('-1'))).toThrow(RangeError);
    expect(() => applyDiscountPercent(value, fromDecimalString('100.01'))).toThrow(RangeError);
  });

  it('F3.6a compare sıralar', () => {
    expect(compare(fromDecimalString('9.999'), fromDecimalString('10'))).toBe(-1);
    expect(compare(fromDecimalString('10.000'), fromDecimalString('10'))).toBe(0);
    expect(compare(fromDecimalString('10.5'), fromDecimalString('10'))).toBe(1);
  });
});
