// Erişim tabloları (data-model §4.5, F1.8a, ADR-0004). RLS politikaları, GRANT'lar, son admin
// tetikleyicisi ve `list_my_memberships()` migration'da elle yazılır (drizzle/0010_access.sql).
//
// G: permissions, role_templates, role_template_permissions, job_titles (platform yönetir).
// T: roles, role_permissions, memberships, membership_regions, invitations.
// `role_permissions` ve `membership_regions` business_id taşımaz; politikaları üst tabloya
// (roles / memberships) EXISTS ile bakar, üst tablonun kendi RLS'i süzer.
//
// Bileşik FK'lar (role, şube, depo aynı işletmeden): FK denetimi RLS'e tabi değildir; tek kolonlu
// FK başka kiracının rol/şube kimliğini kabul ederdi. `(business_id, x_id)` hedefi bunu engeller.
import { PERMISSION_CAPABILITIES, PERMISSION_SCOPES } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches, businesses, warehouses } from '../businesses';
import { regions } from '../i18n';
import { users } from '../identity';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const MEMBERSHIP_STATUSES = ['active', 'removed'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));
const SCOPES = inList(PERMISSION_SCOPES);
const ROLE_CAPABILITIES = inList(['seller', 'buyer']);

export const permissions = pgTable(
  'permissions',
  {
    code: text('code').primaryKey(),
    capability: text('capability').notNull(),
    module: text('module').notNull(),
    description: jsonb('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'permissions_capability_check',
      sql`${table.capability} in (${inList(PERMISSION_CAPABILITIES)})`,
    ),
  ],
);

export const roleTemplates = pgTable(
  'role_templates',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: jsonb('name').notNull(),
    capability: text('capability').notNull(),
    // Kopyalanan işletme rolünün admin bayrağı (İşletme Admini şablonu), data-model §4.5.
    isBusinessAdmin: boolean('is_business_admin').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check('role_templates_capability_check', sql`${table.capability} in (${ROLE_CAPABILITIES})`),
    check('role_templates_version_check', sql`${table.version} >= 1`),
  ],
);

export const roleTemplatePermissions = pgTable(
  'role_template_permissions',
  {
    templateId: uuid('template_id')
      .notNull()
      .references(() => roleTemplates.id, { onDelete: 'cascade' }),
    permissionCode: text('permission_code')
      .notNull()
      .references(() => permissions.code),
    defaultScope: text('default_scope').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.permissionCode] }),
    check('role_template_permissions_scope_check', sql`${table.defaultScope} in (${SCOPES})`),
  ],
);

export const jobTitles = pgTable(
  'job_titles',
  {
    id: uuid('id').primaryKey(),
    // Seed'in idempotent eşleşme anahtarı (data-model §4.5).
    code: text('code').notNull().unique(),
    name: jsonb('name').notNull(),
    capability: text('capability').notNull(),
    roleTemplateId: uuid('role_template_id').references(() => roleTemplates.id),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check('job_titles_capability_check', sql`${table.capability} in (${ROLE_CAPABILITIES})`),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    name: jsonb('name').notNull(),
    capability: text('capability').notNull(),
    isBusinessAdmin: boolean('is_business_admin').notNull().default(false),
    sourceTemplateId: uuid('source_template_id').references(() => roleTemplates.id),
    sourceTemplateVersion: integer('source_template_version'),
    ...timestamps,
  },
  (table) => [
    unique('roles_business_id_id_uq').on(table.businessId, table.id),
    check('roles_capability_check', sql`${table.capability} in (${ROLE_CAPABILITIES})`),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionCode: text('permission_code')
      .notNull()
      .references(() => permissions.code),
    scope: text('scope').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionCode] }),
    check('role_permissions_scope_check', sql`${table.scope} in (${SCOPES})`),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    roleId: uuid('role_id').notNull(),
    jobTitleId: uuid('job_title_id')
      .notNull()
      .references(() => jobTitles.id),
    branchId: uuid('branch_id'),
    warehouseId: uuid('warehouse_id'),
    status: text('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    unique('memberships_user_id_business_id_uq').on(table.userId, table.businessId),
    unique('memberships_business_id_id_uq').on(table.businessId, table.id),
    foreignKey({
      name: 'memberships_role_fk',
      columns: [table.businessId, table.roleId],
      foreignColumns: [roles.businessId, roles.id],
    }),
    foreignKey({
      name: 'memberships_branch_fk',
      columns: [table.businessId, table.branchId],
      foreignColumns: [branches.businessId, branches.id],
    }),
    foreignKey({
      name: 'memberships_warehouse_fk',
      columns: [table.businessId, table.warehouseId],
      foreignColumns: [warehouses.businessId, warehouses.id],
    }),
    check('memberships_status_check', sql`${table.status} in (${inList(MEMBERSHIP_STATUSES)})`),
  ],
);

export const membershipRegions = pgTable(
  'membership_regions',
  {
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id),
  },
  (table) => [primaryKey({ columns: [table.membershipId, table.regionId] })],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    phoneE164: text('phone_e164').notNull(),
    roleId: uuid('role_id').notNull(),
    jobTitleId: uuid('job_title_id')
      .notNull()
      .references(() => jobTitles.id),
    branchId: uuid('branch_id'),
    warehouseId: uuid('warehouse_id'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'invitations_role_fk',
      columns: [table.businessId, table.roleId],
      foreignColumns: [roles.businessId, roles.id],
    }),
    foreignKey({
      name: 'invitations_branch_fk',
      columns: [table.businessId, table.branchId],
      foreignColumns: [branches.businessId, branches.id],
    }),
    foreignKey({
      name: 'invitations_warehouse_fk',
      columns: [table.businessId, table.warehouseId],
      foreignColumns: [warehouses.businessId, warehouses.id],
    }),
  ],
);
