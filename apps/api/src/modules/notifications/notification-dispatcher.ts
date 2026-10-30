// Bildirim gönderimi (worker, F1.11; US-054 AC1–AC3, integrations §3).
// Olay → alıcının dilinde uygulama içi bildirim satırı → tercih açıksa push.
// - Push gruplar hâlinde (`push.batch_size`) gönderilir. Geçici hata → yalnızca başarısız grubun
//   token'larıyla yeni iş, `push.retry_delays_minutes` beklemesiyle; liste bitince vazgeçilir.
// - Bilette `DeviceNotRegistered` → token hemen silinir; başarılı biletler `push.receipt_check_minutes`
//   sonra makbuzla kontrol edilir, makbuzda `DeviceNotRegistered` → token silinir.
// - Loglarda ve iş verisinde yalnızca kimlik ve kod; token, metin, telefon, ad yok (F1.11-AC6).
import { Inject, Injectable } from '@nestjs/common';
import type { SettingValue } from '@b2b/shared';
import { InjectPinoLogger } from 'nestjs-pino';
import { Clock } from '../../core/clock';
import { IdGenerator } from '../../core/id-generator';
import {
  type PushMessage,
  PushPermanentError,
  type PushReceipt,
  PushSender,
  type PushTicket,
} from '../../core/ports/push-sender';
import { SettingsService } from '../settings';
import {
  NotificationJobs,
  PUSH_DELIVER_JOB,
  PUSH_RECEIPTS_JOB,
  type PushDeliverJob,
  type PushReceiptsJob,
} from './notification-jobs';
import { renderTemplate } from './notification-template';
import { intentsForEvent, type NotificationIntent } from './notification-types';
import { NotificationsRepository } from './notifications.repository';

export type PushSettingKey =
  'push.batch_size' | 'push.receipt_check_minutes' | 'push.retry_delays_minutes';

export interface PushSettingsPort {
  get<K extends PushSettingKey>(key: K): Promise<SettingValue<K>>;
}

/** PinoLogger'ın kullanılan kısmı. */
export interface NotificationLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

const MINUTE_MS = 60_000;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'Unknown';
}

export interface DeliveryResult {
  readonly sent: number;
  readonly removedTokens: number;
  readonly retryScheduled: boolean;
}

