import type { PriceListStatus } from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';

/**
 * state-machines.md §15: fiyat listesi `active` ↔ `archived`. Ek koşullar (varsayılan liste ve
 * bağlantıya atanmış liste arşivlenemez, K2/K3) servistedir; burada yalnız geçiş tablosu.
 */
const TRANSITIONS: Readonly<Record<PriceListStatus, readonly PriceListStatus[]>> = {
  active: ['archived'],
  archived: ['active'],
};

export const PriceListStateMachine = {
  canTransition(from: PriceListStatus, to: PriceListStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: PriceListStatus, to: PriceListStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },
};
