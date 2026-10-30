// Dosya kayıtları (data-model §4.3 `files`, F1.10). RLS politikaları, GRANT'lar ve FK'lar
// (`owner_business_id` → businesses, `created_by` → users, `businesses.logo_file_id` bileşik FK)
// migration'da elle yazılır (drizzle/0012_files.sql); modül bağımlılığı files → identity,
// access, settings (c4-component §1), businesses değil.
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const FILE_STATUSES = ['pending', 'ready', 'rejected'] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey(),
    ownerBusinessId: uuid('owner_business_id'),
    purpose: text('purpose').notNull(),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull().unique('files_object_key_uq'),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: text('status').notNull().default('pending'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('files_owner_business_id_id_uq').on(table.ownerBusinessId, table.id),
    check(
      'files_purpose_check',
      sql`${table.purpose} in ('product_image', 'logo', 'delivery_photo', 'dispute_photo', 'import')`,
    ),
    check('files_bucket_check', sql`${table.bucket} in ('public', 'private')`),
    check('files_status_check', sql`${table.status} in ('pending', 'ready', 'rejected')`),
    check('files_size_bytes_check', sql`${table.sizeBytes} > 0`),
  ],
);
