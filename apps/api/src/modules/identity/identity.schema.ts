// Kimlik tabloları (data-model §4.2, F1.5a). RLS politikaları, GRANT'lar ve S tablolarının
// SECURITY DEFINER fonksiyonları migration'da elle yazılır (drizzle/0007_identity.sql, ADR-0005).
// - users (U): kullanıcı yalnızca kendi satırını görür; `id` uygulamada UUIDv7 (IdGenerator).
// - otp_challenges (S), dev_sms_outbox (S): app_user'ın doğrudan izni yok; yalnızca fonksiyonlar.
// Başka modüller `users` tablosunu FK için modülün index.ts'inden içe aktarır.
import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  inet,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { languages } from '../i18n';

export const USER_STATUSES = ['active', 'locked', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const OTP_PURPOSES = ['login', 'register', 'invitation'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    phoneE164: text('phone_e164').notNull().unique('users_phone_e164_uq'),
    fullName: text('full_name').notNull(),
    preferredLanguage: char('preferred_language', { length: 2 }).references(() => languages.code),
    timezone: text('timezone'),
    status: text('status').notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('users_status_check', sql`${table.status} in ('active', 'locked', 'deleted')`)],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey(),
    phoneE164: text('phone_e164').notNull(),
    purpose: text('purpose').notNull(),
    // HMAC-SHA256(OTP_HASH_KEY, 'otp:' + challengeId + ':' + kod), hex; kod düz metin saklanmaz.
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: smallint('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    requestIp: inet('request_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('otp_challenges_phone_created_idx').on(table.phoneE164, table.createdAt.desc()),
    check(
      'otp_challenges_purpose_check',
      sql`${table.purpose} in ('login', 'register', 'invitation')`,
    ),
  ],
);

/** Mock SMS kutusu (NFR-96): yalnızca dev/test/staging'de dolar; production'da boş kalır. */
export const devSmsOutbox = pgTable(
  'dev_sms_outbox',
  {
    id: uuid('id').primaryKey(),
    phoneE164: text('phone_e164').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('dev_sms_outbox_phone_created_idx').on(table.phoneE164, table.createdAt.desc()),
  ],
);

export const DEVICE_TYPES = ['web', 'ios', 'android'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/**
 * Oturumlar (U, F1.5b). Her yenilemede aynı `family_id` ile yeni satır açılır, eski satır
 * `revoked_at` ile kapanır (data-model §4.2). `refresh_token_hash` = SHA-256 (hex).
 */
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    refreshTokenHash: text('refresh_token_hash')
      .notNull()
      .unique('user_sessions_refresh_token_hash_uq'),
    familyId: uuid('family_id').notNull(),
    deviceType: text('device_type').notNull(),
    deviceName: text('device_name'),
    ipCity: text('ip_city'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    impersonationSessionId: uuid('impersonation_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('user_sessions_user_idx').on(table.userId),
    index('user_sessions_family_idx').on(table.familyId),
    check('user_sessions_device_type_check', sql`${table.deviceType} in ('web', 'ios', 'android')`),
  ],
);
