// F3.6b web fiyat ekranlarının saf yardımcıları (US-034 AC1, AC5, AC6; K2 = A, K3).
import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatUnitPrice,
  parseUnitPrice,
  priceItemsBody,
  priceItemsFieldErrors,
  priceListActions,
  priceListFailureKey,
  priceListFormBody,
  priceListItemsSetSchema,
  priceListCreateSchema,
  pricingAccess,
  priceSourceKey,
  sortPriceLists,
} from '../index';

const P1 = '01936f3e-0000-7000-8000-000000000001';
const P2 = '01936f3e-0000-7000-8000-000000000002';

describe('F3.6b fiyat ekranı yardımcıları', () => {
  it('F3.6b-AC1 liste formu: ad kırpılır, para birimi büyük harf, ƏDV virgülle; şema kabul eder', () => {
    const ok = priceListFormBody({
      name: '  VIP ',
      currency: 'azn',
      vatIncluded: false,
      vatRate: '18,5',
    });
    expect(ok).toEqual({
      ok: true,
      body: { name: 'VIP', currency: 'AZN', vatIncluded: false, vatRate: '18.5' },
    });
    if (ok.ok) expect(priceListCreateSchema.parse(ok.body)).toEqual(ok.body);
    expect(
      priceListFormBody({ name: ' ', currency: 'AZ', vatIncluded: true, vatRate: '100.01' }),
    ).toEqual({ ok: false, invalid: ['name', 'currency', 'vatRate'] });
    expect(
      priceListFormBody({
        name: 'A'.repeat(121),
        currency: 'AZN',
        vatIncluded: true,
        vatRate: '0',
      }),
    ).toEqual({ ok: false, invalid: ['name'] });
  });

  it('F3.6b-K3 eylemler: standart liste arşivlenmez/standart yapılmaz; arşivli yalnız geri alınır; izinsiz hiçbir şey', () => {
    expect(priceListActions({ isDefault: true, status: 'active' }, true)).toEqual({
      canEdit: true,
      canMakeDefault: false,
      canArchive: false,
      canRestore: false,
    });
    expect(priceListActions({ isDefault: false, status: 'active' }, true)).toEqual({
      canEdit: true,
      canMakeDefault: true,
      canArchive: true,
      canRestore: false,
    });
    expect(priceListActions({ isDefault: false, status: 'archived' }, true)).toEqual({
      canEdit: false,
      canMakeDefault: false,
      canArchive: false,
      canRestore: true,
    });
    expect(priceListActions({ isDefault: false, status: 'active' }, false)).toEqual({
      canEdit: false,
      canMakeDefault: false,
      canArchive: false,
      canRestore: false,
    });
  });

  it('F3.6b-AC1 sıra: standart, aktifler ada göre, arşivliler sonda; hata anahtarı (K2 = A)', () => {
    const lists = [
      { name: 'Zəmi', isDefault: false, status: 'archived' as const },
      { name: 'VIP', isDefault: false, status: 'active' as const },
      { name: 'Əsas', isDefault: true, status: 'active' as const },
      { name: 'Bayram', isDefault: false, status: 'active' as const },
    ];
    expect(sortPriceLists(lists, 'az').map((list) => list.name)).toEqual([
      'Əsas',
      'Bayram',
      'VIP',
      'Zəmi',
    ]);
    expect(priceListFailureKey({ code: 'PRICE_LIST_IN_USE' })).toBe('errors.PRICE_LIST_IN_USE');
    expect(priceListFailureKey(new Error('x'))).toBe('errors.INTERNAL_ERROR');
    expect(pricingAccess(['pricing.view'])).toEqual({ view: true, manage: false });
  });

  it('F3.6b-AC6 fiyat gövdesi: boş satır gönderilmez, virgül noktaya; ileri tarihte gün; şema kabul eder', () => {
    const now = priceItemsBody(
      [
        { packagingId: P1, input: '12,5' },
        { packagingId: P2, input: ' ' },
      ],
      'now',
      '',
    );
    expect(now).toEqual({ ok: true, body: { items: [{ packagingId: P1, unitPrice: '12.5' }] } });
    if (now.ok) expect(priceListItemsSetSchema.parse(now.body)).toEqual(now.body);
    const later = priceItemsBody([{ packagingId: P1, input: '13' }], 'scheduled', '2026-12-01');
    expect(later).toEqual({
      ok: true,
      body: { validFrom: '2026-12-01', items: [{ packagingId: P1, unitPrice: '13' }] },
    });
    if (later.ok) expect(priceListItemsSetSchema.parse(later.body)).toEqual(later.body);
  });

  it('F3.6b-AC6 hatalar: geçersiz fiyat satırı, eksik gün, hiç fiyat yok; API 422 satıra ve güne iner', () => {
    expect(
      priceItemsBody(
        [
          { packagingId: P1, input: '1.23456' },
          { packagingId: P2, input: '-1' },
        ],
        'scheduled',
        '',
      ),
    ).toEqual({ ok: false, invalidRows: [P1, P2], invalidDay: true, empty: false });
    expect(priceItemsBody([{ packagingId: P1, input: '' }], 'now', '')).toEqual({
      ok: false,
      invalidRows: [],
      invalidDay: false,
      empty: true,
    });
    expect(
      priceItemsFieldErrors(
        { 'items.1.unitPrice': ['invalid'], validFrom: ['must_be_future_day'] },
        [{ packagingId: P1 }, { packagingId: P2 }],
      ),
    ).toEqual({ rows: [P2], day: true });
    expect(priceItemsFieldErrors(undefined, [])).toEqual({ rows: [], day: false });
    expect(parseUnitPrice('12345678901')).toEqual({ kind: 'invalid' });
  });

  it('F3.6b-AC5 gösterim: fiyat metni en az 2 ondalık, sayıya çevrilmeden; kaynak anahtarı; gün ekleme', () => {
    expect(formatUnitPrice('10.5000')).toBe('10.50');
    expect(formatUnitPrice('10.1250')).toBe('10.125');
    expect(formatUnitPrice('7')).toBe('7.00');
    expect(formatUnitPrice('0.0001')).toBe('0.0001');
    expect(priceSourceKey('price_list')).toBe('prices.source.price_list');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
