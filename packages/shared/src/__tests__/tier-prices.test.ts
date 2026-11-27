// F3.9 kademeli fiyat şeması ve form yardımcıları (US-037 AC1; S2 = A kuralları).
import { describe, expect, it } from 'vitest';
import { priceExplainQuerySchema } from '../pricing';
import {
  compareDecimalText,
  formatTierDecimal,
  tierPricesBody,
  tierPricesFieldErrors,
  tierPricesQuerySchema,
  tierPricesSetSchema,
  tierRuleErrors,
} from '../tier-prices';

const PACKAGING = '01936f3e-0000-7000-8000-000000000001';

function issues(tiers: { minQty: string; discountPercent: string }[]) {
  const result = tierPricesSetSchema.safeParse({ packagingId: PACKAGING, tiers });
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('F3.9 kademe kuralları', () => {
  it('F3.9-V1 ondalık metin karşılaştırması sayıya çevirmeden', () => {
    expect(compareDecimalText('10', '9.999')).toBeGreaterThan(0);
    expect(compareDecimalText('10.0', '10')).toBe(0);
    expect(compareDecimalText('010', '10.000')).toBe(0);
    expect(compareDecimalText('2.5', '2.45')).toBeGreaterThan(0);
    expect(compareDecimalText('1', '1.001')).toBeLessThan(0);
    expect(compareDecimalText('99999999999', '100')).toBeGreaterThan(0);
  });

  it('F3.9-V1 geçerli gövde: sıra serbest, eşik büyüdükçe indirim büyür; boş liste geçerli', () => {
    expect(
      tierPricesSetSchema.parse({
        packagingId: PACKAGING,
        tiers: [
          { minQty: '50', discountPercent: '5' },
          { minQty: '10', discountPercent: '3' },
        ],
      }).tiers,
    ).toHaveLength(2);
    expect(tierPricesSetSchema.parse({ packagingId: PACKAGING, tiers: [] }).tiers).toEqual([]);
    expect(issues([{ minQty: '1.001', discountPercent: '99.99' }])).toEqual({});
  });

  it('F3.9-V1 eşik ≤ 1, indirim 0, tekrar eşik ve artmayan indirim alan hatası verir', () => {
    expect(issues([{ minQty: '1', discountPercent: '3' }])).toEqual({
      'tiers.0.minQty': 'min_qty_too_small',
    });
    expect(issues([{ minQty: '0.5', discountPercent: '3' }])).toEqual({
      'tiers.0.minQty': 'min_qty_too_small',
    });
    expect(issues([{ minQty: '5', discountPercent: '0.00' }])).toEqual({
      'tiers.0.discountPercent': 'percent_out_of_range',
    });
    expect(
      issues([
        { minQty: '10', discountPercent: '3' },
        { minQty: '10.000', discountPercent: '4' },
      ]),
    ).toEqual({ 'tiers.1.minQty': 'duplicate_min_qty' });
    expect(
      issues([
        { minQty: '10', discountPercent: '3' },
        { minQty: '50', discountPercent: '3' },
      ]),
    ).toEqual({ 'tiers.1.discountPercent': 'percent_not_increasing' });
    expect(
      issues([
        { minQty: '50', discountPercent: '2' },
        { minQty: '10', discountPercent: '3' },
      ]),
    ).toEqual({ 'tiers.0.discountPercent': 'percent_not_increasing' });
  });

  it('F3.9-V1 desen: indirim 100 ve üstü, 3 haneden fazla ondalıklı eşik, fazla alan reddedilir', () => {
    for (const discountPercent of ['100', '3.123', '-1', 'x']) {
      expect(
        tierPricesSetSchema.safeParse({
          packagingId: PACKAGING,
          tiers: [{ minQty: '10', discountPercent }],
        }).success,
        discountPercent,
      ).toBe(false);
    }
    expect(
      tierPricesSetSchema.safeParse({
        packagingId: PACKAGING,
        tiers: [{ minQty: '10.1234', discountPercent: '3' }],
      }).success,
    ).toBe(false);
    expect(
      tierPricesSetSchema.safeParse({
        packagingId: PACKAGING,
        tiers: [{ minQty: '10', discountPercent: '3', buyerId: PACKAGING }],
      }).success,
    ).toBe(false);
    expect(
      tierPricesSetSchema.safeParse({
        packagingId: PACKAGING,
        tiers: Array.from({ length: 21 }, (_, i) => ({
          minQty: String(i + 2),
          discountPercent: String(i + 1),
        })),
      }).success,
    ).toBe(false);
  });

  it('F3.9-V1 kural fonksiyonu tekrar eden eşiği artış denetiminden ayırır', () => {
    expect([
      ...tierRuleErrors([
        { minQty: '10', discountPercent: '3' },
        { minQty: '10', discountPercent: '1' },
        { minQty: '20', discountPercent: '4' },
      ]),
    ]).toEqual([['1.minQty', 'duplicate_min_qty']]);
  });

  it('F3.9 GET sorgusu tek veya tekrarlı ambalaj kimliği alır', () => {
    expect(tierPricesQuerySchema.parse({ packagingId: PACKAGING }).packagingId).toEqual([
      PACKAGING,
    ]);
    expect(tierPricesQuerySchema.safeParse({}).success).toBe(false);
  });

  it('F3.9 explain `qty`: sıfırdan büyük, en çok 3 ondalık', () => {
    const base = { buyerId: PACKAGING, packagingId: PACKAGING };
    expect(priceExplainQuerySchema.parse({ ...base, qty: '12.5' }).qty).toBe('12.5');
    expect(priceExplainQuerySchema.parse(base).qty).toBeUndefined();
    for (const qty of ['0', '0.000', '-1', '1.2345', 'abc']) {
      expect(priceExplainQuerySchema.safeParse({ ...base, qty }).success, qty).toBe(false);
    }
  });
});

describe('F3.9 web kademe formu', () => {
  it('F3.9-W1 boş satır atlanır, virgül noktaya çevrilir; geçerli gövde', () => {
    expect(
      tierPricesBody([
        { minQty: '10', discountPercent: '3,5' },
        { minQty: '', discountPercent: '' },
        { minQty: ' 50 ', discountPercent: '5' },
      ]),
    ).toEqual({
      ok: true,
      tiers: [
        { minQty: '10', discountPercent: '3.5' },
        { minQty: '50', discountPercent: '5' },
      ],
    });
    expect(tierPricesBody([])).toEqual({ ok: true, tiers: [] });
  });

  it('F3.9-W1 eksik, desen dışı ve kural hataları formdaki satıra yazılır', () => {
    const result = tierPricesBody([
      { minQty: '10', discountPercent: '' },
      { minQty: '', discountPercent: '' },
      { minQty: 'x', discountPercent: '3' },
      { minQty: '20', discountPercent: '4' },
      { minQty: '30', discountPercent: '4' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.fromEntries(result.errors)).toEqual({
      '0.discountPercent': 'required',
      '2.minQty': 'invalid',
      '4.discountPercent': 'percent_not_increasing',
    });
  });

  it('F3.9-W2 API 422 ayrıntısı gönderilen satırlara eşlenir; kök hata sınır', () => {
    expect(
      tierPricesFieldErrors(
        {
          'tiers.1.discountPercent': ['percent_not_increasing'],
          'tiers.0.minQty': ['Invalid string'],
        },
        [0, 3],
      ),
    ).toEqual({
      fields: new Map([
        ['3.discountPercent', 'percent_not_increasing'],
        ['0.minQty', 'invalid'],
      ]),
      limit: false,
    });
    expect(tierPricesFieldErrors({ tiers: ['too_many'] }, []).limit).toBe(true);
    expect(tierPricesFieldErrors(null, []).limit).toBe(false);
  });

  it('F3.9 gösterim: sondaki sıfırlar atılır', () => {
    expect(formatTierDecimal('10.000')).toBe('10');
    expect(formatTierDecimal('2.50')).toBe('2.5');
    expect(formatTierDecimal('12')).toBe('12');
  });
});
