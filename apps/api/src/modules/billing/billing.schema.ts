// Plan, hak, abonelik ve istisna tabloları (data-model §4.6, F1.4b). RLS politikaları, GRANT'lar
// ve `settings_get` güncellemesi migration'da elle yazılır (drizzle/0005_billing.sql, ADR-0005).
// `plans.id` ve `subscriptions.id` uygulamada UUIDv7 ile üretilir (IdGenerator, Mimar D4).
// `entitlement_overrides.created_by` → users FK'sı F1.5a'da eklendi (drizzle/0007_identity.sql).
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from '../businesses';
import { currencies } from '../i18n';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const PLAN_PERIODS = ['month', 'year'] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'grace', 'read_only', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Güncel abonelik sayılan durumlar (benzersiz indeksle aynı; data-model §4.6). */
export const CURRENT_SUBSCRIPTION_STATUSES = [
  'active',
  'grace',
  'read_only',
] as const satisfies readonly SubscriptionStatus[];

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull().unique('plans_code_uq'),
    name: jsonb('name').notNull(),
    capability: text('capability').notNull(),
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    period: text('period').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check('plans_capability_check', sql`${table.capability} in ('seller', 'buyer')`),
    check('plans_period_check', sql`${table.period} in ('month', 'year')`),
    check('plans_price_check', sql`${table.price} >= 0`),
  ],
);

export const planEntitlements = pgTable(
  'plan_entitlements',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.planId, table.key] })],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: text('status').notNull(),
    currentPeriodStart: date('current_period_start').notNull(),
    currentPeriodEnd: date('current_period_end').notNull(),
    graceUntil: date('grace_until'),
    paymentNote: text('payment_note'),
    ...timestamps,
  },
  (table) => [
    check(
      'subscriptions_status_check',
      sql`${table.status} in ('active', 'grace', 'read_only', 'cancelled')`,
    ),
    check(
      'subscriptions_period_check',
      sql`${table.currentPeriodEnd} >= ${table.currentPeriodStart}`,
    ),
    uniqueIndex('subscriptions_current_uq')
      .on(table.businessId)
      .where(sql`${table.status} in ('active', 'grace', 'read_only')`),
  ],
);

export const entitlementOverrides = pgTable(
  'entitlement_overrides',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    reason: text('reason'),
    // FK users: migration'da elle (drizzle/0007_identity.sql, F1.5a).
    createdBy: uuid('created_by'),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.businessId, table.key] })],
);
