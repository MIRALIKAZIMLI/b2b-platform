// F1.11 entegrasyon: outbox → dağıtıcı → `notifications` işlemcisi → bildirim satırı + mock push.
// Gerçek PostgreSQL (app_user). Kuyruk ve push sağlayıcısı bellekte (kayıt tutan sahte kuyruk,
// MockPushSender); BullMQ gecikmesi eklenen işin `delay` değerinden okunur, beklenmez.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryAsOwner } from '../../../../test/isolation';
import { FixedClock } from '../../../core/clock';
import { withUserTx, withTenantTx } from '../../../core/db';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { OutboxDispatcher } from '../../../core/outbox';
import { type OutboxJob, OutboxQueues } from '../../../core/outbox/outbox.queues';
import { OutboxWriter } from '../../../core/outbox/outbox.writer';
import { PushTransientError } from '../../../core/ports/push-sender';
import { MockPushSender } from '../../../infrastructure/push';
import { NotificationDispatcher } from '../notification-dispatcher';
import { PUSH_DELIVER_JOB, PUSH_RECEIPTS_JOB } from '../notification-jobs';
import { NotificationsProcessor } from '../notifications.processor';
import { NotificationsRepository } from '../notifications.repository';
import { NOTIFICATION_TEMPLATES } from '../seed/notifications.seed';
import {
  expoToken,
  fakeLog,
  fakeSettings,
  insertRecipient,
  RecordingJobs,
  registerToken,
  runNotificationSeed,
} from './fixtures';

class RecordingQueues extends OutboxQueues {
  readonly jobs: OutboxJob[] = [];

  isReady(): boolean {
    return true;
  }

  add(job: OutboxJob): Promise<void> {
    this.jobs.push(job);
    return Promise.resolve();
  }
}

const outboxSettings = {
  get: (key: string) =>
    Promise.resolve(
      key === 'outbox.poll_interval_ms' ? 1000 : key === 'outbox.batch_size' ? 100 : 10,
    ),
};

interface NotificationRow extends Record<string, unknown> {
  id: string;
  type: string;
  payload: unknown;
}

async function notificationsOf(userId: string): Promise<NotificationRow[]> {
  const result = await withUserTx({ userId }, (tx) =>
    tx.execute<NotificationRow>(sql`select id::text, type, payload from notifications order by id`),
  );
  return result.rows;
}

