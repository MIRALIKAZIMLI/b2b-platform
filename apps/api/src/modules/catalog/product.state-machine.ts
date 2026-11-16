import type { ProductStatus } from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';

/**
 * state-machines.md §14 (F3.3a, US-030 AC6; kart K1): taslak yayınlanır veya arşivlenir; yayındaki
 * ürün yalnız arşivlenir (yayından kaldırma = arşiv); arşiv taslağa geri alınır.
 */
const TRANSITIONS: Readonly<Record<ProductStatus, readonly ProductStatus[]>> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: ['draft'],
};

export const ProductStateMachine = {
  canTransition(from: ProductStatus, to: ProductStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: ProductStatus, to: ProductStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },
};
