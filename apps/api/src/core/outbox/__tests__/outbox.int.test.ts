// Outbox (F1.2-AC4, F1.2-AC4b, F1.2-AC10): gerçek PostgreSQL (app_user) + Redis (BullMQ).
// Dağıtıcının hata yolları sahte kuyrukla, "commit → kuyrukta tek iş" gerçek BullMQ ile test edilir.
import { randomBytes, randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { createBullConnection } from '../../../infrastructure/queue';
import { FixedClock } from '../../clock';
import { type Tx, withSystemTx, withTenantTx } from '../../db';
import type { OutboxEventInput } from '../outbox.writer';
import { OutboxWriter } from '../outbox.writer';
import {
  OutboxDispatcher,
  type OutboxSettingKey,
  type OutboxSettingsPort,
} from '../outbox.dispatcher';
import { BullOutboxQueues, type OutboxJob, OutboxQueues } from '../outbox.queues';

interface EventRow extends Record<string, unknown> {
  id: string;
  type: string;
  processed_at: Date | null;
  attempts: number;
  last_error: string | null;
}

async function eventRows(): Promise<EventRow[]> {
  return queryAsOwner<EventRow>(
    'select id::text, type, processed_at, attempts, last_error from outbox_events order by id',
  );
}

function fakeSettings(values: Partial<Record<OutboxSettingKey, number>> = {}): OutboxSettingsPort {
  const defaults: Record<OutboxSettingKey, number> = {
    'outbox.batch_size': 100,
    'outbox.max_attempts': 10,
    'outbox.poll_interval_ms': 1000,
  };
  return { get: (key) => Promise.resolve(values[key] ?? defaults[key]) };
}

type LogFn = (obj: object, msg: string) => void;

function fakeLog(): { info: Mock<LogFn>; warn: Mock<LogFn>; error: Mock<LogFn> } {
  return { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>(), error: vi.fn<LogFn>() };
}

/** Eklenen işleri sırayla kaydeden, istenirse hata veren sahte kuyruk. */
class RecordingQueues extends OutboxQueues {
  readonly jobs: OutboxJob[] = [];
  ready = true;
  failWhen: (job: OutboxJob) => Error | undefined = () => undefined;

  isReady(): boolean {
    return this.ready;
  }

  add(job: OutboxJob): Promise<void> {
    const error = this.failWhen(job);
    if (error !== undefined) return Promise.reject(error);
    this.jobs.push(job);
    return Promise.resolve();
  }
}

function pingEvent(businessId: string, count = 1): OutboxEventInput {
  return {
    type: 'test.ping',
    aggregateType: 'test',
    aggregateId: randomUUID(),
    businessIds: [businessId],
    payload: { ref: randomUUID(), count },
  };
}

async function writeCommitted(...counts: number[]): Promise<void> {
  const writer = new OutboxWriter();
  const businessId = randomUUID();
  await withTenantTx({ businessId, userId: randomUUID() }, async (tx: Tx) => {
    for (const count of counts) {
      await writer.write(tx, pingEvent(businessId, count));
    }
  });
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

const clock = new FixedClock(new Date('2026-10-24T10:00:00.000Z'));

describe('Outbox (entegrasyon: PostgreSQL + Redis)', () => {
  beforeEach(async () => {
    // Testler aynı veritabanını kullanır; her test boş outbox ile başlar (yalnızca testte, sahip rolüyle).
    await queryAsOwner('delete from outbox_events');
  });

  it('F1.2-AC4: rollback → olay yok', async () => {
    const writer = new OutboxWriter();
    const businessId = randomUUID();
    const queues = new RecordingQueues();
    const error = await errorOf(
      withTenantTx({ businessId, userId: randomUUID() }, async (tx) => {
        await writer.write(tx, pingEvent(businessId));
        throw new Error('geri al');
      }),
    );

    expect(error).toBeInstanceOf(Error);
    expect(await eventRows()).toEqual([]);
    const result = await new OutboxDispatcher(
      fakeSettings(),
      queues,
      clock,
      fakeLog(),
    ).dispatchOnce();
    expect(result.dispatched).toBe(0);
    expect(queues.jobs).toEqual([]);
  });

  describe('gerçek BullMQ', () => {
    let connection: Redis;
    let queue: Queue;

    beforeEach(async () => {
      connection = createBullConnection({ url: process.env.REDIS_URL ?? '' });
      queue = new Queue('test', {
        connection,
        prefix: `test-bull-${randomBytes(6).toString('hex')}`,
      });
      await queue.waitUntilReady();
    });

    afterEach(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
      connection.disconnect();
    });

    it('F1.2-AC4: commit → kuyrukta tek iş', async () => {
      await writeCommitted(7);
      const dispatcher = new OutboxDispatcher(
        fakeSettings(),
        new BullOutboxQueues(connection, { test: queue }),
        clock,
        fakeLog(),
      );

      const first = await dispatcher.dispatchOnce();
      const second = await dispatcher.dispatchOnce();
      const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
      const [row] = await eventRows();

      expect(first.dispatched).toBe(1);
      expect(second.dispatched).toBe(0);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.name).toBe('test.ping');
      expect(jobs[0]?.id).toBe(`outbox-${row?.id ?? ''}`);
      expect(jobs[0]?.data).toMatchObject({
        eventId: row?.id,
        type: 'test.ping',
        payload: { count: 7 },
      });
      expect(row?.processed_at).toEqual(clock.now());
    });

    it('F1.2-AC4: aynı olay yeniden eklenirse BullMQ ikinci iş açmaz (jobId)', async () => {
      await writeCommitted(1);
      const [row] = await eventRows();
      const queues = new BullOutboxQueues(connection, { test: queue });
      const job: OutboxJob = {
        queue: 'test',
        name: 'test.ping',
        jobId: `outbox-${row?.id ?? ''}`,
        data: { eventId: row?.id ?? '' },
      };
      await queues.add(job);
      await queues.add(job);

      expect(await queue.getJobCountByTypes('waiting')).toBe(1);
    });
  });

  it('D2: yazıcı gerçek app_user bağlantısıyla, RETURNING olmadan yazar', async () => {
    const businessId = randomUUID();
    const role = await withTenantTx({ businessId, userId: randomUUID() }, async (tx) => {
      await new OutboxWriter().write(tx, pingEvent(businessId));
      const result = await tx.execute<{ current_user: string }>(sql`select current_user`);
      return result.rows[0]?.current_user;
    });

    expect(role).toBe('app_user');
    const rows = await queryAsOwner<{ business_ids: string[]; aggregate_type: string }>(
      'select business_ids, aggregate_type from outbox_events',
    );
    expect(rows).toEqual([{ business_ids: [businessId], aggregate_type: 'test' }]);
  });

  it('F1.2-AC4b: sıra korunur', async () => {
    await writeCommitted(1, 2, 3);
    await writeCommitted(4);
    const queues = new RecordingQueues();
    await new OutboxDispatcher(fakeSettings(), queues, clock, fakeLog()).dispatchOnce();
    const rows = await eventRows();

    expect(
      queues.jobs.map((job) => (job.data as { payload: { count: number } }).payload.count),
    ).toEqual([1, 2, 3, 4]);
    expect(queues.jobs.map((job) => job.jobId)).toEqual(rows.map((row) => `outbox-${row.id}`));
    expect(rows.every((row) => row.processed_at !== null)).toBe(true);
  });

  it('F1.2-AC4b: parti boyutu outbox.batch_size ayarından', async () => {
    await writeCommitted(1, 2, 3);
    const queues = new RecordingQueues();
    const result = await new OutboxDispatcher(
      fakeSettings({ 'outbox.batch_size': 2 }),
      queues,
      clock,
      fakeLog(),
    ).dispatchOnce();

    expect(result.claimed).toBe(2);
    expect(queues.jobs).toHaveLength(2);
  });

  it('F1.2-AC4b: başarısız dağıtım attempts++ ve tur durur (sonraki olay öne geçmez)', async () => {
    await writeCommitted(1, 2, 3);
    const queues = new RecordingQueues();
    queues.failWhen = (job) =>
      (job.data as { payload: { count: number } }).payload.count === 2
        ? new Error('telefon +994501234567 ile ilgili hata')
        : undefined;
    const log = fakeLog();
    const dispatcher = new OutboxDispatcher(fakeSettings(), queues, clock, log);

    const result = await dispatcher.dispatchOnce();
    const rows = await eventRows();

    expect(result).toMatchObject({ dispatched: 1, stopped: 'failed' });
    expect(rows.map((row) => [row.processed_at !== null, row.attempts])).toEqual([
      [true, 0],
      [false, 1],
      [false, 0],
    ]);
    expect(rows[1]?.last_error).toBe('Error');
    expect(JSON.stringify(rows)).not.toContain('+994');
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('+994');

    queues.failWhen = () => undefined;
    await dispatcher.dispatchOnce();
    expect(
      queues.jobs.map((job) => (job.data as { payload: { count: number } }).payload.count),
    ).toEqual([1, 2, 3]);
  });

  it('F1.2-AC4b: max_attempts sonrası olay atlanır ve error loglanır', async () => {
    await writeCommitted(1, 2);
    const queues = new RecordingQueues();
    queues.failWhen = (job) =>
      (job.data as { payload: { count: number } }).payload.count === 1 ? new Error('x') : undefined;
    const log = fakeLog();
    const dispatcher = new OutboxDispatcher(
      fakeSettings({ 'outbox.max_attempts': 2 }),
      queues,
      clock,
      log,
    );

    await dispatcher.dispatchOnce();
    expect(log.error).not.toHaveBeenCalled();
    await dispatcher.dispatchOnce();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0]?.[0]).toMatchObject({ event: 'outbox.dead', attempts: 2 });

    const third = await dispatcher.dispatchOnce();
    const rows = await eventRows();

    expect(third.dispatched).toBe(1);
    expect(rows.map((row) => [row.processed_at !== null, row.attempts])).toEqual([
      [false, 2],
      [true, 0],
    ]);
    await dispatcher.dispatchOnce();
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('F1.2-AC4b: bilinmeyen olay türü → attempts++, last_error hata türü', async () => {
    await queryAsOwner(
      `insert into outbox_events (type, aggregate_type, aggregate_id, business_ids, payload)
       values ('bilinmeyen.olay', 'test', $1, array[$2::uuid], '{}'::jsonb)`,
      [randomUUID(), randomUUID()],
    );
    const result = await new OutboxDispatcher(
      fakeSettings(),
      new RecordingQueues(),
      clock,
      fakeLog(),
    ).dispatchOnce();
    const [row] = await eventRows();

    expect(result.stopped).toBe('failed');
    expect(row).toMatchObject({ attempts: 1, last_error: 'UnknownOutboxEventError' });
  });

  it('K7: Redis hazır değilse tur atlanır, attempts artmaz, warn loglanır', async () => {
    await writeCommitted(1);
    const queues = new RecordingQueues();
    queues.ready = false;
    const log = fakeLog();
    const dispatcher = new OutboxDispatcher(fakeSettings(), queues, clock, log);

    // Açılışta bağlantı henüz kurulmamış olabilir: ilk tur uyarı vermez, ikincisi verir.
    const result = await dispatcher.dispatchOnce();
    expect(log.warn).not.toHaveBeenCalled();
    await dispatcher.dispatchOnce();
    const [row] = await eventRows();

    expect(result).toMatchObject({ claimed: 0, dispatched: 0, stopped: 'queue_unavailable' });
    expect(row).toMatchObject({ attempts: 0, processed_at: null });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toMatchObject({ event: 'outbox.queue_unavailable' });

    // Bağlantı hazır olduktan sonra kopma hemen uyarı verir.
    queues.ready = true;
    await dispatcher.dispatchOnce();
    queues.ready = false;
    await dispatcher.dispatchOnce();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('K7: ekleme sırasında bağlantı koparsa attempts artmaz', async () => {
    await writeCommitted(1, 2);
    const queues = new RecordingQueues();
    queues.failWhen = () => {
      queues.ready = false;
      return new Error('Connection is closed.');
    };
    const result = await new OutboxDispatcher(
      fakeSettings(),
      queues,
      clock,
      fakeLog(),
    ).dispatchOnce();
    const rows = await eventRows();

    expect(result.stopped).toBe('queue_unavailable');
    expect(rows.map((row) => row.attempts)).toEqual([0, 0]);
  });

  it('F1.2-AC4b: iki dağıtıcı aynı olayı iki kez almaz (FOR UPDATE SKIP LOCKED)', async () => {
    await writeCommitted(1, 2, 3);
    const first = await connectAsAppUser();
    const second = await connectAsAppUser();
    try {
      await first.query('begin');
      await second.query('begin');
      const a = await first.query<{ id: string }>('select id::text from outbox_claim_batch(2, 10)');
      const b = await second.query<{ id: string }>(
        'select id::text from outbox_claim_batch(10, 10)',
      );
      await first.query('commit');
      await second.query('commit');

      const ids = (await eventRows()).map((row) => row.id);
      expect(a.rows.map((row) => row.id)).toEqual(ids.slice(0, 2));
      expect(b.rows.map((row) => row.id)).toEqual(ids.slice(2));
    } finally {
      await first.end();
      await second.end();
    }
  });

  it('F1.2-AC4b: iki dağıtıcı eşzamanlı çalışınca her olay bir kez kuyruğa girer', async () => {
    await writeCommitted(1, 2, 3, 4, 5);
    const queues = new RecordingQueues();
    const settings = fakeSettings({ 'outbox.batch_size': 2 });
    const a = new OutboxDispatcher(settings, queues, clock, fakeLog());
    const b = new OutboxDispatcher(settings, queues, clock, fakeLog());
    for (let round = 0; round < 3; round++) {
      await Promise.all([a.dispatchOnce(), b.dispatchOnce()]);
    }
    const jobIds = queues.jobs.map((job) => job.jobId);

    expect(new Set(jobIds).size).toBe(jobIds.length);
    expect(jobIds).toHaveLength(5);
  });

  it('F1.2-AC10: app_user outbox_events tablosunu okuyamaz → 42501', async () => {
    const error = await errorOf(withSystemTx((tx) => tx.execute(sql`select * from outbox_events`)));
    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.2-AC10: app_user outbox_events update / delete → 42501', async () => {
    await writeCommitted(1);
    const update = await errorOf(
      withSystemTx((tx) => tx.execute(sql`update outbox_events set attempts = 5`)),
    );
    const remove = await errorOf(withSystemTx((tx) => tx.execute(sql`delete from outbox_events`)));

    expect(pgErrorCode(update)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(pgErrorCode(remove)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });
});

afterAll(async () => {
  await queryAsOwner('delete from outbox_events');
});
