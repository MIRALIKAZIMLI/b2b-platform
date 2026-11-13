// Şube onay kuralı (US-010 AC2, glossary `approval_rule`). F4 sepeti "onaya gönder" adımında bu
// tek fonksiyonu kullanır; kural burada test edilir. Para yalnız `Money` (decimal.js).
import type { Money } from '../../core/money';

export const BRANCH_APPROVAL_RULES = ['every_order', 'above_amount', 'none'] as const;
export type BranchApprovalRule = (typeof BRANCH_APPROVAL_RULES)[number];

/**
 * Sepet şube onayına düşer mi?
 * - `every_order`: her zaman.
 * - `none`: hiçbir zaman.
 * - `above_amount`: toplam eşiğin üstündeyse (eşit = onaysız; eşik onaysız en yüksek tutardır).
 *   Eşik `above_amount`'ta her zaman doludur
 *   (`branches_approval_threshold_check`); boş gelirse güvenli taraf: onaya düşer.
 */
export function requiresBranchApproval(
  rule: BranchApprovalRule,
  threshold: Money | null,
  cartTotal: Money,
): boolean {
  switch (rule) {
    case 'every_order':
      return true;
    case 'none':
      return false;
    case 'above_amount':
      // S4 (kullanıcı kararı 2026-11-13): eşiğe tam eşit toplam doğrudan gönderilir.
      return threshold === null ? true : cartTotal.greaterThan(threshold);
  }
}
