// Bağlantısız hesap gece işi (F2.17, US-027 AC1–AC5; state-machines §9). Worker'da `directory`
// kuyruğunda her gün `dormant.job_hour_utc`:00 UTC'de çalışır. Aynı anda tek kopya (Redis kilidi,
// `ScheduledJobRunner`); kilit düşse bile satırlar `FOR UPDATE SKIP LOCKED` ile alındığından her
// perakendeci bir kez ilerler. Her parti kendi bağlamsız işleminde: aşama, audit ve outbox birlikte.
// Ayarlar platform düzeyinden okunur (işletmeye özel `dormant.*` değeri bu işte uygulanmaz; kart K7).
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { type AuditRecorder, AuditService } from '../../../core/audit';
import { Clock } from '../../../core/clock';
import { type Tx, withSystemTx } from '../../../core/db';
import { ScheduledJobRunner, type ScheduledJobOutcome } from '../../../core/ops-metrics';
import { OutboxWriter } from '../../../core/outbox';
import { QUEUE_MAP } from '../../../infrastructure/queue';
import { BusinessStateMachine } from '../../businesses';
import { SettingsService } from '../../settings';
import { reindexCronPattern } from '../directory-schedule';
import {
  type DormantSettings,
  type DormantStep,
  dormantMinScanDays,
  dormantWarningLeadDays,
  nextDormantStep,
} from './dormant-policy';
import { type DormantRow, DormantRepository } from './dormant.repository';

/** BullMQ iş adı ve zamanlayıcı kimliği; aynı zamanda kilit ve `ops_metrics` adı. */
export const DORMANT_ACCOUNTS_JOB = 'directory.dormant_accounts';

const SYSTEM_ACTOR = { type: 'system' as const, userId: null };

interface BatchResult {
  readonly scanned: number;
  readonly processed: number;
  readonly lastId: string | null;
}

