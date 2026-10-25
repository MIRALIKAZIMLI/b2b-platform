// audit_logs ve AuditService gerçek PostgreSQL üzerinde (F1.9, US-057). Kayıtlar migrator
// (tablo sahibi) ile okunur; app_user okuyamaz.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { FixedClock } from '../../clock';
import { withPlatformTx, withSystemTx, withTenantTx } from '../../db';
import { AUDIT_MASK } from '../audit-mask';
import { type AuditEntry, AuditService } from '../audit.service';

interface AuditRow extends Record<string, unknown> {
  occurred_at: Date;
  actor_user_id: string | null;
  actor_type: string;
  impersonation_session_id: string | null;
  business_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  request_id: string | null;
}

async function rowsFor(targetId: string): Promise<AuditRow[]> {
  return queryAsOwner<AuditRow>(
    `select occurred_at, actor_user_id, actor_type, impersonation_session_id, business_id,
            action, target_type, target_id, before, after, host(ip) as ip, request_id
       from audit_logs where target_id = $1 order by id`,
    [targetId],
  );
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

const NOW = new Date('2026-10-25T10:00:00.000Z');

function entryFor(targetId: string, overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    actor: { type: 'user', userId: randomUUID() },
    businessId: randomUUID(),
    action: 'setting.updated',
    targetType: 'setting',
    targetId,
    before: { value: 1 },
    after: { value: 2 },
    ...overrides,
  };
}

