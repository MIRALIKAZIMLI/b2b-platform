// Audit kayıt adlarının tek kaynağı (F1.9). Yeni işlem türü buraya eklenir; servis bu listede
// olmayan `action` / `target_type` değerini reddeder. Biçim: `<hedef>.<fiil>` (data-model §4.1).
import type { SettingKey } from '@b2b/shared';

export const AUDIT_ACTIONS = [
  'setting.updated',
  'otp.locked',
  'session.refresh_reused',
  'membership.role_changed',
  'membership.removed',
  'membership.scope_changed',
  'role.created',
  'role.updated',
  'seller.created',
  'seller.activation_resent',
  'invitation.accepted',
  'invitation.created',
  'invitation.revoked',
  'seller_application.approved',
  'seller_application.rejected',
  'buyer.registered',
  'business.voen_changed',
  'business.profile_updated',
  'business.privacy_updated',
  'warehouse.created',
  'warehouse.updated',
  'branch.created',
  'branch.updated',
  'seller_profile.updated',
  'service_areas.updated',
  'role_template.created',
  'role_template.updated',
  'job_title.created',
  'job_title.updated',
  'job_title.deleted',
  'connection.accepted',
  'block.created',
  'block.deleted',
  'connection.terms_updated',
  'connection.cancelled',
  // F2.18 (US-015, US-016): platform admininin perakendeci işlemleri; hedef `business`. Gerekçe
  // kodu ve admin notu audit'e girer; kişisel veri (telefon, ad) girmez.
  'business.voen_verified',
  'business.voen_rejected',
  'business.suspended',
  'business.unsuspended',
  'business.archived',
  'business.purged',
  // F2.17 (US-027): bağlantısız hesap; hedef `business`. Pasifleşme ve arşiv aktörü `system`,
  // yeniden açılma aktörü giriş yapan kullanıcı. Kişisel veri girmez (yalnız aşama ve sayılar).
  'business.dormant_deactivated',
  'business.dormant_archived',
  'business.dormant_purged',
  'business.reactivated',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// otp_challenge: hedef kimliği challengeId; telefon audit'e yazılmaz (F1.5a).
// session_family: hedef kimliği oturum ailesi (family_id), F1.5b.
// membership: hedef kimliği üyelik (memberships.id); kime = before/after.userId (F1.8a, US-013 AC4).
// business: hedef kimliği işletme (businesses.id; F2.1a toptancı açılışı, aktivasyon yeniden gönderimi;
// F2.3a perakendeci kaydı; F2.4 VÖEN ve profil düzenleme; F2.10 görünürlük ayarları).
// invitation: hedef kimliği davet (invitations.id); token, özeti ve telefon audit'e yazılmaz
// (F2.1a; F2.7a ekip daveti oluşturma / geri çekme).
// seller_application: hedef kimliği başvuru (seller_applications.id; F2.2 onay / ret).
// warehouse: hedef kimliği depo (warehouses.id; F2.6). Satıcı profili ve hizmet bölgeleri
// (F2.6) hedef olarak `business` kullanır.
// role: hedef kimliği işletme rolü (roles.id; F2.8 özel rol oluşturma / düzenleme; before/after ad
// ve izinler).
// role_template / job_title: hedef kimliği platform rol şablonu / unvan (G tabloları; F2.9 admin
// kataloğu, işletmesiz kayıt `business_id = null`; before/after ad, izinler, sürüm, aktiflik).
// connection: hedef kimliği bağlantı (connections.id; F2.13a kabul, after: istek kimliği, veri
// paylaşım onayı, vade). block: hedef kimliği engellenen satıcı (sellerId; işletme = alıcı).
export const AUDIT_TARGET_TYPES = [
  'setting',
  'otp_challenge',
  'session_family',
  'membership',
  'business',
  'invitation',
  'seller_application',
  'warehouse',
  'branch',
  'role',
  'role_template',
  'job_title',
  'connection',
  'block',
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/** Ayar kapsamı (SettingTarget ile aynı biçim). */
export type SettingAuditTarget =
  | { readonly scope: 'platform' }
  | { readonly scope: 'plan'; readonly planId: string }
  | { readonly scope: 'business'; readonly businessId: string };

/** Ayar hedef kimliği: `<kapsam>:<kimlik>:<anahtar>`; platform kapsamında kimlik `platform`. */
export function settingAuditTargetId(target: SettingAuditTarget, key: SettingKey): string {
  const id =
    target.scope === 'platform'
      ? 'platform'
      : target.scope === 'plan'
        ? target.planId
        : target.businessId;
  return `${target.scope}:${id}:${key}`;
}
