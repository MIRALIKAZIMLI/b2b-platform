// F2.15a: bağlantı durum makinesi (state-machines §2). Önce test.
import { CONNECTION_STATUSES } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { ConnectionStateMachine } from '../connection.state-machine';

describe('ConnectionStateMachine', () => {
  it('state-machines §2 yalnız active → cancelled; cancelled bir daha active olmaz', () => {
    for (const from of CONNECTION_STATUSES) {
      for (const to of CONNECTION_STATUSES) {
        const expected = from === 'active' && to === 'cancelled';
        expect(ConnectionStateMachine.canTransition(from, to), `${from}→${to}`).toBe(expected);
      }
    }
  });

  it('US-025-AC5 iptal edilmiş bağlantıyı yeniden iptal 409 INVALID_STATE_TRANSITION', () => {
    expect(() => {
      ConnectionStateMachine.assertTransition('active', 'cancelled');
    }).not.toThrow();
    try {
      ConnectionStateMachine.assertTransition('cancelled', 'cancelled');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_STATE_TRANSITION');
    }
  });
});
