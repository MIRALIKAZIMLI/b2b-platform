import { DomainError } from '../../core/errors/domain-error';
import type { SellerApplicationStatus } from './businesses.schema';

/** state-machines.md §12: başvuru yalnızca `pending` iken onaylanır veya reddedilir. */
const TRANSITIONS: Readonly<Record<SellerApplicationStatus, readonly SellerApplicationStatus[]>> = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export const SellerApplicationStateMachine = {
  canTransition(from: SellerApplicationStatus, to: SellerApplicationStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: SellerApplicationStatus, to: SellerApplicationStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },
};
