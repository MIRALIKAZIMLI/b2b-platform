import { DomainError } from '../../core/errors/domain-error';
import type { BusinessStatus } from './businesses.schema';

/**
 * state-machines.md §9: işletme durumu. Platform admininin geçişleri (F2.18, US-016) ve bağlantısız
 * hesap aşamaları (`dormant`, F2.17). `archived` son durumdur.
 */
const TRANSITIONS: Readonly<Record<BusinessStatus, readonly BusinessStatus[]>> = {
  active: ['suspended', 'dormant', 'archived'],
  suspended: ['active', 'archived'],
  dormant: ['active', 'archived'],
  archived: [],
};

export const BusinessStateMachine = {
  canTransition(from: BusinessStatus, to: BusinessStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: BusinessStatus, to: BusinessStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },
};
