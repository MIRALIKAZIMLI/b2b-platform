// F3.6a fiyat listesi durum makinesi (state-machines §15): tablodaki her geçiş izinli, diğerleri 409.
import { PRICE_LIST_STATUSES } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { PriceListStateMachine } from '../price-list.state-machine';

const ALLOWED = new Set(['active>archived', 'archived>active']);

describe('F3.6a PriceListStateMachine', () => {
  for (const from of PRICE_LIST_STATUSES) {
    for (const to of PRICE_LIST_STATUSES) {
      const allowed = ALLOWED.has(`${from}>${to}`);
      it(`F3.6a-SM ${from} → ${to} ${allowed ? 'izinli' : '409'}`, () => {
        expect(PriceListStateMachine.canTransition(from, to)).toBe(allowed);
        if (allowed) {
          expect(() => {
            PriceListStateMachine.assertTransition(from, to);
          }).not.toThrow();
        } else {
          expect(() => {
            PriceListStateMachine.assertTransition(from, to);
          }).toThrow(DomainError);
        }
      });
    }
  }
});