describe('AuditService (entegrasyon)', () => {
  const service = new AuditService(new FixedClock(NOW));

  it('US-057 AC1: kayıt zaman, kullanıcı, işletme, işlem türü, hedef, eski ve yeni değeri taşır', async () => {
    const targetId = `business:${randomUUID()}:sms.daily_cap`;
    const ctx = { businessId: randomUUID(), userId: randomUUID() };
    const impersonationSessionId = randomUUID();

    await withTenantTx(ctx, (tx) =>
      service.record(
        tx,
        entryFor(targetId, {
          actor: { type: 'user', userId: ctx.userId },
          businessId: ctx.businessId,
          impersonationSessionId,
          context: { requestId: 'req-us057-ac1', ip: '192.0.2.10' },
        }),
      ),
    );

    expect(await rowsFor(targetId)).toEqual([
      {
        occurred_at: NOW,
        actor_user_id: ctx.userId,
        actor_type: 'user',
        impersonation_session_id: impersonationSessionId,
        business_id: ctx.businessId,
        action: 'setting.updated',
        target_type: 'setting',
        target_id: targetId,
        before: { value: 1 },
        after: { value: 2 },
        ip: '192.0.2.10',
        request_id: 'req-us057-ac1',
      },
    ]);
  });

  it('US-057 AC1: platform ve sistem bağlamında da yazılır', async () => {
    const platformTarget = `platform:platform:${randomUUID()}`;
    const systemTarget = `platform:platform:${randomUUID()}`;
    const userId = randomUUID();

    await withPlatformTx({ userId }, (tx) =>
      service.record(
        tx,
        entryFor(platformTarget, { actor: { type: 'platform', userId }, businessId: null }),
      ),
    );
    await withSystemTx((tx) =>
      service.record(
        tx,
        entryFor(systemTarget, { actor: { type: 'system', userId: null }, businessId: null }),
      ),
    );

    expect(await rowsFor(platformTarget)).toEqual([
      expect.objectContaining({ actor_type: 'platform', actor_user_id: userId, business_id: null }),
    ]);
    expect(await rowsFor(systemTarget)).toEqual([
      expect.objectContaining({ actor_type: 'system', actor_user_id: null }),
    ]);
  });

  it('F1.9-AC2: veritabanına maskeli yazılır (6 alanın hepsi)', async () => {
    const targetId = `business:${randomUUID()}:mask`;
    const personal = {
      phone_e164: '+994501234567',
      full_name: 'Ad Soyad',
      contact_name: 'Əlaqə',
      personal_phone: '+994551112233',
      email: 'a@b.az',
      delivery_snapshot: { address: 'Bakı', phone_e164: '+994501234567' },
      status: 'active',
    };

    await withSystemTx((tx) =>
      service.record(tx, entryFor(targetId, { before: personal, after: { nested: personal } })),
    );

    const masked = {
      phone_e164: AUDIT_MASK,
      full_name: AUDIT_MASK,
      contact_name: AUDIT_MASK,
      personal_phone: AUDIT_MASK,
      email: AUDIT_MASK,
      delivery_snapshot: AUDIT_MASK,
      status: 'active',
    };
    const [row] = await rowsFor(targetId);
    expect(row?.before).toEqual(masked);
    expect(row?.after).toEqual({ nested: masked });
    expect(JSON.stringify(row)).not.toContain('+994');
  });

  it('F1.9-AC2: camelCase alanlar da veritabanına maskeli yazılır', async () => {
    const targetId = `business:${randomUUID()}:mask-camel`;
    const personal = {
      phoneE164: '+994501234567',
      fullName: 'Ad Soyad',
      contactName: 'Əlaqə',
      personalPhone: '+994551112233',
      email: 'a@b.az',
      deliverySnapshot: { address: 'Bakı', phoneE164: '+994501234567' },
      status: 'active',
    };

    await withSystemTx((tx) =>
      service.record(tx, entryFor(targetId, { before: personal, after: { nested: [personal] } })),
    );

    const masked = {
      phoneE164: AUDIT_MASK,
      fullName: AUDIT_MASK,
      contactName: AUDIT_MASK,
      personalPhone: AUDIT_MASK,
      email: AUDIT_MASK,
      deliverySnapshot: AUDIT_MASK,
      status: 'active',
    };
    const [row] = await rowsFor(targetId);
    expect(row?.before).toEqual(masked);
    expect(row?.after).toEqual({ nested: [masked] });
    expect(JSON.stringify(row)).not.toMatch(/\+994|Ad Soyad|a@b\.az/);
  });

  it('F1.9-AC3: işlem geri alınırsa audit kaydı da yoktur (aynı tx)', async () => {
    const targetId = `business:${randomUUID()}:rollback`;

    const error = await errorOf(
      withSystemTx(async (tx) => {
        await service.record(tx, entryFor(targetId));
        throw new Error('işlem geri alındı');
      }),
    );

    expect((error as Error).message).toBe('işlem geri alındı');
    expect(await rowsFor(targetId)).toEqual([]);
  });

  it('US-057 AC3: app_user update → 42501', async () => {
    const targetId = `business:${randomUUID()}:update`;
    await withSystemTx((tx) => service.record(tx, entryFor(targetId)));

    const error = await errorOf(
      withSystemTx((tx) =>
        tx.execute(sql`update audit_logs set action = 'x' where target_id = ${targetId}`),
      ),
    );

    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(await rowsFor(targetId)).toEqual([
      expect.objectContaining({ action: 'setting.updated' }),
    ]);
  });

  it('US-057 AC3: app_user delete → 42501', async () => {
    const targetId = `business:${randomUUID()}:delete`;
    await withSystemTx((tx) => service.record(tx, entryFor(targetId)));

    const asSystem = await errorOf(
      withSystemTx((tx) => tx.execute(sql`delete from audit_logs where target_id = ${targetId}`)),
    );
    const asPlatform = await errorOf(
      withPlatformTx({ userId: randomUUID() }, (tx) => tx.execute(sql`delete from audit_logs`)),
    );

    expect(pgErrorCode(asSystem)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(pgErrorCode(asPlatform)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(await rowsFor(targetId)).toHaveLength(1);
  });

  it('US-057 AC3: app_user select ve truncate → 42501', async () => {
    const select = await errorOf(withSystemTx((tx) => tx.execute(sql`select * from audit_logs`)));
    const truncate = await errorOf(withSystemTx((tx) => tx.execute(sql`truncate audit_logs`)));

    expect(pgErrorCode(select)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(pgErrorCode(truncate)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.9: app_user yalnızca INSERT ve dizi USAGE yetkisine sahip; tablo rls:S', async () => {
    const [privileges] = await queryAsOwner<Record<string, unknown>>(`
      select has_table_privilege('app_user', 'audit_logs', 'INSERT') as can_insert,
             has_any_column_privilege('app_user', 'audit_logs', 'SELECT') as can_select,
             has_any_column_privilege('app_user', 'audit_logs', 'UPDATE') as can_update,
             has_table_privilege('app_user', 'audit_logs', 'DELETE') as can_delete,
             has_table_privilege('app_user', 'audit_logs', 'TRUNCATE') as can_truncate,
             has_sequence_privilege('app_user', 'audit_logs_id_seq', 'USAGE') as seq_usage,
             obj_description('audit_logs'::regclass, 'pg_class') as comment
    `);

    expect(privileges).toEqual({
      can_insert: true,
      can_select: false,
      can_update: false,
      can_delete: false,
      can_truncate: false,
      seq_usage: true,
      comment: 'rls:S',
    });
  });
});