describe('F1.11 bildirim ve push (entegrasyon)', () => {
  const clock = new FixedClock(new Date('2026-10-30T09:00:00.000Z'));
  const ids = new UuidV7IdGenerator(clock);
  const repo = new NotificationsRepository();
  let push: MockPushSender;
  let jobs: RecordingJobs;
  let log: ReturnType<typeof fakeLog>;

  function dispatcher(settings = fakeSettings()) {
    return new NotificationDispatcher(repo, settings, push, jobs, ids, clock, log);
  }

  /** Test olayını commit eder, dağıtıcıdan geçirir ve işlemciye verir (outbox → worker). */
  async function emitTestEvent(userId: string, ref: string, target = dispatcher()): Promise<void> {
    const writer = new OutboxWriter();
    const businessId = randomUUID();
    await withTenantTx({ businessId, userId }, (tx) =>
      writer.write(tx, {
        type: 'notification.test',
        aggregateType: 'test',
        aggregateId: ref,
        businessIds: [businessId],
        payload: { userId, ref },
      }),
    );
    const queues = new RecordingQueues();
    const outbox = new OutboxDispatcher(outboxSettings, queues, clock, {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    });
    await outbox.dispatchOnce();
    const job = queues.jobs.find((item) => item.name === 'notification.test');
    expect(job?.queue).toBe('notifications');
    if (job === undefined) throw new Error('olay kuyruğa eklenmedi');
    await new NotificationsProcessor(target).process({ name: job.name, data: job.data });
  }

  beforeAll(async () => {
    await runNotificationSeed();
  });

  beforeEach(async () => {
    await queryAsOwner('delete from outbox_events');
    push = new MockPushSender();
    jobs = new RecordingJobs();
    log = fakeLog();
  });

  it('US-054 AC1: test olayı → alıcının dilinde uygulama içi bildirim + push (mock)', async () => {
    const recipient = await insertRecipient('ru');
    const tokenId = await registerToken(repo, recipient.id, expoToken());
    const ref = randomUUID();

    await emitTestEvent(recipient.id, ref);

    const rows = await notificationsOf(recipient.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'test', payload: { id: ref, params: {} } });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      title: NOTIFICATION_TEMPLATES.test?.ru.title,
      body: NOTIFICATION_TEMPLATES.test?.ru.body,
      data: { type: 'test', id: ref },
    });
    const receipts = jobs.take();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.job.name).toBe(PUSH_RECEIPTS_JOB);
    expect(receipts[0]?.delayMs).toBe(15 * 60_000);
    expect(receipts[0]?.job.data).toMatchObject({
      userId: recipient.id,
      tickets: [{ pushTokenId: tokenId }],
    });
  });

  it('US-054 AC1: dil seçmemiş kullanıcıya az metin', async () => {
    const recipient = await insertRecipient(null);
    await registerToken(repo, recipient.id, expoToken());

    await emitTestEvent(recipient.id, randomUUID());

    expect(push.sent[0]?.title).toBe(NOTIFICATION_TEMPLATES.test?.az.title);
  });

  it('US-054 AC2: tür kapalıysa push gitmez, uygulama içi listede kalır', async () => {
    const recipient = await insertRecipient('az');
    await registerToken(repo, recipient.id, expoToken());
    await withUserTx({ userId: recipient.id }, (tx) =>
      repo.upsertPreference(tx, recipient.id, 'test', false, clock.now()),
    );

    await emitTestEvent(recipient.id, randomUUID());

    expect(await notificationsOf(recipient.id)).toHaveLength(1);
    expect(push.sent).toEqual([]);
    expect(push.batches).toEqual([]);
    expect(jobs.added).toEqual([]);
  });

  it('US-054 AC3: geçici hata → 3 deneme, 1/5/15 dk (ayardan), sonra vazgeçilir', async () => {
    const recipient = await insertRecipient('az');
    const tokenId = await registerToken(repo, recipient.id, expoToken());
    push.beforeSend = () => {
      throw new PushTransientError();
    };
    const target = dispatcher();

    await emitTestEvent(recipient.id, randomUUID(), target);

    const delays: number[] = [];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const scheduled = jobs.take();
      if (attempt === 4) {
        expect(scheduled).toEqual([]);
        break;
      }
      expect(scheduled).toHaveLength(1);
      const [retry] = scheduled;
      if (retry?.job.name !== PUSH_DELIVER_JOB) throw new Error('yeniden deneme işi yok');
      expect(retry.job.data).toMatchObject({ attempt, tokenIds: [tokenId] });
      delays.push(retry.delayMs);
      await new NotificationsProcessor(target).process({
        name: retry.job.name,
        data: retry.job.data,
      });
    }
    expect(delays).toEqual([60_000, 300_000, 900_000]);
    expect(push.sent).toEqual([]);
    expect(log.error.mock.calls.map(([obj]) => (obj as { event: string }).event)).toContain(
      'push.failed',
    );
  });

  it('US-054 AC3: gecikmeler push.retry_delays_minutes ayarından okunur', async () => {
    const recipient = await insertRecipient('az');
    await registerToken(repo, recipient.id, expoToken());
    push.beforeSend = () => {
      throw new PushTransientError();
    };

    await emitTestEvent(
      recipient.id,
      randomUUID(),
      dispatcher(fakeSettings({ 'push.retry_delays_minutes': [2, 7] })),
    );

    expect(jobs.take().map((item) => item.delayMs)).toEqual([2 * 60_000]);
  });

  it('US-054 AC3: geçici hatadan sonra yeniden deneme başarılı olursa gönderilir', async () => {
    const recipient = await insertRecipient('az');
    await registerToken(repo, recipient.id, expoToken());
    let failures = 1;
    push.beforeSend = () => {
      if (failures > 0) {
        failures -= 1;
        throw new PushTransientError();
      }
    };
    const target = dispatcher();
    await emitTestEvent(recipient.id, randomUUID(), target);
    const [retry] = jobs.take();
    if (retry?.job.name !== PUSH_DELIVER_JOB) throw new Error('yeniden deneme işi yok');

    await new NotificationsProcessor(target).process({
      name: retry.job.name,
      data: retry.job.data,
    });

    expect(push.sent).toHaveLength(1);
    expect(jobs.take().map((item) => item.job.name)).toEqual([PUSH_RECEIPTS_JOB]);
  });

  it('F1.11-AC4: bilette DeviceNotRegistered → token silinir, diğeri kalır', async () => {
    const recipient = await insertRecipient('az');
    const dead = expoToken();
    await registerToken(repo, recipient.id, dead);
    const aliveId = await registerToken(repo, recipient.id, expoToken());
    push.ticketFor = (message) =>
      message.token === dead ? { status: 'error', error: 'DeviceNotRegistered' } : undefined;

    await emitTestEvent(recipient.id, randomUUID());

    const remaining = await withUserTx({ userId: recipient.id }, (tx) => repo.tokens(tx));
    expect(remaining.map((row) => row.id)).toEqual([aliveId]);
  });

  it('F1.11-AC4: makbuzda DeviceNotRegistered → token silinir (mock makbuz)', async () => {
    const recipient = await insertRecipient('az');
    const tokenId = await registerToken(repo, recipient.id, expoToken());
    const target = dispatcher();
    await emitTestEvent(recipient.id, randomUUID(), target);
    const [receiptJob] = jobs.take();
    if (receiptJob?.job.name !== PUSH_RECEIPTS_JOB) throw new Error('makbuz işi yok');
    push.receiptFor = () => ({ status: 'error', error: 'DeviceNotRegistered' });

    await new NotificationsProcessor(target).process({
      name: receiptJob.job.name,
      data: receiptJob.job.data,
    });

    const remaining = await withUserTx({ userId: recipient.id }, (tx) => repo.tokens(tx));
    expect(remaining.find((row) => row.id === tokenId)).toBeUndefined();
  });

  it("F1.11-AC4: makbuz işi başka kullanıcıya taşınmış token'ı silmez", async () => {
    const first = await insertRecipient('az');
    const second = await insertRecipient('az');
    const token = expoToken();
    const tokenId = await registerToken(repo, first.id, token);
    const target = dispatcher();
    await emitTestEvent(first.id, randomUUID(), target);
    const [receiptJob] = jobs.take();
    if (receiptJob?.job.name !== PUSH_RECEIPTS_JOB) throw new Error('makbuz işi yok');
    // Cihaz bu arada ikinci kullanıcıya geçti.
    await registerToken(repo, second.id, token);
    push.receiptFor = () => ({ status: 'error', error: 'DeviceNotRegistered' });

    await new NotificationsProcessor(target).process({
      name: receiptJob.job.name,
      data: receiptJob.job.data,
    });

    const secondTokens = await withUserTx({ userId: second.id }, (tx) => repo.tokens(tx));
    expect(secondTokens.map((row) => row.id)).toEqual([tokenId]);
  });

  it('F1.11-AC4: grup boyu push.batch_size ayarından', async () => {
    const recipient = await insertRecipient('az');
    for (let index = 0; index < 5; index += 1) {
      await registerToken(repo, recipient.id, expoToken());
    }

    await emitTestEvent(
      recipient.id,
      randomUUID(),
      dispatcher(fakeSettings({ 'push.batch_size': 2 })),
    );

    expect(push.batches).toEqual([2, 2, 1]);
    expect(push.sent).toHaveLength(5);
  });

  it('F1.11-AC6: push gövdesi ve loglar telefon, ad, token içermez', async () => {
    const recipient = await insertRecipient('tr');
    const deadToken = expoToken();
    const liveToken = expoToken();
    await registerToken(repo, recipient.id, deadToken);
    await registerToken(repo, recipient.id, liveToken);
    push.ticketFor = (message) =>
      message.token === deadToken ? { status: 'error', error: 'DeviceNotRegistered' } : undefined;
    const target = dispatcher();

    await emitTestEvent(recipient.id, randomUUID(), target);
    // Yeniden deneme ve makbuz yollarındaki loglar da kapsansın.
    push.beforeSend = () => {
      throw new PushTransientError();
    };
    await target.notify({
      userId: recipient.id,
      businessId: null,
      type: 'test',
      subjectId: randomUUID(),
      params: {},
    });

    const secrets = [recipient.phone, recipient.fullName, deadToken, liveToken];
    const bodies = JSON.stringify(
      push.sent.map((message) => ({
        title: message.title,
        body: message.body,
        data: message.data,
      })),
    );
    const jobData = JSON.stringify(jobs.added.map((item) => item.job.data));
    const logs = log.text();
    for (const secret of secrets) {
      expect(bodies).not.toContain(secret);
      expect(jobData).not.toContain(secret);
      expect(logs).not.toContain(secret);
    }
    expect(Object.keys(push.sent[0]?.data ?? {}).sort()).toEqual(['id', 'type']);
    expect(log.info.mock.calls.length + log.warn.mock.calls.length).toBeGreaterThan(0);
  });
});
