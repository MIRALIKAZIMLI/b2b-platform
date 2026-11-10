// Bağlantı isteği durum makinesi (state-machines §1, F2.13a). Durum değişikliği yalnız buradan
// denetlenir; veritabanındaki `connection_requests_guard` tetikleyicisi ikinci savunmadır.
import type { ConnectionRequestStatus } from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';

const TRANSITIONS: Readonly<Record<ConnectionRequestStatus, readonly ConnectionRequestStatus[]>> = {
  pending: ['accepted', 'rejected', 'withdrawn', 'expired'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
};

export const ConnectionRequestStateMachine = {
  canTransition(from: ConnectionRequestStatus, to: ConnectionRequestStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: ConnectionRequestStatus, to: ConnectionRequestStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },

  /**
   * Kabul koşulu (state-machines §1 "İstek süresi dolmamış", SF-03): `pending` değilse
   * `INVALID_STATE_TRANSITION`; `expires_at` geçmişse (F2.16 işi henüz `expired` yapmamış olsa da)
   * `409 CONNECTION_REQUEST_EXPIRED`.
   */
  assertRespondable(status: ConnectionRequestStatus, expiresAt: Date, now: Date): void {
    this.assertTransition(status, 'accepted');
    if (expiresAt.getTime() <= now.getTime()) {
      throw new DomainError('CONNECTION_REQUEST_EXPIRED');
    }
  },
};
