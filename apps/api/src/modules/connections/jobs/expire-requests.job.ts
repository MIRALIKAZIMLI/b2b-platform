// İstek süre dolumu (F2.16; US-026 AC1, state-machines §1 `pending → expired`, sistem).
// Worker'da `connections` kuyruğunda `connection.request_expiry_interval_minutes` aralıkla çalışır.
// Aynı anda tek kopya (Redis kilidi, `ScheduledJobRunner`); kilit düşse bile veritabanı satırları
// FOR UPDATE SKIP LOCKED ile aldığından her istek bir kez `expired` olur ve bir kez bildirilir.
// Her parti kendi bağlamsız işleminde: durum değişikliği ve outbox olayları birlikte yazılır.
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Clock } from '../../../core/clock';
import { type Tx, withSystemTx } from '../../../core/db';
import { ScheduledJobRunner, type ScheduledJobOutcome } from '../../../core/ops-metrics';
import { OutboxWriter } from '../../../core/outbox';
import { QUEUE_MAP } from '../../../infrastructure/queue';
import { SettingsService } from '../../settings';
import { ConnectionRequestStateMachine } from '../connection-request.state-machine';
import { ConnectionsRepository, type ExpiredRequestRow } from '../connections.repository';

/** BullMQ iş adı ve zamanlayıcı kimliği; aynı zamanda kilit ve `ops_metrics` adı. */
export const EXPIRE_REQUESTS_JOB = 'connections.expire_requests';

export type ExpireRequestsQueue = Pick<Queue, 'upsertJobScheduler'>;

@Injectable()
export class ExpireRequestsJob {
  constructor(
    @Inject(ConnectionsRepository)
    private readonly repository: Pick<ConnectionsRepository, 'expireDueRequestsTx'>,
    @Inject(OutboxWriter) private readonly outbox: Pick<OutboxWriter, 'write'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ScheduledJobRunner) private readonly runner: Pick<ScheduledJobRunner, 'run'>,
  ) {}

  /** Süresi dolmuş bütün pending istekleri partiler hâlinde kapatır; işlenen istek sayısı. */
  async run(): Promise<ScheduledJobOutcome> {
    const lockSeconds = await this.settings.get('connection.request_expiry_lock_seconds');
    const batchSize = await this.settings.get('connection.request_expiry_batch_size');
    // Geçiş tablosu kaynağı durum makinesi; veritabanı fonksiyonu yalnız pending satırları alır.
    ConnectionRequestStateMachine.assertTransition('pending', 'expired');
    return await this.runner.run(EXPIRE_REQUESTS_JOB, lockSeconds, async () => {
      // Tek çalışma içinde sabit an: çalışma sırasında süresi dolanlar bir sonraki turda.
      const now = this.clock.now();
      let total = 0;
      for (;;) {
        const expired = await withSystemTx((tx) => this.expireBatchTx(tx, now, batchSize));
        total += expired;
        if (expired < batchSize) return total;
      }
    });
  }

  private async expireBatchTx(tx: Tx, now: Date, batchSize: number): Promise<number> {
    const rows = await this.repository.expireDueRequestsTx(tx, now, batchSize);
    for (const row of rows) {
      if (row.recipientUserId === null) continue;
      await this.outbox.write(tx, {
        type: 'connection.request_expired',
        aggregateType: 'connection_request',
        aggregateId: row.requestId,
        businessIds: [row.sellerId, row.buyerId],
        payload: {
          requestId: row.requestId,
          sellerId: row.sellerId,
          buyerId: row.buyerId,
          userId: row.recipientUserId,
        },
      });
    }
    return countRequests(rows);
  }
}

function countRequests(rows: readonly ExpiredRequestRow[]): number {
  return new Set(rows.map((row) => row.requestId)).size;
}

/** Dakikalık aralık → BullMQ `every` (ms). */
export function expiryEveryMs(minutes: number): number {
  return minutes * 60_000;
}

/**
 * Worker açılışında zamanlayıcıyı kurar veya günceller; aynı kimlikle kurulduğundan birden çok
 * worker tek zamanlayıcı paylaşır. Aralık değişikliği bir sonraki worker açılışında geçerli olur.
 */
@Injectable()
export class ExpireRequestsSchedule implements OnApplicationBootstrap {
  constructor(
    @Inject(QUEUE_MAP) private readonly queues: Readonly<Record<string, ExpireRequestsQueue>>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const queue = this.queues.connections;
    if (queue === undefined) throw new Error('connections kuyruğu kayıtlı değil');
    const minutes = await this.settings.get('connection.request_expiry_interval_minutes');
    await queue.upsertJobScheduler(
      EXPIRE_REQUESTS_JOB,
      { every: expiryEveryMs(minutes) },
      { name: EXPIRE_REQUESTS_JOB, data: {} },
    );
  }
}
