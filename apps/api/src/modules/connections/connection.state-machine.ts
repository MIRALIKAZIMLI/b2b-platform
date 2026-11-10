// Bağlantı durum makinesi (state-machines §2, F2.15a). Durum değişikliği yalnız buradan denetlenir;
// veritabanındaki `connections_guard` tetikleyicisi ikinci savunmadır (iptal edilmiş bağlantı bir
// daha `active` olmaz, K6: yeniden bağlantı = yeni istek + yeni satır).
import type { ConnectionStatus } from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';

const TRANSITIONS: Readonly<Record<ConnectionStatus, readonly ConnectionStatus[]>> = {
  active: ['cancelled'],
  cancelled: [],
};

export const ConnectionStateMachine = {
  canTransition(from: ConnectionStatus, to: ConnectionStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: ConnectionStatus, to: ConnectionStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },
};
