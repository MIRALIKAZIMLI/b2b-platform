// Outbox dağıtıcısı (worker; ADR-0010 §2, integrations §8, F1.2b Kararlar K7).
// Her tur: olaylar id sırasıyla kilitlenerek alınır (outbox_claim_batch, FOR UPDATE SKIP LOCKED),
// sırayla kuyruğa eklenir ve işlenmiş işaretlenir; hepsi tek işlemde.
// - Olaya özgü hata (bilinmeyen tür, kuyruk hatası): attempts++, last_error = hata türü, tur durur
//   (sonraki olay öne geçmez). attempts = outbox.max_attempts olunca olay "ölü": error loglanır,
//   bir daha alınmaz (alarm F6, elle yeniden kuyruğa alma runbook RB-06).
// - Redis hazır değil veya bağlantı koptu: attempts artmaz, tur atlanır, warn loglanır.
import { type BeforeApplicationShutdown, Inject, Injectable } from '@nestjs/common';
import { settingDefault } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import { InjectPinoLogger } from 'nestjs-pino';
import { SettingsService } from '../../modules/settings';
import { Clock } from '../clock';
import { type Tx, withSystemTx } from '../db';
import { serializeError } from '../logging/logger.module';
import { outboxEventDefinition, UnknownOutboxEventError } from './event-registry';
import { type OutboxJob, OutboxQueues } from './outbox.queues';

export type OutboxSettingKey =
  'outbox.batch_size' | 'outbox.max_attempts' | 'outbox.poll_interval_ms';

export interface OutboxSettingsPort {
  get(key: OutboxSettingKey): Promise<number>;
}

/** PinoLogger'ın kullanılan kısmı (nesne + mesaj). */
export interface OutboxLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface DispatchResult {
  readonly claimed: number;
  readonly dispatched: number;
  readonly stopped: 'none' | 'failed' | 'queue_unavailable';
}

interface ClaimedRow extends Record<string, unknown> {
  id: string;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  business_ids: string[];
  payload: unknown;
  attempts: number;
}

/** last_error ve log için: yalnızca hata türü ve SQLSTATE (mesaj kişisel veri taşıyabilir). */
function errorLabel(error: unknown): string {
  const safe = serializeError(error);
  return safe.sqlState === undefined ? safe.type : `${safe.type}/${safe.sqlState}`;
}

@Injectable()
export class OutboxDispatcher implements BeforeApplicationShutdown {
  private running = false;
  private loop: Promise<void> | undefined;
  private wake: (() => void) | undefined;
  private queueAvailable = true;
  /** Açılışta bağlantı henüz kurulmamışsa ilk tur uyarı vermez (yanlış alarm olmasın). */
  private queueEverReady = false;
  private unavailableTours = 0;

  constructor(
    @Inject(SettingsService) private readonly settings: OutboxSettingsPort,
    @Inject(OutboxQueues) private readonly queues: OutboxQueues,
    @Inject(Clock) private readonly clock: Clock,
    @InjectPinoLogger(OutboxDispatcher.name) private readonly log: OutboxLog,
  ) {}

  /** Bir dağıtım turu. */
  async dispatchOnce(): Promise<DispatchResult> {
    if (!this.queues.isReady()) {
      this.markQueueUnavailable();
      return { claimed: 0, dispatched: 0, stopped: 'queue_unavailable' };
    }
    const [batchSize, maxAttempts] = await Promise.all([
      this.settings.get('outbox.batch_size'),
      this.settings.get('outbox.max_attempts'),
    ]);
    const processedAt = this.clock.now().toISOString();

    return withSystemTx(async (tx): Promise<DispatchResult> => {
      const claimed = await tx.execute<ClaimedRow>(sql`
        select id::text as id, type, aggregate_type, aggregate_id, business_ids, payload, attempts
          from outbox_claim_batch(${batchSize}, ${maxAttempts})
      `);
      let dispatched = 0;
      for (const row of claimed.rows) {
        try {
          await this.queues.add(this.jobFor(row));
        } catch (error) {
          if (!this.queues.isReady()) {
            this.markQueueUnavailable();
            return { claimed: claimed.rows.length, dispatched, stopped: 'queue_unavailable' };
          }
          await this.recordFailure(tx, row, error, maxAttempts);
          return { claimed: claimed.rows.length, dispatched, stopped: 'failed' };
        }
        await tx.execute(
          sql`select outbox_mark_processed(${row.id}::bigint, ${processedAt}::timestamptz)`,
        );
        dispatched += 1;
      }
      this.markQueueAvailable();
      return { claimed: claimed.rows.length, dispatched, stopped: 'none' };
    });
  }