const NOTHING_SENT: DeliveryResult = { sent: 0, removedTokens: 0, retryScheduled: false };

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(NotificationsRepository) private readonly repo: NotificationsRepository,
    @Inject(SettingsService) private readonly settings: PushSettingsPort,
    @Inject(PushSender) private readonly sender: PushSender,
    @Inject(NotificationJobs) private readonly jobs: NotificationJobs,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
    @InjectPinoLogger(NotificationDispatcher.name) private readonly log: NotificationLog,
  ) {}

  /** Outbox olayından gelen iş: her alıcı için bildirim. */
  async handleEvent(type: string, payload: unknown): Promise<void> {
    for (const intent of intentsForEvent(type, payload)) {
      await this.notify(intent);
    }
  }

  /** Tek alıcı: satırı yazar; tercih açıksa push gönderir. Bildirim kimliğini döner. */
  async notify(intent: NotificationIntent): Promise<string> {
    const notificationId = this.ids.next();
    const pushEnabled = await this.repo.asUser(intent.userId, async (tx) => {
      await this.repo.insert(tx, {
        id: notificationId,
        userId: intent.userId,
        businessId: intent.businessId,
        type: intent.type,
        payload: { id: intent.subjectId, params: intent.params },
        now: this.clock.now(),
      });
      return await this.repo.pushEnabled(tx, intent.type);
    });
    this.log.info(
      { event: 'notification.created', notificationId, type: intent.type, pushEnabled },
      'bildirim yazıldı',
    );
    if (pushEnabled) {
      await this.deliver({ notificationId, userId: intent.userId, attempt: 0 });
    }
    return notificationId;
  }

  /** Push gönderimi (ilk deneme veya yeniden deneme işi). */
  async deliver(job: PushDeliverJob): Promise<DeliveryResult> {
    const prepared = await this.repo.asUser(job.userId, async (tx) => {
      const notification = await this.repo.findById(tx, job.notificationId);
      if (notification === undefined) return undefined;
      const lang = await this.repo.preferredLanguage(tx, job.userId);
      const templates = await this.repo.templates(tx, [notification.type]);
      const tokens = await this.repo.tokens(tx, job.tokenIds);
      return { notification, lang, templates, tokens };
    });
    if (prepared === undefined || prepared.tokens.length === 0) return NOTHING_SENT;

    const { notification } = prepared;
    const text = renderTemplate(
      prepared.templates.get(notification.type) ?? new Map(),
      prepared.lang,
      notification.payload.params,
    );
    if (text === undefined) {
      this.log.warn(
        {
          event: 'notification.template_missing',
          notificationId: notification.id,
          type: notification.type,
        },
        'bildirim şablonu yok, push gönderilmedi',
      );
      return NOTHING_SENT;
    }
    const data = { type: notification.type, id: notification.payload.id };
    const batchSize = await this.settings.get('push.batch_size');

    let sent = 0;
    const failedTokenIds: string[] = [];
    const deadTokenIds: string[] = [];
    const okTickets: PushReceiptsJob['tickets'] = [];
    for (const group of chunks(prepared.tokens, batchSize)) {
      const messages: PushMessage[] = group.map((row) => ({
        token: row.token,
        title: text.title,
        body: text.body,
        data,
      }));
      let tickets: PushTicket[];
      try {
        tickets = await this.sender.send(messages);
      } catch (error) {
        if (error instanceof PushPermanentError) {
          this.log.error(
            { event: 'push.send_rejected', notificationId: notification.id, errorType: error.name },
            'push sağlayıcısı isteği reddetti',
          );
        } else {
          failedTokenIds.push(...group.map((row) => row.id));
        }
        continue;
      }
      tickets.forEach((ticket, index) => {
        const row = group[index];
        if (row === undefined) return;
        if (ticket.status === 'ok') {
          sent += 1;
          okTickets.push({ ticketId: ticket.ticketId, pushTokenId: row.id });
        } else if (ticket.error === 'DeviceNotRegistered') {
          deadTokenIds.push(row.id);
        } else {
          this.log.warn(
            { event: 'push.ticket_error', notificationId: notification.id, error: ticket.error },
            'push bileti hata döndü',
          );
        }
      });
    }

    const removedTokens = await this.removeTokens(job.userId, deadTokenIds);
    const retryScheduled = await this.scheduleRetry(job, failedTokenIds);
    if (okTickets.length > 0) {
      const minutes = await this.settings.get('push.receipt_check_minutes');
      await this.jobs.add(
        { name: PUSH_RECEIPTS_JOB, data: { userId: job.userId, tickets: okTickets } },
        minutes * MINUTE_MS,
        `push-receipts-${job.notificationId}-${String(job.attempt)}`,
      );
    }
    return { sent, removedTokens, retryScheduled };
  }

  /** Makbuz kontrolü: `DeviceNotRegistered` olan token'ları siler. Silinen sayısını döner. */
  async checkReceipts(job: PushReceiptsJob): Promise<number> {
    let receipts: ReadonlyMap<string, PushReceipt>;
    try {
      receipts = await this.sender.getReceipts(job.tickets.map((ticket) => ticket.ticketId));
    } catch (error) {
      this.log.warn(
        {
          event: 'push.receipts_unavailable',
          tickets: job.tickets.length,
          errorType: errorName(error),
        },
        'push makbuzları alınamadı',
      );
      return 0;
    }
    const dead = job.tickets
      .filter((ticket) => {
        const receipt = receipts.get(ticket.ticketId);
        return receipt?.status === 'error' && receipt.error === 'DeviceNotRegistered';
      })
      .map((ticket) => ticket.pushTokenId);
    return await this.removeTokens(job.userId, dead);
  }

  private async removeTokens(userId: string, tokenIds: readonly string[]): Promise<number> {
    if (tokenIds.length === 0) return 0;
    const removed = await this.repo.asUser(userId, (tx) => this.repo.deleteTokens(tx, tokenIds));
    this.log.info(
      { event: 'push.tokens_removed', userId, count: removed, reason: 'DeviceNotRegistered' },
      'kayıtsız cihaz anahtarları silindi',
    );
    return removed;
  }

  private async scheduleRetry(job: PushDeliverJob, tokenIds: readonly string[]): Promise<boolean> {
    if (tokenIds.length === 0) return false;
    const delays = await this.settings.get('push.retry_delays_minutes');
    const delay = delays[job.attempt];
    const fields = {
      notificationId: job.notificationId,
      attempt: job.attempt,
      tokens: tokenIds.length,
    };
    if (delay === undefined) {
      this.log.error({ event: 'push.failed', ...fields }, 'push yeniden denemeleri tükendi');
      return false;
    }
    const next = job.attempt + 1;
    await this.jobs.add(
      {
        name: PUSH_DELIVER_JOB,
        data: {
          notificationId: job.notificationId,
          userId: job.userId,
          attempt: next,
          tokenIds: [...tokenIds],
        },
      },
      delay * MINUTE_MS,
      `push-deliver-${job.notificationId}-${String(next)}`,
    );
    this.log.warn(
      { event: 'push.retry_scheduled', ...fields, delayMinutes: delay },
      'push geçici hata, yeniden denenecek',
    );
    return true;
  }
}
