// Bağlantı tabloları (data-model §4.7, F2.12a). RLS politikaları, GRANT'lar, `users` FK'ları ve
// SECURITY DEFINER fonksiyonları migration'da elle yazılır (drizzle/0022_connections.sql).
// `connection_requests` ve `connections` P sınıfı (satıcı veya alıcı), `blocks` T sınıfı (alıcı).
// `price_list_id` → price_lists FK'sı F3.6'da; `sales_rep_membership_id` FK'sı F2.14'te eklenir.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from '../businesses';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const connectionRequests = pgTable(
  'connection_requests',
  {
    id: uuid('id').primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => businesses.id),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => businesses.id),
    sentByUserId: uuid('sent_by_user_id').notNull(),
    message: text('message'),
    proposedPaymentTermDays: integer('proposed_payment_term_days'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    respondedByUserId: uuid('responded_by_user_id'),
    sellerLocalDate: date('seller_local_date').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('connection_requests_pending_pair_uq')
      .on(table.sellerId, table.buyerId)
      .where(sql`${table.status} = 'pending'`),
    index('connection_requests_seller_day_idx').on(table.sellerId, table.sellerLocalDate),
    index('connection_requests_buyer_status_idx').on(table.buyerId, table.status),
    index('connection_requests_pending_expires_idx')
      .on(table.expiresAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'connection_requests_status_check',
      sql`${table.status} in ('pending', 'accepted', 'rejected', 'expired', 'withdrawn')`,
    ),
    check('connection_requests_pair_check', sql`${table.sellerId} <> ${table.buyerId}`),
    check(
      'connection_requests_message_check',
      sql`${table.message} is null or char_length(${table.message}) <= 500`,
    ),
    check(
      'connection_requests_term_check',
      sql`${table.proposedPaymentTermDays} is null or ${table.proposedPaymentTermDays} between 0 and 180`,
    ),
  ],
);

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => businesses.id),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => businesses.id),
    requestId: uuid('request_id')
      .notNull()
      .references(() => connectionRequests.id),
    status: text('status').notNull().default('active'),
    priceListId: uuid('price_list_id'),
    branchPricingEnabled: boolean('branch_pricing_enabled').notNull().default(false),
    creditLimit: numeric('credit_limit', { precision: 14, scale: 2 }),
    paymentTermDays: integer('payment_term_days').notNull().default(0),
    salesRepMembershipId: uuid('sales_rep_membership_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedBySide: text('ended_by_side'),
    endReason: text('end_reason'),
    endedByUserId: uuid('ended_by_user_id'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('connections_active_pair_uq')
      .on(table.sellerId, table.buyerId)
      .where(sql`${table.status} = 'active'`),
    index('connections_buyer_active_idx')
      .on(table.buyerId)
      .where(sql`${table.status} = 'active'`),
    index('connections_seller_buyer_idx').on(table.sellerId, table.buyerId),
    check('connections_status_check', sql`${table.status} in ('active', 'cancelled')`),
    check(
      'connections_ended_by_side_check',
      sql`${table.endedBySide} is null or ${table.endedBySide} in ('seller', 'buyer')`,
    ),
    check(
      'connections_cancel_fields_check',
      sql`(${table.status} = 'active' and ${table.endedAt} is null and ${table.endedBySide} is null)
          or (${table.status} = 'cancelled' and ${table.endedAt} is not null and ${table.endedBySide} is not null)`,
    ),
    check('connections_pair_check', sql`${table.sellerId} <> ${table.buyerId}`),
    check(
      'connections_credit_limit_check',
      sql`${table.creditLimit} is null or ${table.creditLimit} >= 0`,
    ),
    check('connections_payment_term_check', sql`${table.paymentTermDays} between 0 and 180`),
  ],
);

export const blocks = pgTable(
  'blocks',
  {
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => businesses.id),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => businesses.id),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.buyerId, table.sellerId] })],
);
