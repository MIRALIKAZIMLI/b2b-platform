// state-machines.md §12 ile birebir: tabloda olmayan geçiş 409 INVALID_STATE_TRANSITION.
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { SELLER_APPLICATION_STATUSES, type SellerApplicationStatus } from '../businesses.schema';
import { SellerApplicationStateMachine } from '../seller-application.state-machine';

const ALLOWED = new Set(['pending>approved', 'pending>rejected']);

describe('SellerApplicationStateMachine (F2.2)', () => {
  const pairs: [SellerApplicationStatus, SellerApplicationStatus][] =
    SELLER_APPLICATION_STATUSES.flatMap((from) =>
      SELLER_APPLICATION_STATUSES.map((to): [SellerApplicationStatus, SellerApplicationStatus] => [
        from,
        to,
      ]),
    );

  it.each(pairs)('F2.2 %s → %s yalnızca belgedeki tabloya göre', (from, to) => {
    const allowed = ALLOWED.has(`${from}>${to}`);
    expect(SellerApplicationStateMachine.canTransition(from, to)).toBe(allowed);
    if (allowed) {
      expect(() => {
        SellerApplicationStateMachine.assertTransition(from, to);
      }).not.toThrow();
    } else {
      expect(() => {
        SellerApplicationStateMachine.assertTransition(from, to);
      }).toThrow(new DomainError('INVALID_STATE_TRANSITION'));
    }
  });
});
