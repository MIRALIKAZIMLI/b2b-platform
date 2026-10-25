import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../clock';
import type { Tx } from '../../db';
import { settingAuditTargetId } from '../audit-actions';
import { AUDIT_MASK } from '../audit-mask';
import { type AuditEntry, AuditService } from '../audit.service';
import { auditLogs } from '../audit.schema';

/** `tx.insert(tablo).values(satır)` çağrılarını toplayan sahte işlem. */
function fakeTx(): { tx: Tx; inserts: { table: unknown; values: unknown }[] } {
  const inserts: { table: unknown; values: unknown }[] = [];
  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve();
      },
    }),
  } as unknown as Tx;
  return { tx, inserts };
}

const NOW = new Date('2026-10-25T09:30:00.000Z');

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    actor: { type: 'platform', userId: randomUUID() },
    businessId: randomUUID(),
    action: 'setting.updated',
    targetType: 'setting',
    targetId: 'platform:platform:sms.daily_cap',
    before: 1,
    after: 2,
    ...overrides,
  };
}

describe('AuditService (birim)', () => {
  it('US-057 AC1: satır zaman (Clock), kullanıcı, işletme, işlem, hedef, eski/yeni değer taşır', async () => {
    const service = new AuditService(new FixedClock(NOW));
    const { tx, inserts } = fakeTx();
    const input = entry({ context: { requestId: 'req-abc12345', ip: '2001:db8::1' } });

    await service.record(tx, input);

    expect(inserts).toEqual([
      {
        table: auditLogs,
        values: {
          occurredAt: NOW,
          actorUserId: input.actor.userId,
          actorType: 'platform',
          impersonationSessionId: null,
          businessId: input.businessId,
          action: 'setting.updated',
          targetType: 'setting',
          targetId: 'platform:platform:sms.daily_cap',
          before: 1,
          after: 2,
          ip: '2001:db8::1',
          requestId: 'req-abc12345',
        },
      },
    ]);
  });

  it('F1.9-AC2: before/after maskelenerek yazılır; eksik değer null', async () => {
    const service = new AuditService(new FixedClock(NOW));
    const { tx, inserts } = fakeTx();

    await service.record(
      tx,
      entry({ before: { phone_e164: '+994501234567', name: 'A' }, after: undefined }),
    );

    expect(inserts[0]?.values).toMatchObject({
      before: { phone_e164: AUDIT_MASK, name: 'A' },
      after: null,
    });
  });

  it('sistem işi: kullanıcı null kabul edilir', async () => {
    const service = new AuditService(new FixedClock(NOW));
    const { tx, inserts } = fakeTx();

    await service.record(tx, entry({ actor: { type: 'system', userId: null }, businessId: null }));

    expect(inserts[0]?.values).toMatchObject({ actorType: 'system', actorUserId: null });
  });

  it('geçersiz zarf (listede olmayan işlem, uuid olmayan işletme, geçersiz IP) yazılmaz', async () => {
    const service = new AuditService(new FixedClock(NOW));
    const { tx, inserts } = fakeTx();
    const invalid = [
      { ...entry(), action: 'setting.deleted' },
      entry({ businessId: 'kiraci-1' }),
      entry({ context: { ip: '999.1.1.1' } }),
      entry({ targetId: '' }),
    ] as AuditEntry[];

    for (const item of invalid) {
      await expect(service.record(tx, item)).rejects.toThrow();
    }
    expect(inserts).toEqual([]);
  });

  it("US-057 AC3: AuditService'te güncelleme veya silme metodu yok", () => {
    const methods = Object.getOwnPropertyNames(AuditService.prototype).filter(
      (name) => name !== 'constructor',
    );

    expect(methods).toEqual(['record']);
  });

  it('ayar hedef kimliği <kapsam>:<kimlik>:<anahtar>', () => {
    const id = randomUUID();

    expect(settingAuditTargetId({ scope: 'platform' }, 'sms.daily_cap')).toBe(
      'platform:platform:sms.daily_cap',
    );
    expect(settingAuditTargetId({ scope: 'plan', planId: id }, 'sms.daily_cap')).toBe(
      `plan:${id}:sms.daily_cap`,
    );
    expect(settingAuditTargetId({ scope: 'business', businessId: id }, 'sms.daily_cap')).toBe(
      `business:${id}:sms.daily_cap`,
    );
  });
});
