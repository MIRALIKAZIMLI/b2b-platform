// state-machines.md §9 ile birebir: tabloda olmayan geçiş 409 INVALID_STATE_TRANSITION.
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { BusinessStateMachine } from '../business.state-machine';
import { BUSINESS_STATUSES, type BusinessStatus } from '../businesses.schema';

const ALLOWED = new Set([
  'active>suspended',
  'suspended>active',
  'active>dormant',
  'dormant>active',
  'dormant>archived',
  'active>archived',
  'suspended>archived',
]);

describe('BusinessStateMachine (F2.18)', () => {
  const pairs: [BusinessStatus, BusinessStatus][] = BUSINESS_STATUSES.flatMap((from) =>
    BUSINESS_STATUSES.map((to): [BusinessStatus, BusinessStatus] => [from, to]),
  );

  it.each(pairs)('F2.18 %s → %s yalnızca belgedeki tabloya göre', (from, to) => {
    const allowed = ALLOWED.has(`${from}>${to}`);
    expect(BusinessStateMachine.canTransition(from, to)).toBe(allowed);
    if (allowed) {
      expect(() => {
        BusinessStateMachine.assertTransition(from, to);
      }).not.toThrow();
    } else {
      expect(() => {
        BusinessStateMachine.assertTransition(from, to);
      }).toThrow(new DomainError('INVALID_STATE_TRANSITION'));
    }
  });
});
