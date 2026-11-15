// F2.17 bağlantısız hesap gece işi (birim; sahte depo/outbox/audit). Veritabanı davranışı
// `dormant-accounts.int.test.ts`'te.
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../../core/clock';
import { OUTBOX_EVENTS } from '../../../core/outbox/event-registry';
import {
  DORMANT_ACCOUNTS_JOB,
  DormantAccountsJob,
  DormantAccountsSchedule,
} from '../jobs/dormant-accounts.job';
import type { DormantArchiveResult, DormantRow } from '../jobs/dormant.repository';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-01T02:00:00Z');

const SETTINGS: Record<string, unknown> = {
  'dormant.lock_seconds': 1800,
  'dormant.batch_size': 2,
  'dormant.reminder_days': [7, 30],
  'dormant.warning_day': 90,
  'dormant.deactivate_day': 120,
  'dormant.delete_day': 180,
  'dormant.job_hour_utc': 4,
};

function row(days: number, partial: Partial<DormantRow> = {}): DormantRow {
  return {
    businessId: randomUUID(),
    status: 'active',
    stage: 'none',
    stageAt: null,
    since: new Date(NOW.getTime() - days * DAY),
    ...partial,
  };
}

function setup(batches: DormantRow[][], archive?: Partial<DormantArchiveResult>) {
  const scans = [...batches];
  const sellerAdmin = { userId: randomUUID(), businessId: randomUUID() };
  const buyerAdmin = { userId: randomUUID(), businessId: '' };
  const repository = {
    scanTx: vi.fn(() => Promise.resolve(scans.shift() ?? [])),
    advanceTx: vi.fn(() => Promise.resolve(true)),
    archiveTx: vi.fn(() =>
      Promise.resolve({
        outcome: 'purged' as const,
        personRows: 1,
        invitationsClosed: 0,
        objectKeys: ['k'],
        ...archive,
      }),
    ),
    recipientsTx: vi.fn((_tx: unknown, _id: string, kind: string) =>
      Promise.resolve(kind === 'buyer_admins' ? [buyerAdmin] : [sellerAdmin]),
    ),
  };
  const outbox = { write: vi.fn(() => Promise.resolve()) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settings = { get: vi.fn((key: string) => Promise.resolve(SETTINGS[key])) };
  const runner = {
    run: vi.fn(async (_name: string, _lock: number, fn: () => Promise<number>) => ({
      status: 'done' as const,
      processed: await fn(),
    })),
  };
  const job = new DormantAccountsJob(
    repository,
    outbox,
    audit,
    settings as never,
    new FixedClock(NOW),
    runner,
  );
  return { job, repository, outbox, audit, runner, sellerAdmin, buyerAdmin };
}

vi.mock('../../../core/db', () => ({
  withSystemTx: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

describe('F2.17 DormantAccountsJob', () => {
  it('US-027-AC1 hatırlatma: perakendeci adminine hatırlatma, bölge toptancısına yeni perakendeci', async () => {
    const r = row(8);
    const { job, outbox, sellerAdmin, buyerAdmin } = setup([[r]]);
    expect(await job.run()).toEqual({ status: 'done', processed: 1 });
    expect(outbox.write).toHaveBeenCalledWith(expect.anything(), {
      type: 'buyer.dormant_reminder',
      aggregateType: 'business',
      aggregateId: r.businessId,
      businessIds: [r.businessId],
      payload: { businessId: r.businessId, userId: buyerAdmin.userId, stage: 'reminded_7' },
    });
    expect(outbox.write).toHaveBeenCalledWith(expect.anything(), {
      type: 'buyer.dormant_new_buyer',
      aggregateType: 'business',
      aggregateId: r.businessId,
      businessIds: [sellerAdmin.businessId],
      payload: {
        buyerId: r.businessId,
        businessId: sellerAdmin.businessId,
        userId: sellerAdmin.userId,
      },
    });
  });

  it('US-027-AC2 uyarı yükünde gün sayısı = pasifleşme − uyarı', async () => {
    const r = row(91, { stage: 'reminded_30', stageAt: new Date(NOW.getTime() - 61 * DAY) });
    const { job, outbox, buyerAdmin } = setup([[r]]);
    await job.run();
    expect(outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'buyer.dormant_warning',
        payload: { businessId: r.businessId, userId: buyerAdmin.userId, days: 30 },
      }),
    );
  });

  it('US-027-AC3 pasifleşme: audit (sistem) + dizin olayı, bildirim yok', async () => {
    const r = row(121, { stage: 'warned', stageAt: new Date(NOW.getTime() - 31 * DAY) });
    const { job, outbox, audit, repository } = setup([[r]]);
    await job.run();
    expect(repository.advanceTx).toHaveBeenCalledWith(
      expect.anything(),
      r.businessId,
      'deactivated',
      NOW,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: { type: 'system', userId: null },
        action: 'business.dormant_deactivated',
      }),
    );
    expect(outbox.write).toHaveBeenCalledTimes(1);
    expect(outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'buyer.profile_changed' }),
    );
  });

  it('US-027-AC4 S1 = B: geçmişsiz kayıt kalıcı silinir (dormant_purged), geçmişli arşivlenir', async () => {
    const deactivated = { status: 'dormant' as const, stage: 'deactivated' as const };
    const r = row(181, { ...deactivated, stageAt: new Date(NOW.getTime() - 61 * DAY) });
    const purged = setup([[r]]);
    await purged.job.run();
    expect(purged.audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'business.dormant_purged',
        after: { status: null, personDataDeleted: true, invitationsClosed: 0, files: 1 },
      }),
    );
    const archived = setup([[{ ...r }]], {
      outcome: 'archived',
      objectKeys: [],
      invitationsClosed: 2,
    });
    await archived.job.run();
    expect(archived.audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'business.dormant_archived' }),
    );
  });

  it('kilitli satırda uygunluk düştüyse (giriş, bağlantı) bildirim yok, sayılmaz', async () => {
    const { job, repository, outbox } = setup([[row(8)]]);
    repository.advanceTx.mockResolvedValueOnce(false);
    expect(await job.run()).toEqual({ status: 'done', processed: 0 });
    expect(outbox.write).not.toHaveBeenCalled();
  });

  it('dolu parti sonrası son kimlikten devam eder; adımı olmayan satır atlanır', async () => {
    const a = row(8);
    const b = row(3);
    const c = row(31, { stage: 'reminded_7', stageAt: new Date(NOW.getTime() - 24 * DAY) });
    const { job, repository } = setup([[a, b], [c]]);
    expect(await job.run()).toEqual({ status: 'done', processed: 2 });
    expect(repository.scanTx).toHaveBeenNthCalledWith(1, expect.anything(), NOW, null, 7, 2);
    expect(repository.scanTx).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      NOW,
      b.businessId,
      7,
      2,
    );
    expect(repository.advanceTx).toHaveBeenCalledTimes(2);
  });

  it('olaylar notifications kuyruğunda, yükte serbest metin yok', () => {
    for (const type of [
      'buyer.dormant_reminder',
      'buyer.dormant_new_buyer',
      'buyer.dormant_warning',
    ] as const) {
      expect(OUTBOX_EVENTS[type].queue).toBe('notifications');
    }
  });

  it('gece zamanlayıcısı dormant.job_hour_utc saatinde kurulur', async () => {
    const queue = { upsertJobScheduler: vi.fn(() => Promise.resolve(undefined as never)) };
    const settings = { get: vi.fn((key: string) => Promise.resolve(SETTINGS[key])) };
    await new DormantAccountsSchedule(
      { directory: queue },
      settings as never,
    ).onApplicationBootstrap();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      DORMANT_ACCOUNTS_JOB,
      { pattern: '0 4 * * *', tz: 'UTC' },
      { name: DORMANT_ACCOUNTS_JOB, data: {} },
    );
  });
});
