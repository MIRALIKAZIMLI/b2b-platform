// F3.3a-AC6 ürün durum makinesi (state-machines §14): bütün geçiş tablosu.
import { PRODUCT_STATUSES, type ProductStatus } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { ProductStateMachine } from '../product.state-machine';

const ALLOWED: ReadonlySet<string> = new Set([
  'draft>active',
  'draft>archived',
  'active>archived',
  'archived>draft',
]);

describe('F3.3a-AC6 ProductStateMachine', () => {
  const pairs = PRODUCT_STATUSES.flatMap((from) =>
    PRODUCT_STATUSES.filter((to) => to !== from).map(
      (to) => [from, to] as [ProductStatus, ProductStatus],
    ),
  );

  it.each(pairs)('F3.3a-AC6 %s → %s tablo ile aynı', (from, to) => {
    const allowed = ALLOWED.has(`${from}>${to}`);
    expect(ProductStateMachine.canTransition(from, to)).toBe(allowed);
    if (allowed) {
      expect(() => {
        ProductStateMachine.assertTransition(from, to);
      }).not.toThrow();
    } else {
      expect(() => {
        ProductStateMachine.assertTransition(from, to);
      }).toThrow(DomainError);
    }
  });

  it('F3.3a-AC6 yayından taslağa dönüş yok (gizlemek için arşiv)', () => {
    expect(ProductStateMachine.canTransition('active', 'draft')).toBe(false);
  });
});
