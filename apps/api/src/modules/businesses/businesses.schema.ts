// İşletme çekirdek tabloları (data-model §4.4, F1.7). RLS politikaları, GRANT'lar ve
// `businesses` alan koruma tetikleyicisi migration'da elle yazılır (drizzle/0004_businesses.sql,
// ADR-0005). `id` kolonları uygulamada UUIDv7 ile üretilir (IdGenerator); `activity_types.id`
// `regions` gibi veritabanında üretilir (G tablosu, satırları admin/SQL girer).
//
// Henüz var olmayan tablolara giden FK'lar eklenmez (F1 faz spesifikasyonu §6.10):
// `logo_file_id` → files (F1.10), `default_price_list_id` → price_lists (F3).
// `verified_by` / `approved_by` → users FK'sı F1.5a migration'ında elle eklendi (drizzle/0007_identity.sql;
// şemadan identity modülünü içe aktarmak modüller arası döngü yaratır).
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { countries, currencies, languages, regions } from '../i18n';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const CAPABILITIES = ['seller', 'buyer'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const CAPABILITY_STATUSES = ['pending', 'approved', 'suspended'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export const activityTypes = pgTable('activity_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: jsonb('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey(),
    legalName: text('legal_name').notNull(),
    voen: char('voen', { length: 10 }),
    legalType: text('legal_type'),
    countryCode: char('country_code', { length: 2 })
      .notNull()
      .default('AZ')
      .references(() => countries.code),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id),
    addressLine: text('address_line'),
    geoLat: numeric('geo_lat', { precision: 9, scale: 6 }),
    geoLng: numeric('geo_lng', { precision: 9, scale: 6 }),
    businessPhone: text('business_phone'),
    logoFileId: uuid('logo_file_id'),
    defaultLanguage: char('default_language', { length: 2 }).references(() => languages.code),
    currencyCode: char('currency_code', { length: 3 }).references(() => currencies.code),
    timezone: text('timezone').notNull(),
    status: text('status').notNull().default('active'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    // FK users: migration'da elle (drizzle/0007_identity.sql, F1.5a).
    verifiedBy: uuid('verified_by'),
    createdVia: text('created_via').notNull(),
    dataConsentVersion: text('data_consent_version'),
    dataConsentAt: timestamp('data_consent_at', { withTimezone: true }),
    profileCompleteness: smallint('profile_completeness').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('businesses_voen_uq')
      .on(table.voen)
      .where(sql`${table.voen} is not null`),
    index('businesses_active_region_idx')
      .on(table.regionId)
      .where(sql`${table.status} = 'active'`),
    check('businesses_voen_format_check', sql`${table.voen} ~ '^[0-9]{9}[12]$'`),
    check(
      'businesses_legal_type_check',
      sql`${table.legalType} in ('legal_entity', 'individual_entrepreneur')`,
    ),
    check(
      'businesses_status_check',
      sql`${table.status} in ('active', 'suspended', 'dormant', 'archived')`,
    ),
    check('businesses_created_via_check', sql`${table.createdVia} in ('admin', 'self_signup')`),
    check(
      'businesses_profile_completeness_check',
      sql`${table.profileCompleteness} between 0 and 100`,
    ),
  ],
);

export const businessCapabilities = pgTable(
  'business_capabilities',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    capability: text('capability').notNull(),
    status: text('status').notNull(),
    // FK users: migration'da elle (drizzle/0007_identity.sql, F1.5a).
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.businessId, table.capability] }),
    check(
      'business_capabilities_capability_check',
      sql`${table.capability} in ('seller', 'buyer')`,
    ),
    check(
      'business_capabilities_status_check',
      sql`${table.status} in ('pending', 'approved', 'suspended')`,
    ),
  ],
);

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    addressLine: text('address_line'),
    isDefault: boolean('is_default').notNull().default(false),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (table) => [
    // seller_profiles.default_warehouse_id bileşik FK'sının hedefi (yalnızca kendi deposu).
    unique('warehouses_business_id_id_uq').on(table.businessId, table.id),
    uniqueIndex('warehouses_single_default_uq')
      .on(table.businessId)
      .where(sql`${table.isDefault}`),
    check('warehouses_status_check', sql`${table.status} in ('active', 'inactive')`),
  ],
);

