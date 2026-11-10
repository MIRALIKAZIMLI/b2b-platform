// F2.13a: bağlantı isteği durum makinesi (state-machines §1). Önce test.
import { CONNECTION_REQUEST_STATUSES, type ConnectionRequestStatus } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { ConnectionRequestStateMachine } from '../connection-request.state-machine';

const ALLOWED: readonly (readonly [ConnectionRequestStatus, ConnectionRequestStatus])[] = [
  ['pending', 'accepted'],
  ['pending', 'rejected'],
  ['pending', 'withdrawn'],
  ['pending', 'expired'],
];

describe('ConnectionRequestStateMachine', () => {
  it('state-machines §1 yalnız pending → accepted/rejected/withdrawn/expired geçişleri var', () => {
    for (const from of CONNECTION_REQUEST_STATUSES) {
      for (const to of CONNECTION_REQUEST_STATUSES) {
        const expected = ALLOWED.some(([a, b]) => a === from && b === to);
        expect(ConnectionRequestStateMachine.canTransition(from, to), `${from}→${to}`).toBe(
          expected,
        );
      }
    }
  });

  it('state-machines §1 izinsiz geçiş 409 INVALID_STATE_TRANSITION', () => {
    expect(() => {
      ConnectionRequestStateMachine.assertTransition('accepted', 'rejected');
    }).toThrow(DomainError);
    try {
      ConnectionRequestStateMachine.assertTransition('withdrawn', 'accepted');
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_STATE_TRANSITION');
    }
    expect(() => {
      ConnectionRequestStateMachine.assertTransition('pending', 'withdrawn');
    }).not.toThrow();
  });

  it('US-023-AC2 süresi geçmiş bekleyen istek kabul edilemez (409 CONNECTION_REQUEST_EXPIRED)', () => {
    const now = new Date('2026-11-10T08:00:00Z');
    const past = new Date('2026-11-10T07:59:59Z');
    const future = new Date('2026-11-10T08:00:01Z');
    expect(() => {
      ConnectionRequestStateMachine.assertRespondable('pending', past, now);
    }).toThrow(expect.objectContaining({ code: 'CONNECTION_REQUEST_EXPIRED' }));
    expect(() => {
      ConnectionRequestStateMachine.assertRespondable('pending', now, now);
    }).toThrow(expect.objectContaining({ code: 'CONNECTION_REQUEST_EXPIRED' }));
    expect(() => {
      ConnectionRequestStateMachine.assertRespondable('pending', future, now);
    }).not.toThrow();
    expect(() => {
      ConnectionRequestStateMachine.assertRespondable('rejected', future, now);
    }).toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });
});
