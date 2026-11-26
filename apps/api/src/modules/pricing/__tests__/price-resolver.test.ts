// F3.6a PriceResolver çekirdeği: test-strategy §3.1 P1–P11 (birim, saf fonksiyon).
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { LINE_TOTAL_CASES, PRICE_CASES } from '../price-resolver.cases';
import { lineTotal, resolvePrice } from '../price-resolver';

describe('F3.6a PriceResolver (P1–P11)', () => {
  for (const testCase of PRICE_CASES) {
    it(`F3.6a-${testCase.id} ${testCase.title}`, () => {
      if (testCase.error !== undefined) {
        let thrown: unknown;
        try {
          resolvePrice(testCase.input);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(DomainError);
        expect((thrown as DomainError).code).toBe(testCase.error);
        return;
      }
      const result = resolvePrice(testCase.input);
      const expected = testCase.expected;
      if (expected === undefined) throw new Error('beklenen değer yok');
      expect(result.source).toBe(expected.source);
      if (expected.source === 'none') {
        expect(result).toEqual({ source: 'none' });
        return;
      }
      if (result.source === 'none') throw new Error('fiyat bekleniyordu');
      if (expected.unitPrice !== undefined) expect(result.unitPrice).toBe(expected.unitPrice);
      if (expected.finalUnitPrice !== undefined) {
        expect(result.finalUnitPrice).toBe(expected.finalUnitPrice);
      }
      if (expected.tierDiscountPercent !== undefined) {
        expect(result.tierDiscountPercent).toBe(expected.tierDiscountPercent);
      }
      if (expected.branchDiscountPercent !== undefined) {
        expect(result.branchDiscountPercent).toBe(expected.branchDiscountPercent);
      }
      if (expected.priceListId !== undefined) {
        expect(result.priceList?.id ?? null).toBe(expected.priceListId);
      }
      if (expected.validFrom !== undefined) expect(result.validFrom).toEqual(expected.validFrom);
      if (expected.vatIncluded !== undefined) expect(result.vatIncluded).toBe(expected.vatIncluded);
      expect(result.currency).toBe('AZN');
    });
  }

  for (const [unit, qty, total] of LINE_TOTAL_CASES) {
    it(`F3.6a-P11 satır toplamı ${unit} × ${qty} = ${total} (yarım yukarı, 2 hane)`, () => {
      expect(lineTotal(unit, qty)).toBe(total);
    });
  }
});
