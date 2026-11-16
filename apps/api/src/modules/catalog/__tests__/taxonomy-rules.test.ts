// F3.2a birim testleri: marka durum makinesi (state-machines §13), görünür kategori ağacı (AC4) ve
// katalog adı tekliği (K3).
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { BrandStateMachine } from '../brand.state-machine';
import { namesClash } from '../catalog-names';
import type { CategoryRow } from '../categories.repository';
import { visibleCategories } from '../categories.service';

function node(id: string, parentId: string | null, depth: number, isActive = true): CategoryRow {
  return { id, parentId, name: { az: id }, depth, sortOrder: 0, isActive };
}

describe('F3.2a marka durum makinesi', () => {
  it('F3.2a-AC2 talep yalnız requested iken onaylanır veya reddedilir', () => {
    expect(BrandStateMachine.canTransition('requested', 'active')).toBe(true);
    expect(BrandStateMachine.canTransition('requested', 'rejected')).toBe(true);
    expect(BrandStateMachine.canTransition('active', 'rejected')).toBe(false);
    expect(BrandStateMachine.canTransition('rejected', 'active')).toBe(false);
    expect(BrandStateMachine.canTransition('active', 'requested')).toBe(false);
  });

  it('F3.2a-AC2 tabloda olmayan geçiş INVALID_STATE_TRANSITION', () => {
    expect(() => {
      BrandStateMachine.assertTransition('rejected', 'active');
    }).toThrow(DomainError);
    try {
      BrandStateMachine.assertTransition('active', 'rejected');
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_STATE_TRANSITION');
    }
  });
});

describe('F3.2a görünür kategori ağacı', () => {
  it('F3.2a-AC4 pasif düğüm ve pasif üstün bütün altı gizlenir', () => {
    const rows = [
      node('a', null, 1),
      node('b', null, 1, false),
      node('a1', 'a', 2),
      node('a2', 'a', 2, false),
      node('b1', 'b', 2),
      node('a1x', 'a1', 3),
      node('a2x', 'a2', 3),
      node('b1x', 'b1', 3),
    ];
    expect(visibleCategories(rows).map((row) => row.id)).toEqual(['a', 'a1', 'a1x']);
  });
});

describe('F3.2a katalog adı tekliği (K3)', () => {
  it('F3.2a-AC1 herhangi bir dilde büyük/küçük harf ve boşluk duyarsız eşleşme çakışmadır', () => {
    const base = { az: 'Şampun', ru: 'Шампунь', tr: 'Şampuan' };
    expect(namesClash(base, { az: ' şampun ', ru: 'X', tr: 'Y' })).toBe(true);
    expect(namesClash(base, { az: 'A', ru: 'шампунь', tr: 'Y' })).toBe(true);
    expect(namesClash(base, { az: 'A', ru: 'B', tr: 'C' })).toBe(false);
    // `en` yalnız ikisinde de doluysa karşılaştırılır.
    expect(namesClash({ ...base, en: 'Shampoo' }, { az: 'A', ru: 'B', tr: 'C' })).toBe(false);
    expect(
      namesClash({ ...base, en: 'Shampoo' }, { az: 'A', ru: 'B', tr: 'C', en: 'shampoo' }),
    ).toBe(true);
  });
});
