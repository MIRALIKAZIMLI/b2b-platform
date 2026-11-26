// Para hesabı (coding-guidelines §4.4, data-model §1). Yalnızca `decimal.js`; `number` kabul eden
// imza yoktur. Metin biçimi openapi.yaml `Decimal` şemasıdır (en çok 4 ondalık).
// Yuvarlama yarım yukarı, sıfırdan uzağa (test-strategy P11): birim fiyat 4, satır toplamı 2 hane.
// −0.125 → −0.13. Gösterim biçimlendirmesi (binlik ayırıcı, para simgesi) F1.3'te.
import Decimal from 'decimal.js';
import { DomainError } from './errors/domain-error';

/** Hesaplarda kullanılan Decimal kopyası; genel Decimal ayarlarından etkilenmez. */
const MoneyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

declare const moneyBrand: unique symbol;

/** Para veya miktar değeri. Yalnızca bu dosyadaki fonksiyonlarla üretilir. */
export type Money = Decimal & { readonly [moneyBrand]: true };

/** openapi.yaml `Decimal` şeması. */
const DECIMAL_TEXT = /^-?[0-9]+(\.[0-9]{1,4})?$/;

export const UNIT_PRICE_SCALE = 4;
export const LINE_TOTAL_SCALE = 2;

type Scale = typeof UNIT_PRICE_SCALE | typeof LINE_TOTAL_SCALE;

function brand(value: Decimal): Money {
  return value as Money;
}

function assertMoney(value: unknown): asserts value is Money {
  if (!(value instanceof MoneyDecimal)) {
    throw new TypeError('Para değeri Money olmalı (fromDecimalString ile üretilir)');
  }
}

export const ZERO: Money = brand(new MoneyDecimal(0));

/** `Decimal` şemasındaki metni okur; şemaya uymayan metin `VALIDATION_FAILED`. */
export function fromDecimalString(text: string): Money {
  // Tip sistemi number'ı zaten reddeder; bu kontrol tipsiz çağrılara karşı.
  const input: unknown = text;
  if (typeof input !== 'string') {
    throw new TypeError('Para değeri metin olarak verilmeli');
  }
  if (!DECIMAL_TEXT.test(input)) {
    throw new DomainError('VALIDATION_FAILED', { reason: 'DECIMAL_FORMAT' });
  }
  return brand(new MoneyDecimal(text));
}

/** Sabit ondalıklı metin; istenen haneye yarım yukarı yuvarlar. Negatif sıfır "0.00" yazılır. */
export function toDecimalString(value: Money, scale: Scale): string {
  assertMoney(value);
  const rounded = value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  return (rounded.isZero() ? rounded.abs() : rounded).toFixed(scale);
}

export function add(a: Money, b: Money): Money {
  assertMoney(a);
  assertMoney(b);
  return brand(a.plus(b));
}

export function subtract(a: Money, b: Money): Money {
  assertMoney(a);
  assertMoney(b);
  return brand(a.minus(b));
}

/** Çarpma (ör. birim fiyat × miktar); yuvarlamaz. */
export function multiply(a: Money, b: Money): Money {
  assertMoney(a);
  assertMoney(b);
  return brand(a.times(b));
}

/** Birim fiyat: 4 hane, yarım yukarı. */
export function roundUnitPrice(value: Money): Money {
  assertMoney(value);
  return brand(value.toDecimalPlaces(UNIT_PRICE_SCALE, Decimal.ROUND_HALF_UP));
}

/** Satır toplamı: 2 hane, yarım yukarı. */
export function roundLineTotal(value: Money): Money {
  assertMoney(value);
  return brand(value.toDecimalPlaces(LINE_TOTAL_SCALE, Decimal.ROUND_HALF_UP));
}

const HUNDRED = new MoneyDecimal(100);

/**
 * Yüzde indirim (F3.6a, ADR-0019 §2: kademe ve şube indirimi): `değer × (100 − yüzde) / 100`,
 * birim fiyat hanesine (4) yarım yukarı. Yüzde 0–100 dışında `RangeError`.
 */
export function applyDiscountPercent(value: Money, percent: Money): Money {
  assertMoney(value);
  assertMoney(percent);
  if (percent.isNegative() || percent.greaterThan(HUNDRED)) {
    throw new RangeError('İndirim yüzdesi 0–100 arasında olmalı');
  }
  return roundUnitPrice(brand(value.times(HUNDRED.minus(percent)).dividedBy(HUNDRED)));
}

/** Karşılaştırma: a < b → −1, eşit → 0, a > b → 1. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertMoney(a);
  assertMoney(b);
  return a.comparedTo(b) as -1 | 0 | 1;
}
