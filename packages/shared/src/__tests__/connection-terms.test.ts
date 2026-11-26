import { describe, expect, it } from 'vitest';
import {
  type ConnectionView,
  connectionTermsUpdateSchema,
  customersAccess,
  parseCreditLimit,
  termsFailureKey,
  termsFormValues,
  termsUpdateBody,
} from '../connections';
import { visibleMenu } from '../menu';

const REP = '0190a3b4-0000-7000-8000-000000000009';

function connection(overrides: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: '0190a3b4-0000-7000-8000-000000000001',
    sellerId: '0190a3b4-0000-7000-8000-000000000002',
    buyerId: '0190a3b4-0000-7000-8000-000000000003',
    counterpartyName: 'Market',
    status: 'active',
    termsAssigned: false,
    terms: {
      priceListId: null,
      branchPricingEnabled: false,
      creditLimit: null,
      paymentTermDays: 0,
      salesRepMembershipId: null,
    },
    suggestedTerms: null,
    startedAt: '2026-11-10T08:00:00Z',
    endedAt: null,
    endedBySide: null,
    ...overrides,
  };
}

describe('F2.14 bağlantı koşulları ekran yardımcıları', () => {
  it('F2.14b-AC1 menü: Müşterilərim connections.view ile hazır, toptancıda', () => {
    const item = visibleMenu('seller', ['connections.view']).find((m) => m.key === 'customers');
    expect(item).toMatchObject({ ready: true, path: 'customers' });
    expect(visibleMenu('seller', []).some((m) => m.key === 'customers')).toBe(false);
    // F2.15b: `cancel` alanı eklendi (bu kodlarda yok).
    expect(customersAccess(['connections.view'])).toEqual({
      view: true,
      manage: false,
      cancel: false,
    });
    expect(customersAccess(['connections.view', 'connections.terms.manage'])).toEqual({
      view: true,
      manage: true,
      cancel: false,
    });
  });

  it('F2.14b-AC2 kredi limiti kutusu: boş → null, virgül ve boşluk, en çok 2 ondalık', () => {
    expect(parseCreditLimit('  ')).toEqual({ valid: true, value: null });
    expect(parseCreditLimit('1 500,5')).toEqual({ valid: true, value: '1500.5' });
    expect(parseCreditLimit('1\u00a0500')).toEqual({ valid: true, value: '1500' });
    expect(parseCreditLimit('2000')).toEqual({ valid: true, value: '2000' });
    for (const bad of ['-1', '1.234', 'abc', '1234567890123']) {
      expect(parseCreditLimit(bad), bad).toEqual({ valid: false });
    }
  });

  it('F2.14b-AC2 gövde: üç alan, boş temsilci null; geçersiz alanlar işaretlenir; şema kabul eder', () => {
    const ok = termsUpdateBody({
      creditLimit: '1500,50',
      paymentTermDays: '30',
      salesRepMembershipId: REP,
    });
    expect(ok).toEqual({
      ok: true,
      body: { creditLimit: '1500.50', paymentTermDays: 30, salesRepMembershipId: REP },
    });
    if (ok.ok) expect(connectionTermsUpdateSchema.parse(ok.body)).toEqual(ok.body);
    expect(
      termsUpdateBody({ creditLimit: '', paymentTermDays: '0', salesRepMembershipId: '' }),
    ).toEqual({
      ok: true,
      body: { creditLimit: null, paymentTermDays: 0, salesRepMembershipId: null },
    });
    expect(
      termsUpdateBody({ creditLimit: 'x', paymentTermDays: '', salesRepMembershipId: '' }),
    ).toEqual({ ok: false, creditLimit: true, paymentTermDays: true });
    expect(
      termsUpdateBody({ creditLimit: '1', paymentTermDays: '181', salesRepMembershipId: '' }),
    ).toEqual({ ok: false, creditLimit: false, paymentTermDays: true });
  });

  it('F2.14b-AC2 temsilci listesi yoksa temsilci alanı gönderilmez (kayıtlı temsilci silinmez)', () => {
    const result = termsUpdateBody({
      creditLimit: '200',
      paymentTermDays: '15',
      salesRepMembershipId: undefined,
    });
    expect(result).toEqual({ ok: true, body: { creditLimit: '200', paymentTermDays: 15 } });
    if (result.ok) {
      expect('salesRepMembershipId' in result.body).toBe(false);
      expect(connectionTermsUpdateSchema.parse(result.body)).toEqual(result.body);
    }
  });

  it('F3.6b-AC2 fiyat listesi: boş = standart (null), seçim kimlik; yüklenmediyse alan gönderilmez', () => {
    const LIST = '01936f3e-0000-7000-8000-0000000000aa';
    const chosen = termsUpdateBody({
      creditLimit: '',
      paymentTermDays: '0',
      salesRepMembershipId: undefined,
      priceListId: LIST,
    });
    expect(chosen).toEqual({
      ok: true,
      body: { creditLimit: null, paymentTermDays: 0, priceListId: LIST },
    });
    if (chosen.ok) expect(connectionTermsUpdateSchema.parse(chosen.body)).toEqual(chosen.body);
    expect(
      termsUpdateBody({
        creditLimit: '',
        paymentTermDays: '0',
        salesRepMembershipId: undefined,
        priceListId: '',
      }),
    ).toEqual({ ok: true, body: { creditLimit: null, paymentTermDays: 0, priceListId: null } });
    const skipped = termsUpdateBody({
      creditLimit: '',
      paymentTermDays: '0',
      salesRepMembershipId: undefined,
      priceListId: undefined,
    });
    expect(skipped.ok && 'priceListId' in skipped.body).toBe(false);
    expect(
      termsFailureKey({
        code: 'VALIDATION_FAILED',
        details: { priceListId: ['invalid_price_list'] },
      }),
    ).toBe('customers.error.invalid_price_list');
  });

  it('US-024-AC3 pencere değerleri: atanmış koşul > önceki dönem önerisi > istek vadesi > boş', () => {
    expect(
      termsFormValues(
        connection({
          termsAssigned: true,
          terms: { creditLimit: '900.00', paymentTermDays: 45, salesRepMembershipId: REP },
        }),
      ),
    ).toEqual({
      creditLimit: '900.00',
      paymentTermDays: '45',
      salesRepMembershipId: REP,
      source: 'current',
    });
    expect(
      termsFormValues(
        connection({
          suggestedTerms: {
            source: 'previous_connection',
            creditLimit: '700.00',
            paymentTermDays: 20,
            salesRepMembershipId: null,
          },
        }),
      ),
    ).toEqual({
      creditLimit: '700.00',
      paymentTermDays: '20',
      salesRepMembershipId: '',
      source: 'previous_connection',
    });
    expect(
      termsFormValues(
        connection({
          suggestedTerms: {
            source: 'request',
            creditLimit: null,
            paymentTermDays: 30,
            salesRepMembershipId: null,
          },
        }),
      ),
    ).toMatchObject({ paymentTermDays: '30', creditLimit: '', source: 'request' });
    expect(termsFormValues(connection())).toEqual({
      creditLimit: '',
      paymentTermDays: '0',
      salesRepMembershipId: '',
      source: 'none',
    });
  });

  it('F2.14b-AC4 hata anahtarları: iptal, bulunamadı, temsilci, diğerleri genel', () => {
    expect(termsFailureKey({ code: 'INVALID_STATE_TRANSITION' })).toBe('customers.error.cancelled');
    expect(termsFailureKey({ code: 'NOT_FOUND' })).toBe('customers.error.not_found');
    expect(
      termsFailureKey({
        code: 'VALIDATION_FAILED',
        details: { salesRepMembershipId: ['invalid_sales_rep'] },
      }),
    ).toBe('customers.error.invalid_sales_rep');
    expect(termsFailureKey({ code: 'VALIDATION_FAILED' })).toBe('errors.VALIDATION_FAILED');
    expect(termsFailureKey(undefined)).toBe('errors.INTERNAL_ERROR');
  });
});