export const sellerProfiles = pgTable(
  'seller_profiles',
  {
    businessId: uuid('business_id')
      .primaryKey()
      .references(() => businesses.id),
    description: jsonb('description'),
    stockMode: text('stock_mode').notNull().default('availability'),
    minOrderAmount: numeric('min_order_amount', { precision: 14, scale: 2 }),
    requireDeliveryPhoto: boolean('require_delivery_photo').notNull().default(false),
    lowStockDisplayThreshold: numeric('low_stock_display_threshold', { precision: 14, scale: 3 })
      .notNull()
      .default('5'),
    defaultPriceListId: uuid('default_price_list_id'),
    defaultWarehouseId: uuid('default_warehouse_id'),
    ...timestamps,
  },
  (table) => [
    // Bileşik FK: varsayılan depo yalnızca aynı işletmenin deposu olabilir (FK kontrolü RLS'e bakmaz).
    foreignKey({
      name: 'seller_profiles_default_warehouse_fk',
      columns: [table.businessId, table.defaultWarehouseId],
      foreignColumns: [warehouses.businessId, warehouses.id],
    }),
    check(
      'seller_profiles_stock_mode_check',
      sql`${table.stockMode} in ('none', 'availability', 'quantity')`,
    ),
  ],
);

export const serviceAreas = pgTable(
  'service_areas',
  {
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => businesses.id),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.sellerId, table.regionId] })],
);

export const buyerProfiles = pgTable(
  'buyer_profiles',
  {
    businessId: uuid('business_id')
      .primaryKey()
      .references(() => businesses.id),
    activityTypeId: uuid('activity_type_id')
      .notNull()
      .references(() => activityTypes.id),
    listedInDirectory: boolean('listed_in_directory').notNull().default(true),
    dormantStage: text('dormant_stage').notNull().default('none'),
    dormantStageAt: timestamp('dormant_stage_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      'buyer_profiles_dormant_stage_check',
      sql`${table.dormantStage} in ('none', 'reminded_7', 'reminded_30', 'warned', 'deactivated')`,
    ),
  ],
);

export const businessPrivacy = pgTable('business_privacy', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id),
  showLogo: boolean('show_logo').notNull().default(false),
  showAddress: boolean('show_address').notNull().default(false),
  showBusinessPhone: boolean('show_business_phone').notNull().default(false),
  showVoen: boolean('show_voen').notNull().default(false),
  showContactName: boolean('show_contact_name').notNull().default(false),
  showPersonalContact: boolean('show_personal_contact').notNull().default(false),
  ...timestamps,
});

/** 🔒 Kişisel veri (data-model §5): loglanmaz, silme talebinde satır silinir. */
export const personData = pgTable('person_data', {
  id: uuid('id').primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .unique('person_data_business_id_uq')
    .references(() => businesses.id),
  contactName: text('contact_name').notNull(),
  personalPhone: text('personal_phone'),
  email: text('email'),
  ...timestamps,
});

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    regionId: uuid('region_id').references(() => regions.id),
    addressLine: text('address_line').notNull(),
    geoLat: numeric('geo_lat', { precision: 9, scale: 6 }),
    geoLng: numeric('geo_lng', { precision: 9, scale: 6 }),
    approvalRule: text('approval_rule').notNull().default('every_order'),
    approvalThreshold: numeric('approval_threshold', { precision: 14, scale: 2 }),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (table) => [
    check(
      'branches_approval_rule_check',
      sql`${table.approvalRule} in ('every_order', 'above_amount', 'none')`,
    ),
    check(
      'branches_approval_threshold_check',
      sql`${table.approvalRule} <> 'above_amount' or ${table.approvalThreshold} is not null`,
    ),
    check('branches_status_check', sql`${table.status} in ('active', 'inactive')`),
  ],
);
