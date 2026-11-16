import type { BrandStatus } from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';

/**
 * state-machines.md §13: marka talebi yalnız `requested` iken onaylanır veya reddedilir. Admin
 * doğrudan `active` açar; `active` ve `rejected` son durumlardır (pasifleştirme `is_active` ile).
 */
const TRANSITIONS: Readonly<Record<BrandStatus, readonly BrandStatus[]>> = {
  requested: ['active', 'rejected'],
  active: [],
  rejected: [],
};

export const BrandStateMachine = {
  canTransition(from: BrandStatus, to: BrandStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: BrandStatus, to: BrandStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },
};
