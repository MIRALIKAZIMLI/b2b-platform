// Platform admininin ayar ekranı (F2.19, US-017): roller ve istek şemaları. API ve web aynı
// tanımları kullanır; değer doğrulaması `settings.ts` kaydındadır (`parseSettingValue`).
import { z } from 'zod';
import type { PlatformRole } from './platform-roles';
import { isSettingKey, SETTING_SCOPES, type SettingKey } from './settings';

/** productreport "Platform rolleri": Süper Admin = "tam yetki, ayarlar, planlar" (F2.19 T1). */
export const SETTINGS_ADMIN_ROLES: readonly PlatformRole[] = ['super_admin'];

/** Değerin geldiği katman: kapsamdaki kayıt yoksa geçerli olan (openapi `AdminSettingItem`). */
export const SETTING_SOURCES = ['plan', 'platform', 'default'] as const;
export type SettingSource = (typeof SETTING_SOURCES)[number];

/** openapi `GET /admin/settings` sorgusu. Platform kapsamında `scopeId` verilmez, diğerlerinde zorunlu. */
export const adminSettingsQuerySchema = z
  .object({ scope: z.enum(SETTING_SCOPES).default('platform'), scopeId: z.uuid().optional() })
  .refine((query) => (query.scope === 'platform') === (query.scopeId === undefined), {
    path: ['scopeId'],
  });

export type AdminSettingsQuery = z.infer<typeof adminSettingsQuerySchema>;

const settingKeySchema = z.custom<SettingKey>((value) => isSettingKey(value));

/** openapi `PUT /admin/settings` gövdesi. Değer tipi ve sınırı servis tarafında doğrulanır. */
export const adminSettingUpdateSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('platform'),
    scopeId: z.null().optional(),
    key: settingKeySchema,
    value: z.unknown(),
  }),
  z.object({ scope: z.literal('plan'), scopeId: z.uuid(), key: settingKeySchema, value: z.unknown() }),
  z.object({
    scope: z.literal('business'),
    scopeId: z.uuid(),
    key: settingKeySchema,
    value: z.unknown(),
  }),
]);

export type AdminSettingUpdate = z.infer<typeof adminSettingUpdateSchema>;