  /** Tarama döngüsünü başlatır (worker açılışında). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
  }

  /** Döngüyü durdurur; o anki tur biter. */
  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loop;
    this.loop = undefined;
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  /** `stop()` döngü beklerken çağrılabilir; değer her seferinde yeniden okunur. */
  private isRunning(): boolean {
    return this.running;
  }

  private async run(): Promise<void> {
    while (this.running) {
      let result: DispatchResult | undefined;
      try {
        result = await this.dispatchOnce();
      } catch (error) {
        this.log.error(
          { event: 'outbox.tour_failed', err: error },
          'outbox dağıtım turu başarısız',
        );
      }
      if (!this.isRunning()) break;
      // Olay dağıtıldıysa beklemeden devam edilir (birikmiş olaylar boşaltılır).
      if (result?.stopped === 'none' && result.dispatched > 0) continue;
      await this.sleep(await this.pollIntervalMs());
    }
  }

  private async pollIntervalMs(): Promise<number> {
    try {
      return await this.settings.get('outbox.poll_interval_ms');
    } catch (error) {
      this.log.warn(
        { event: 'outbox.settings_unavailable', err: error },
        'tarama aralığı okunamadı, varsayılan kullanılıyor',
      );
      return settingDefault('outbox.poll_interval_ms');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
  }

  private jobFor(row: ClaimedRow): OutboxJob {
    const definition = outboxEventDefinition(row.type);
    if (definition === undefined) {
      throw new UnknownOutboxEventError();
    }
    return {
      queue: definition.queue,
      name: row.type,
      jobId: `outbox-${row.id}`,
      data: {
        eventId: row.id,
        type: row.type,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        businessIds: row.business_ids,
        payload: row.payload,
      },
    };
  }

  private async recordFailure(
    tx: Tx,
    row: ClaimedRow,
    error: unknown,
    maxAttempts: number,
  ): Promise<void> {
    const errorType = errorLabel(error);
    const result = await tx.execute<{ attempts: number }>(
      sql`select outbox_mark_failed(${row.id}::bigint, ${errorType}) as attempts`,
    );
    const attempts = result.rows[0]?.attempts ?? row.attempts + 1;
    const fields = { outboxEventId: row.id, type: row.type, attempts, errorType };
    if (attempts >= maxAttempts) {
      this.log.error(
        { event: 'outbox.dead', ...fields },
        'outbox olayı en fazla deneme sayısına ulaştı, atlanıyor',
      );
    } else {
      this.log.warn({ event: 'outbox.dispatch_failed', ...fields }, 'outbox olayı dağıtılamadı');
    }
  }

  private markQueueUnavailable(): void {
    this.unavailableTours += 1;
    if (!this.queueAvailable) return;
    if (!this.queueEverReady && this.unavailableTours < 2) return;
    this.queueAvailable = false;
    this.log.warn(
      { event: 'outbox.queue_unavailable' },
      'kuyruk (Redis) hazır değil, dağıtım bekletiliyor',
    );
  }

  private markQueueAvailable(): void {
    this.unavailableTours = 0;
    this.queueEverReady = true;
    if (this.queueAvailable) return;
    this.queueAvailable = true;
    this.log.info({ event: 'outbox.queue_available' }, 'kuyruk (Redis) yeniden hazır');
  }
}
