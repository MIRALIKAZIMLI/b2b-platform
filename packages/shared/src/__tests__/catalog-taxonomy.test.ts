// F3.2b admin katalog ekranları: form, hata eşleme ve kategori ağacı kuralları.
import { describe, expect, it } from 'vitest';
import {
  brandFormBody,
  categoryTree,
  type CategoryRow,
  taxonomyFailure,
  taxonomyFormBody,
} from '../catalog-taxonomy';

const NAME = { az: 'İçkilər', ru: 'Напитки', tr: 'İçecekler', en: '' };

function row(id: string, parentId: string | null, depth: number, extra: Partial<CategoryRow> = {}) {
  return { id, parentId, depth, sortOrder: 0, isActive: true, ...extra };
}

describe('F3.2b form kuralları', () => {
  it('F3.2b-AC6 az/ru/tr zorunlu, en isteğe bağlı; sıra boşsa 0', () => {
    const ok = taxonomyFormBody({ name: NAME, sortOrder: '' });
    expect(ok).toEqual({
      ok: true,
      body: { name: { az: 'İçkilər', ru: 'Напитки', tr: 'İçecekler' }, sortOrder: 0 },
    });
    const withEn = taxonomyFormBody({ name: { ...NAME, en: ' Drinks ' }, sortOrder: '20' });
    expect(withEn.ok && withEn.body).toEqual({
      name: { az: 'İçkilər', ru: 'Напитки', tr: 'İçecekler', en: 'Drinks' },
      sortOrder: 20,
    });
    const missing = taxonomyFormBody({ name: { ...NAME, ru: '  ' }, sortOrder: '0' });
    expect(missing).toEqual({ ok: false, errors: { 'name.ru': 'required' } });
  });

  it('F3.2b-AC6 ad 80 karakteri, sıra 0–10000 tam sayı sınırını aşamaz', () => {
    const long = taxonomyFormBody({ name: { ...NAME, az: 'a'.repeat(81) }, sortOrder: '1' });
    expect(!long.ok && long.errors['name.az']).toBe('too_long');
    for (const sortOrder of ['-1', '1.5', 'abc', '10001']) {
      const result = taxonomyFormBody({ name: NAME, sortOrder });
      expect(!result.ok && result.errors.sortOrder).toBe('invalid');
    }
    expect(taxonomyFormBody({ name: NAME, sortOrder: '10000' }).ok).toBe(true);
  });

  it('F3.2b-AC6 marka adı 1–80 karakter, kenar boşlukları atılır', () => {
    expect(brandFormBody('  Bizim Süd ')).toEqual({ ok: true, body: { name: 'Bizim Süd' } });
    expect(brandFormBody('   ')).toEqual({ ok: false, error: 'required' });
    expect(brandFormBody('x'.repeat(81))).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('F3.2b hata eşleme', () => {
  it('F3.2b-AC4 aynı ad 422 → name_taken; üst kategori nedenleri ayrı mesaj', () => {
    const fail = (details: unknown) => taxonomyFailure({ code: 'VALIDATION_FAILED', details });
    expect(fail({ name: ['taken'] })).toEqual({ kind: 'taxonomy', reason: 'name_taken' });
    expect(fail({ parentId: ['max_depth'] })).toEqual({ kind: 'taxonomy', reason: 'max_depth' });
    expect(fail({ parentId: ['inactive'] })).toEqual({
      kind: 'taxonomy',
      reason: 'parent_inactive',
    });
    expect(fail({ parentId: ['not_found'] })).toEqual({
      kind: 'taxonomy',
      reason: 'parent_not_found',
    });
    expect(fail(undefined)).toEqual({ kind: 'taxonomy', reason: 'invalid' });
  });

  it('F3.2b-AC4 durum geçişi 409 ve diğer kodlar', () => {
    expect(taxonomyFailure({ code: 'INVALID_STATE_TRANSITION' })).toEqual({
      kind: 'taxonomy',
      reason: 'invalid_transition',
    });
    expect(taxonomyFailure({ code: 'NOT_FOUND' })).toEqual({
      kind: 'taxonomy',
      reason: 'not_found',
    });
    expect(taxonomyFailure({ code: 'FORBIDDEN' })).toEqual({ kind: 'code', code: 'FORBIDDEN' });
    expect(taxonomyFailure(undefined)).toEqual({ kind: 'code', code: 'INTERNAL_ERROR' });
  });
});

describe('F3.2b kategori ağacı', () => {
  it('F3.2b-AC1 her üstün ardından altları, kardeşler sıra numarasıyla; 3. seviyeye alt eklenmez', () => {
    const rows = [
      row('c3', 'b1', 3),
      row('b2', 'a1', 2, { sortOrder: 2 }),
      row('a2', null, 1, { sortOrder: 5 }),
      row('b1', 'a1', 2, { sortOrder: 1 }),
      row('a1', null, 1, { sortOrder: 1 }),
    ];
    const tree = categoryTree(rows);
    expect(tree.map((item) => item.id)).toEqual(['a1', 'b1', 'c3', 'b2', 'a2']);
    expect(tree.find((item) => item.id === 'c3')?.canAddChild).toBe(false);
    expect(tree.find((item) => item.id === 'b1')?.canAddChild).toBe(true);
    expect(tree.find((item) => item.id === 'a1')?.childCount).toBe(2);
  });

  it('F3.2b-AC2 pasif üstün altları "üst pasif" işaretlenir ve alt kategori almaz', () => {
    const tree = categoryTree([
      row('a1', null, 1, { isActive: false }),
      row('b1', 'a1', 2),
      row('c1', 'b1', 3),
      row('a2', null, 1),
    ]);
    const byId = new Map(tree.map((item) => [item.id, item]));
    expect(byId.get('a1')?.parentInactive).toBe(false);
    expect(byId.get('a1')?.canAddChild).toBe(false);
    expect(byId.get('b1')?.parentInactive).toBe(true);
    expect(byId.get('b1')?.canAddChild).toBe(false);
    expect(byId.get('c1')?.parentInactive).toBe(true);
    expect(byId.get('a2')?.canAddChild).toBe(true);
  });

  it('F3.2b-AC1 aynı sırada ada göre; üstü listede olmayan satır kaybolmaz', () => {
    const names: Record<string, string> = { x: 'Zeytun', y: 'Alma', o: 'Yetim' };
    const tree = categoryTree(
      [row('x', null, 1), row('y', null, 1), row('o', 'missing', 2)],
      (item) => names[item.id] ?? '',
    );
    expect(tree.map((item) => item.id)).toEqual(['y', 'o', 'x']);
  });
});
