// Bildirim tabloları (data-model §4.16, F1.11). RLS politikaları, GRANT'lar ve
// `push_token_register` fonksiyonu migration'da elle yazılır (drizzle/0011_notifications.sql).
// - push_tokens, notifications, notification_preferences (U): kullanıcı yalnızca kendi satırları.
// - notification_templates (G): herkes okur, yalnızca platform yazar.
// `notifications.business_id` FK'sı migration'da elle (modül bağımlılığı: notifications →
// identity, access, i18n; businesses değil, c4-component §1).
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { languages } from '../i18n';
import { users } from '../identity';

export const PUSH_PLATFORMS = ['ios', 'android'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    token: text('token').notNull().unique('push_tokens_token_uq'),
    platform: text('platform').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('push_tokens_user_idx').on(table.userId),
    check('push_tokens_platform_check', sql`${table.platform} in ('ios', 'android')`),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    businessId: uuid('business_id'),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notifications_user_id_idx').on(table.userId, table.id)],
);

export const notificationTemplates = pgTable(
  'notification_templates',
  {
    type: text('type').notNull(),
    lang: char('lang', { length: 2 })
      .notNull()
      .references(() => languages.code),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ name: 'notification_templates_pk', columns: [table.type, table.lang] })],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'notification_preferences_pk', columns: [table.userId, table.type] }),
  ],
);
