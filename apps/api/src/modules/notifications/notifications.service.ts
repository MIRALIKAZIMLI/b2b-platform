// Kullanıcının kendi bildirimleri (api, F1.11): cihaz anahtarı, liste, okundu, tercihler.
// Her işlem kullanıcı bağlamında (withUserTx): başka kullanıcının satırı görünmez (F1.11-AC7).
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { renderTemplate } from './notification-template';
import { isNotificationType, NOTIFICATION_TYPES } from './notification-types';
import { NotificationsRepository } from './notifications.repository';
import type { PushPlatform } from './notifications.schema';

export interface NotificationView {
  readonly id: string;
  readonly type: string;
  readonly businessId: string | null;
  readonly title: string;
  readonly body: string;
  readonly data: { readonly type: string; readonly id: string };
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface NotificationPage {
  readonly items: NotificationView[];
  readonly nextCursor: string | null;
}

export type ReadTarget = { readonly all: true } | { readonly ids: readonly string[] };

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NotificationsRepository) private readonly repo: NotificationsRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** openapi POST /push-tokens: token başka kullanıcıdaysa bu kullanıcıya taşınır. */
  async registerToken(userId: string, token: string, platform: PushPlatform): Promise<void> {
    await this.repo.asUser(userId, (tx) =>
      this.repo.registerToken(tx, { id: this.ids.next(), token, platform, now: this.clock.now() }),
    );
  }

  /** openapi GET /notifications: en yeni önce; metin kullanıcının dilinde (yoksa `az`). */
  async list(userId: string, cursor: string | undefined, limit: number): Promise<NotificationPage> {
    return await this.repo.asUser(userId, async (tx) => {
      const rows = await this.repo.list(tx, cursor, limit + 1);
      const page = rows.slice(0, limit);
      const lang = await this.repo.preferredLanguage(tx, userId);
      const templates = await this.repo.templates(tx, [...new Set(page.map((row) => row.type))]);
      const items = page.map((row): NotificationView => {
        const text = renderTemplate(templates.get(row.type) ?? new Map(), lang, row.payload.params);
        return {
          id: row.id,
          type: row.type,
          businessId: row.businessId,
          title: text?.title ?? row.type,
          body: text?.body ?? '',
          data: { type: row.type, id: row.payload.id },
          readAt: row.readAt === null ? null : row.readAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        };
      });
      const last = page.at(-1);
      return { items, nextCursor: rows.length > limit && last !== undefined ? last.id : null };
    });
  }

  /** openapi POST /notifications/read. */
  async markRead(userId: string, target: ReadTarget): Promise<void> {
    const now = this.clock.now();
    await this.repo.asUser(userId, (tx) =>
      this.repo.markRead(tx, 'all' in target ? undefined : target.ids, now),
    );
  }

  /** openapi PUT /notifications/preferences: tüm türlerin güncel tercihini döner. */
  async setPreferences(
    userId: string,
    changes: Readonly<Record<string, boolean>>,
  ): Promise<Record<string, boolean>> {
    for (const type of Object.keys(changes)) {
      if (!isNotificationType(type)) throw new DomainError('VALIDATION_FAILED', { type });
    }
    const now = this.clock.now();
    return await this.repo.asUser(userId, async (tx) => {
      for (const [type, enabled] of Object.entries(changes)) {
        await this.repo.upsertPreference(tx, userId, type, enabled, now);
      }
      const stored = await this.repo.preferences(tx);
      const result: Record<string, boolean> = {};
      for (const type of NOTIFICATION_TYPES) result[type] = stored.get(type) ?? true;
      return result;
    });
  }
}
