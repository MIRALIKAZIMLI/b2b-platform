// F3.3a ürün şemaları (US-030 AC1, AC4, AC5): ad, GTIN, kısmi güncelleme, dil geri dönüşü.
import { describe, expect, it } from 'vitest';
import { pickLocalizedText } from '../localized-text';
import {
  isValidGtin,
  productCreateSchema,
  productNameSchema,
  productUpdateSchema,
} from '../products';

const base = {
  sku: 'SH-400',
  name: { az: 'Şampun' },
  categoryId: '0190a8a4-0000-7000-8000-000000000001',
  baseUnitCode: 'H87',
  variants: [
    {
      sku: 'SH-400-1',
      packaging: [{ level: 'unit', unitCode: 'H87', baseQty: '1', isSalesUnit: true }],
    },
  ],
};

describe('F3.3a ürün şemaları', () => {
  it('F3.3a-AC1 ad en az bir dilde dolu; boş diller atılır', () => {
    expect(productNameSchema.parse({ az: ' Şampun ', ru: '' })).toEqual({ az: 'Şampun' });
    expect(productNameSchema.safeParse({ az: ' ', ru: '' }).success).toBe(false);
    expect(productNameSchema.safeParse({ de: 'x' }).success).toBe(false);
  });

  it('F3.3a-AC1 geçerli gövde draft varsayılanlarıyla ayrışır', () => {
    const parsed = productCreateSchema.parse(base);
    expect(parsed.hasExpiry).toBe(false);
    expect(parsed.variants[0]?.packaging[0]).toMatchObject({
      minOrderQty: '1',
      orderMultiple: '1',
    });
    expect(productCreateSchema.safeParse({ ...base, variants: [] }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...base, status: 'active' }).success).toBe(false);
  });

  it("F3.3a-AC1 aynı istekte varyant SKU tekrarı ve POST'ta varyant kimliği reddedilir", () => {
    const variant = base.variants[0];
    expect(productCreateSchema.safeParse({ ...base, variants: [variant, variant] }).success).toBe(
      false,
    );
    expect(
      productCreateSchema.safeParse({
        ...base,
        variants: [{ ...variant, id: '0190a8a4-0000-7000-8000-000000000002' }],
      }).success,
    ).toBe(false);
  });

  it('F3.3a-AC5 raf ömrü 1–120 ay; kısmi güncelleme boş olamaz', () => {
    expect(
      productCreateSchema.safeParse({ ...base, hasExpiry: true, shelfLifeMonths: 0 }).success,
    ).toBe(false);
    expect(
      productCreateSchema.safeParse({ ...base, hasExpiry: true, shelfLifeMonths: 24 }).success,
    ).toBe(true);
    expect(productUpdateSchema.safeParse({}).success).toBe(false);
    expect(productUpdateSchema.safeParse({ status: 'active' }).success).toBe(true);
  });

  it('F3.3a GTIN kontrol hanesi', () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('12345')).toBe(false);
  });

  it('F3.3a-AC4 eksik dilde dolu ilk dil: kullanıcı dili → işletme dili → az → ilk dolu', () => {
    const name = { ru: 'Шампунь', tr: 'Şampuan' };
    expect(pickLocalizedText(name, 'tr')).toBe('Şampuan');
    expect(pickLocalizedText(name, 'en', { businessDefault: 'ru' })).toBe('Шампунь');
    expect(pickLocalizedText({ az: 'Şampun', ru: 'Шампунь' }, 'en')).toBe('Şampun');
    expect(pickLocalizedText(name, 'en')).toBe('Шампунь');
  });
});