@Injectable()
export class DormantAccountsJob {
  constructor(
    @Inject(DormantRepository)
    private readonly repository: Pick<
      DormantRepository,
      'scanTx' | 'advanceTx' | 'archiveTx' | 'recipientsTx'
    >,
    @Inject(OutboxWriter) private readonly outbox: Pick<OutboxWriter, 'write'>,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ScheduledJobRunner) private readonly runner: Pick<ScheduledJobRunner, 'run'>,
  ) {}

  /** Uygun perakendecileri kimlik sırasıyla partiler hâlinde ilerletir; ilerleyen sayı. */
  async run(): Promise<ScheduledJobOutcome> {
    const lockSeconds = await this.settings.get('dormant.lock_seconds');
    const batchSize = await this.settings.get('dormant.batch_size');
    const settings: DormantSettings = {
      reminderDays: await this.settings.get('dormant.reminder_days'),
      warningDay: await this.settings.get('dormant.warning_day'),
      deactivateDay: await this.settings.get('dormant.deactivate_day'),
      deleteDay: await this.settings.get('dormant.delete_day'),
    };
    // Geçiş tablosu kaynağı durum makinesi (state-machines §9); veritabanı fonksiyonları yalnız bu
    // geçişleri yazar (`businesses_guard_platform_columns` migrator yolu).
    BusinessStateMachine.assertTransition('active', 'dormant');
    BusinessStateMachine.assertTransition('dormant', 'archived');
    return await this.runner.run(DORMANT_ACCOUNTS_JOB, lockSeconds, async () => {
      // Tek çalışma içinde sabit an (F2.16 kalıbı).
      const now = this.clock.now();
      let after: string | null = null;
      let total = 0;
      for (;;) {
        const cursor: string | null = after;
        const batch: BatchResult = await withSystemTx((tx) =>
          this.batchTx(tx, now, cursor, batchSize, settings),
        );
        total += batch.processed;
        if (batch.scanned < batchSize || batch.lastId === null) return total;
        after = batch.lastId;
      }
    });
  }

  private async batchTx(
    tx: Tx,
    now: Date,
    after: string | null,
    batchSize: number,
    settings: DormantSettings,
  ): Promise<BatchResult> {
    const rows = await this.repository.scanTx(
      tx,
      now,
      after,
      dormantMinScanDays(settings),
      batchSize,
    );
    let processed = 0;
    for (const row of rows) {
      const step = nextDormantStep(row, settings, now);
      if (step === undefined) continue;
      if (await this.applyTx(tx, row, step, now, settings)) processed += 1;
    }
    return { scanned: rows.length, processed, lastId: rows.at(-1)?.businessId ?? null };
  }

  private async applyTx(
    tx: Tx,
    row: DormantRow,
    step: DormantStep,
    now: Date,
    settings: DormantSettings,
  ): Promise<boolean> {
    if (step === 'archive') return await this.archiveTx(tx, row, now);
    if (!(await this.repository.advanceTx(tx, row.businessId, step, now))) return false;
    switch (step) {
      case 'reminded_7':
      case 'reminded_30':
        await this.remindTx(tx, row.businessId, step);
        return true;
      case 'warned':
        await this.warnTx(tx, row.businessId, dormantWarningLeadDays(settings));
        return true;
      case 'deactivated':
        await this.audit.record(tx, {
          actor: SYSTEM_ACTOR,
          businessId: row.businessId,
          action: 'business.dormant_deactivated',
          targetType: 'business',
          targetId: row.businessId,
          before: { status: 'active', dormantStage: 'warned' },
          after: { status: 'dormant', dormantStage: 'deactivated' },
        });
        // Dizinden çıkar (US-027 AC3; D fonksiyonları yalnız `active` işletmeyi okur).
        await this.directoryChangedTx(tx, row.businessId);
        return true;
    }
  }

  /** AC1: perakendeci adminlerine hatırlatma, bölgedeki toptancı adminlerine "yeni perakendeci". */
  private async remindTx(
    tx: Tx,
    businessId: string,
    stage: 'reminded_7' | 'reminded_30',
  ): Promise<void> {
    for (const admin of await this.repository.recipientsTx(tx, businessId, 'buyer_admins')) {
      await this.outbox.write(tx, {
        type: 'buyer.dormant_reminder',
        aggregateType: 'business',
        aggregateId: businessId,
        businessIds: [businessId],
        payload: { businessId, userId: admin.userId, stage },
      });
    }
    for (const seller of await this.repository.recipientsTx(tx, businessId, 'region_sellers')) {
      await this.outbox.write(tx, {
        type: 'buyer.dormant_new_buyer',
        aggregateType: 'business',
        aggregateId: businessId,
        businessIds: [seller.businessId],
        payload: { buyerId: businessId, businessId: seller.businessId, userId: seller.userId },
      });
    }
  }

  /** AC2: "hesabınız N gün sonra pasifleşecek". */
  private async warnTx(tx: Tx, businessId: string, days: number): Promise<void> {
    for (const admin of await this.repository.recipientsTx(tx, businessId, 'buyer_admins')) {
      await this.outbox.write(tx, {
        type: 'buyer.dormant_warning',
        aggregateType: 'business',
        aggregateId: businessId,
        businessIds: [businessId],
        payload: { businessId, userId: admin.userId, days },
      });
    }
  }

  /**
   * AC4: 180. gün (S1 = B): geçmişsiz kayıt kalıcı silinir, geçmişli arşivlenir. Silinen dosyaların
   * depo nesneleri worker'da silinmez (worker'da depo bağlantısı yok); artıkları F2.16b temizliği
   * toplar (kart K8). Audit'te yalnız sayılar.
   */
  private async archiveTx(tx: Tx, row: DormantRow, now: Date): Promise<boolean> {
    const result = await this.repository.archiveTx(tx, row.businessId, now);
    if (result.outcome === 'skipped') return false;
    await this.audit.record(tx, {
      actor: SYSTEM_ACTOR,
      businessId: row.businessId,
      action: result.outcome === 'purged' ? 'business.dormant_purged' : 'business.dormant_archived',
      targetType: 'business',
      targetId: row.businessId,
      before: { status: 'dormant', dormantStage: 'deactivated' },
      after: {
        status: result.outcome === 'purged' ? null : 'archived',
        personDataDeleted: result.personRows > 0,
        invitationsClosed: result.invitationsClosed,
        files: result.objectKeys.length,
      },
    });
    // İndeks belgesi kalkar (R24: anonimleştirmede dizinde kalıntı kalmaz).
    await this.directoryChangedTx(tx, row.businessId);
    return true;
  }

  private async directoryChangedTx(tx: Tx, businessId: string): Promise<void> {
    await this.outbox.write(tx, {
      type: 'buyer.profile_changed',
      aggregateType: 'business',
      aggregateId: businessId,
      businessIds: [businessId],
      payload: { businessId },
    });
  }
}

export type DormantScheduleQueue = Pick<Queue, 'upsertJobScheduler'>;

/**
 * Worker açılışında gece zamanlayıcısını kurar veya günceller (`dormant.job_hour_utc`, UTC); aynı
 * kimlikle kurulduğundan birden çok worker tek zamanlayıcı paylaşır. Saat değişikliği bir sonraki
 * worker açılışında geçerli olur.
 */
@Injectable()
export class DormantAccountsSchedule implements OnApplicationBootstrap {
  constructor(
    @Inject(QUEUE_MAP) private readonly queues: Readonly<Record<string, DormantScheduleQueue>>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const queue = this.queues.directory;
    if (queue === undefined) throw new Error('directory kuyruğu kayıtlı değil');
    const hour = await this.settings.get('dormant.job_hour_utc');
    await queue.upsertJobScheduler(
      DORMANT_ACCOUNTS_JOB,
      { pattern: reindexCronPattern(hour), tz: 'UTC' },
      { name: DORMANT_ACCOUNTS_JOB, data: {} },
    );
  }
}
