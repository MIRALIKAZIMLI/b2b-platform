// check-rls kurallarının birim testi (veritabanı gerekmez).
import { describe, expect, it } from 'vitest';
import { evaluateRlsTable, parseRlsComment, type RlsTableInfo } from '../check-rls';

function table(overrides: Partial<RlsTableInfo>): RlsTableInfo {
  return {
    table: 'public.items',
    comment: 'rls:T',
    rowSecurity: true,
    forceRowSecurity: true,
    policyCount: 1,
    appUserCanSelect: true,
    ...overrides,
  };
}

describe('parseRlsComment', () => {
  it.each([
    ['rls:T', ['T']],
    ['rls:T,D', ['T', 'D']],
    ['rls:D', ['D']],
    ['rls:G', ['G']],
  ])('F1.1-AC6: "%s" geçerli', (comment, expected) => {
    expect(parseRlsComment(comment)).toEqual(expected);
  });

  it.each([null, '', 'rls:', 'rls:X', 'rls:T,', 'rls: T', 'RLS:T', 'rls:T;D', 'açıklama rls:T'])(
    'F1.1-AC6: %j geçersiz',
    (comment) => {
      expect(parseRlsComment(comment)).toBeUndefined();
    },
  );
});

describe('evaluateRlsTable', () => {
  it("F1.1-AC6: RLS'siz T tablosu → hata", () => {
    expect(evaluateRlsTable(table({ rowSecurity: false }))).not.toEqual([]);
  });

  it('F1.1-AC6: FORCE RLS yok → hata', () => {
    expect(evaluateRlsTable(table({ forceRowSecurity: false }))).not.toEqual([]);
  });

  it('F1.1-AC6: politika yok → hata', () => {
    expect(evaluateRlsTable(table({ comment: 'rls:U', policyCount: 0 }))).not.toEqual([]);
  });

  it('F1.1-AC6: sınıfsız tablo → hata', () => {
    expect(evaluateRlsTable(table({ comment: null }))).not.toEqual([]);
  });

  it('F1.1-AC6: doğru tablolar → başarılı', () => {
    expect(evaluateRlsTable(table({}))).toEqual([]);
    expect(evaluateRlsTable(table({ comment: 'rls:T,D' }))).toEqual([]);
    const noRls = { rowSecurity: false, forceRowSecurity: false, policyCount: 0 };
    expect(evaluateRlsTable(table({ comment: 'rls:G', ...noRls }))).toEqual([]);
    expect(evaluateRlsTable(table({ comment: 'rls:D', ...noRls }))).toEqual([]);
    expect(
      evaluateRlsTable(table({ comment: 'rls:S', ...noRls, appUserCanSelect: false })),
    ).toEqual([]);
  });

  it("F1.1-AC6: app_user'ın SELECT izni olan S tablosu → hata", () => {
    expect(evaluateRlsTable(table({ comment: 'rls:S', appUserCanSelect: true }))).not.toEqual([]);
  });
});
