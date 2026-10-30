// Bildirim tabloları erişimi (F1.11, drizzle/0011_notifications.sql). Her işlem kullanıcı
// bağlamında (withUserTx): U tablolarında yalnızca o kullanıcının satırları görünür. Worker da
// alıcı adına aynı bağlamı kullanır. Şablonlar (G) herkese açıktır.
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { type Tx, withUserTx } from '../../core/db';
import type { TemplatesByLang, TemplateText } from './notification-template';
import {
  notificationPreferences,
  notifications,
  notificationTemplates,
  type PushPlatform,
  pushTokens,
} from './notifications.schema';

export interface StoredPayload {
  readonly id: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface NotificationRow {
  readonly id: string;
  readonly businessId: string | null;
  readonly type: string;
  readonly payload: StoredPayload;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NewNotification {
  readonly id: string;
  readonly userId: string;
  readonly businessId: string | null;
  readonly type: string;
  readonly payload: StoredPayload;
  readonly now: Date;
}

export interface TokenRow {
  readonly id: string;
  readonly token: string;
}

/** `{ id, params }` yükünü okur; bozuk yükte boş değerler (ayrıntı yine API'den çekilir). */
function readPayload(raw: unknown): StoredPayload {
  if (typeof raw !== 'object' || raw === null) return { id: '', params: {} };
  const value = raw as { id?: unknown; params?: unknown };
  const params: Record<string, string | number> = {};
  if (typeof value.params === 'object' && value.params !== null) {
    for (const [key, item] of Object.entries(value.params)) {
      if (typeof item === 'string' || typeof item === 'number') params[key] = item;
    }
  }
  return { id: typeof value.id === 'string' ? value.id : '', params };
}

@Injectable()
export class NotificationsRepository {
  /** Kullanıcı bağlamında işlem (U tabloları). */
  async asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await withUserTx({ userId }, fn);
  }

  /** Alıcının seçtiği dil (kendi `users` satırı); seçilmemişse null. */
  async preferredLanguage(tx: Tx, userId: string): Promise<string | null> {
    const result = await tx.execute<{ preferred_language: string | null }>(
      sql`select preferred_language from users where id = ${userId}::uuid`,
    );
    return result.rows[0]?.preferred_language ?? null;
  }

  async insert(tx: Tx, row: NewNotification): Promise<void> {
    await tx.insert(notifications).values({
      id: row.id,
      userId: row.userId,
      businessId: row.businessId,
      type: row.type,
      payload: { id: row.payload.id, params: row.payload.params },
      createdAt: row.now,
    });
  }

  async findById(tx: Tx, id: string): Promise<NotificationRow | undefined> {
    const rows = await tx.select().from(notifications).where(eq(notifications.id, id));
    const row = rows[0];
    return row === undefined ? undefined : this.toRow(row);
  }

  /** En yeni önce; `before` verilirse o kimlikten eskiler (UUIDv7 zamana göre sıralı). */
  async list(tx: Tx, before: string | undefined, limit: number): Promise<NotificationRow[]> {
    const rows = await tx
      .select()
      .from(notifications)
      .where(before === undefined ? undefined : lt(notifications.id, before))
      .orderBy(desc(notifications.id))
      .limit(limit);
    return rows.map((row) => this.toRow(row));
  }

  /** Okunmamışları okundu yapar; `ids` undefined ise hepsi. */
  async markRead(tx: Tx, ids: readonly string[] | undefined, now: Date): Promise<void> {
    if (ids?.length === 0) return;
    await tx
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          isNull(notifications.readAt),
          ids === undefined ? undefined : inArray(notifications.id, [...ids]),
        ),
      );
  }

  /** Türün push tercihi; satır yoksa açık (data-model §4.16). */
  async pushEnabled(tx: Tx, type: string): Promise<boolean> {
    const rows = await tx
      .select({ pushEnabled: notificationPreferences.pushEnabled })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.type, type));
    return rows[0]?.pushEnabled ?? true;
  }

  async preferences(tx: Tx): Promise<Map<string, boolean>> {
    const rows = await tx
      .select({
        type: notificationPreferences.type,
        pushEnabled: notificationPreferences.pushEnabled,
      })
      .from(notificationPreferences);
    return new Map(rows.map((row) => [row.type, row.pushEnabled]));
  }

  async upsertPreference(
    tx: Tx,
    userId: string,
    type: string,
    pushEnabled: boolean,
    now: Date,
  ): Promise<void> {
    await tx
      .insert(notificationPreferences)
      .values({ userId, type, pushEnabled, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.type],
        set: { pushEnabled, updatedAt: now },
      });
  }

  /** Kullanıcının token'ları; `ids` verilirse yalnızca onlar. */
  async tokens(tx: Tx, ids?: readonly string[]): Promise<TokenRow[]> {
    return await tx
      .select({ id: pushTokens.id, token: pushTokens.token })
      .from(pushTokens)
      .where(ids === undefined ? undefined : inArray(pushTokens.id, [...ids]))
      .orderBy(pushTokens.id);
  }

  /** Kullanıcının token satırlarını siler (DeviceNotRegistered); başka kullanıcınınkine dokunmaz. */
  async deleteTokens(tx: Tx, ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await tx.delete(pushTokens).where(inArray(pushTokens.id, [...ids]));
    return result.rowCount ?? 0;
  }

  /** Token'ı çağıran kullanıcıya kaydeder veya taşır (`push_token_register`, SECURITY DEFINER). */
  async registerToken(
    tx: Tx,
    input: { id: string; token: string; platform: PushPlatform; now: Date },
  ): Promise<void> {
    await tx.execute(
      sql`select push_token_register(${input.id}::uuid, ${input.token}, ${input.platform}, ${input.now.toISOString()}::timestamptz)`,
    );
  }

  /** Türlerin şablonları: tür → (dil → metin). */
  async templates(tx: Tx, types: readonly string[]): Promise<Map<string, TemplatesByLang>> {
    const result = new Map<string, Map<string, TemplateText>>();
    if (types.length === 0) return result;
    const rows = await tx
      .select()
      .from(notificationTemplates)
      .where(inArray(notificationTemplates.type, [...types]));
    for (const row of rows) {
      const byLang = result.get(row.type) ?? new Map<string, TemplateText>();
      byLang.set(row.lang, { title: row.title, body: row.body });
      result.set(row.type, byLang);
    }
    return result;
  }

  private toRow(row: typeof notifications.$inferSelect): NotificationRow {
    return {
      id: row.id,
      businessId: row.businessId,
      type: row.type,
      payload: readPayload(row.payload),
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}
