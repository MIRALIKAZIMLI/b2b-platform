// Platform admininin perakendeci yönetimi (F2.18, US-015, US-016): roller, liste filtreleri,
// VÖEN reddetme gerekçe kodları ve durum eylemleri. API ve web aynı listeleri kullanır.
import { z } from 'zod';
import type { PlatformRole } from './platform-roles';

/**
 * productreport "Platform rolleri": Operasyon = perakendeci yönetimi ve moderasyon; Destek =
 * görüntüleme, değişiklik yapamaz. Yazma uçları yalnız `BUYER_ADMIN_WRITE_ROLES`.
 */
export const BUYER_ADMIN_WRITE_ROLES: readonly PlatformRole[] = ['super_admin', 'operations'];
export const BUYER_ADMIN_READ_ROLES: readonly PlatformRole[] = [
  'super_admin',
  'operations',
  'support',
];

/** openapi `GET /admin/buyers` `filter`. */
export const BUYER_ADMIN_FILTERS = ['all', 'voen_pending', 'dormant', 'suspended'] as const;
export type BuyerAdminFilter = (typeof BUYER_ADMIN_FILTERS)[number];

/**
 * VÖEN reddetme gerekçesi (US-015 AC2). Sabit kod listesi: outbox yükü ve bildirim parametresi
 * serbest metin taşıyamaz (ADR-0010 §3); her kodun bildirim metni az/ru/tr şablonundadır.
 */
export const VOEN_REJECT_REASONS = [
  'voen_not_found',
  'name_mismatch',
  'voen_inactive',
  'other',
] as const;
export type VoenRejectReason = (typeof VOEN_REJECT_REASONS)[number];

/** Admin notu (yalnız audit; perakendeciye gitmez). */
export const ADMIN_NOTE_MIN = 3;
export const ADMIN_NOTE_MAX = 500;
const adminNote = z.string().trim().min(ADMIN_NOTE_MIN).max(ADMIN_NOTE_MAX);

/** openapi `POST /admin/buyers/{id}/verify` gövdesi. */
export const voenDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('verify') }),
  z.strictObject({
    decision: z.literal('reject'),
    reason: z.enum(VOEN_REJECT_REASONS),
    note: adminNote.optional(),
  }),
]);
export type VoenDecision = z.infer<typeof voenDecisionSchema>;

/** openapi `POST /admin/businesses/{id}/status`; `archive` = admin "sil" (US-016 AC2–AC3). */
export const BUSINESS_STATUS_ACTIONS = ['suspend', 'unsuspend', 'archive'] as const;
export type BusinessStatusAction = (typeof BUSINESS_STATUS_ACTIONS)[number];

export const businessStatusActionSchema = z.strictObject({
  action: z.enum(BUSINESS_STATUS_ACTIONS),
  reason: adminNote,
});
export type BusinessStatusActionInput = z.infer<typeof businessStatusActionSchema>;

/**
 * e-taxes.gov.az (US-015 AC1; entegrasyon yok, moderatör VÖEN'i elle sorgular; c4-context). Sorgu
 * sayfasının tam adresi belgede yok; site ana sayfası açılır (VARSAYIM, platform sahibi değiştirebilir).
 */
export const E_TAXES_VOEN_LOOKUP_URL = 'https://www.e-taxes.gov.az/';
