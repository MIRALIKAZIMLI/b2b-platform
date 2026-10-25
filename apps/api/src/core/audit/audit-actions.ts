// Audit kayıt adlarının tek kaynağı (F1.9). Yeni işlem türü buraya eklenir; servis bu listede
// olmayan `action` / `target_type` değerini reddeder. Biçim: `<hedef>.<fiil>` (data-model §4.1).
import type { SettingKey } from '@b2b/shared';

export const AUDIT_ACTIONS = ['setting.updated', 'otp.locked', 'session.refresh_reused'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// otp_challenge: hedef kimliği challengeId; telefon audit'e yazılmaz (F1.5a).
// session_family: hedef kimliği oturum ailesi (family_id), F1.5b.
export const AUDIT_TARGET_TYPES = ['setting', 'otp_challenge', 'session_family'] as const;
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
