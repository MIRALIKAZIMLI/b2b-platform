// F3.6a fiyat şemaları (openapi `PriceListInput`, `PriceListUpdate`, `PUT /price-lists/{id}/items`).
import { describe, expect, it } from 'vitest';
import {
  priceListCreateSchema,
  priceListItemsQuerySchema,
  priceListItemsSetSchema,
  priceListUpdateSchema,
} from '../pricing';

const PACKAGING = '01936f3e-0000-7000-8000-000000000001';

describe('F3.6a fiyat şemaları', () => {
  it('F3.6a-AC1 liste gövdesi: ad kırpılır, ƏDV 0–100 ve en çok 2 ondalık, para birimi büyük harf', () => {
    expect(
      priceListCreateSchema.parse({
        name: '  Əsas ',
        currency: 'AZN',
        vatIncluded: true,
        vatRate: '18',
      }),
    ).toEqual({ name: 'Əsas', currency: 'AZN', vatIncluded: true, vatRate: '18' });
    for (const vatRate of ['100.01', '18.123', '-1', '1000']) {
      expect(
        priceListCreateSchema.safeParse({ name: 'A', currency: 'AZN', vatIncluded: true, vatRate })
          .success,
        vatRate,
      ).toBe(false);
    }
    expect(
      priceListCreateSchema.safeParse({
        name: 'A',
        currency: 'azn',
        vatIncluded: true,
        vatRate: '0',
      }).success,
    ).toBe(false);
  });

  it('F3.6a-K3 düzenleme: boş gövde ve isDefault false reddedilir', () => {
    expect(priceListUpdateSchema.safeParse({}).success).toBe(false);
    expect(priceListUpdateSchema.safeParse({ isDefault: false }).success).toBe(false);
    expect(priceListUpdateSchema.safeParse({ isDefault: true }).success).toBe(true);
    expect(priceListUpdateSchema.safeParse({ currency: 'USD' }).success).toBe(false);
  });

  it('F3.6a-AC6 fiyat gövdesi: gün biçimi, birim fiyat 4 ondalık, tekrar eden ambalaj, en çok 1000 satır', () => {
    const item = { packagingId: PACKAGING, unitPrice: '12.5' };
    expect(
      priceListItemsSetSchema.safeParse({ items: [item], validFrom: '2026-11-11' }).success,
    ).toBe(true);
    for (const validFrom of ['2026-11-11T00:00:00Z', '2026-02-30', '11.11.2026']) {
      expect(
        priceListItemsSetSchema.safeParse({ items: [item], validFrom }).success,
        validFrom,
      ).toBe(false);
    }
    for (const unitPrice of ['1.23456', '-1', '12345678901', '1,5']) {
      expect(
        priceListItemsSetSchema.safeParse({ items: [{ ...item, unitPrice }] }).success,
        unitPrice,
      ).toBe(false);
    }
    expect(priceListItemsSetSchema.safeParse({ items: [item, item] }).success).toBe(false);
    expect(priceListItemsSetSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('F3.6b-K1 ambalaj süzgeci: tek değer diziye çevrilir; geçersiz kimlik ve 100 üstü reddedilir', () => {
    expect(priceListItemsQuerySchema.parse({ packagingId: PACKAGING })).toEqual({
      limit: 20,
      packagingId: [PACKAGING],
    });
    expect(priceListItemsQuerySchema.parse({}).packagingId).toBeUndefined();
    expect(priceListItemsQuerySchema.safeParse({ packagingId: 'x' }).success).toBe(false);
    expect(
      priceListItemsQuerySchema.safeParse({
        packagingId: Array.from({ length: 101 }, () => PACKAGING),
      }).success,
    ).toBe(false);
  });
});
