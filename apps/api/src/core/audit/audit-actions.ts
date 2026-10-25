// Audit kayıt adlarının tek kaynağı (F1.9). Yeni işlem türü buraya eklenir; servis bu listede
// olmayan `action` / `target_type` değerini reddeder. Biçim: `<hedef>.<fiil>` (data-model §4.1).
import type { SettingKey } from '@b2b/shared';

export const AUDIT_ACTIONS = ['setting.updated'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = ['setting'] as const;
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
