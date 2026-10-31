// check-rls kurallarının birim testi (veritabanı gerekmez).
import { describe, expect, it } from 'vitest';
import {
  evaluateRlsTable,
  parseRlsComment,
  type RlsPolicyInfo,
  type RlsTableInfo,
} from '../check-rls';

function table(overrides: Partial<RlsTableInfo>): RlsTableInfo {
  return {
    table: 'public.items',
    comment: 'rls:T',
    rowSecurity: true,
    forceRowSecurity: true,
    policyCount: 1,
    policies: [],
    appUserCanSelect: true,
    ...overrides,
  };
}

const PLATFORM = "(current_setting('app.is_platform'::text, true) = 'true'::text)";

function policy(cmd: RlsPolicyInfo['cmd'], using: string | null, withCheck: string | null) {
  return { cmd, using, withCheck };
}

/** F1.3 G kalıbı: herkes okur, yalnızca platform bağlamı yazar. */
const G_POLICIES: RlsPolicyInfo[] = [
  policy('r', 'true', null),
  policy('a', null, PLATFORM),
  policy('w', PLATFORM, PLATFORM),
  policy('d', PLATFORM, null),
];

function gTable(policies: RlsPolicyInfo[], overrides: Partial<RlsTableInfo> = {}): RlsTableInfo {
  return table({ comment: 'rls:G', policies, policyCount: policies.length, ...overrides });
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
    expect(evaluateRlsTable(gTable(G_POLICIES))).toEqual([]);
    expect(evaluateRlsTable(table({ comment: 'rls:D', ...noRls }))).toEqual([]);
    expect(
      evaluateRlsTable(table({ comment: 'rls:S', ...noRls, appUserCanSelect: false })),
    ).toEqual([]);
  });

  it("F1.1-AC6: app_user'ın SELECT izni olan S tablosu → hata", () => {
    expect(evaluateRlsTable(table({ comment: 'rls:S', appUserCanSelect: true }))).not.toEqual([]);
  });
});

describe('evaluateRlsTable — G sınıfı (F1.3)', () => {
  it('F1.3-AC7: doğru G kalıbı → başarılı', () => {
    expect(evaluateRlsTable(gTable(G_POLICIES))).toEqual([]);
    // Tek FOR ALL yazma politikası da kabul (USING ve WITH CHECK platform koşullu).
    expect(
      evaluateRlsTable(gTable([policy('r', 'true', null), policy('*', PLATFORM, PLATFORM)])),
    ).toEqual([]);
  });

  it('F1.3-AC7: yazma politikası olmayan G tablosu → hata', () => {
    const problems = evaluateRlsTable(gTable([policy('r', 'true', null)]));
    expect(problems.join(' ')).toContain('yazma politikası');
  });

  it('F1.3-AC7: RLS veya FORCE kapalı G tablosu → hata', () => {
    expect(evaluateRlsTable(gTable(G_POLICIES, { rowSecurity: false }))).not.toEqual([]);
    expect(evaluateRlsTable(gTable(G_POLICIES, { forceRowSecurity: false }))).not.toEqual([]);
  });

  it('F1.3-AC7: FOR ALL USING (true) → hata', () => {
    const problems = evaluateRlsTable(gTable([policy('*', 'true', null)]));
    expect(problems.join(' ')).toContain('app.is_platform');
  });

  it('F1.3-AC7: platform koşulsuz UPDATE politikası → hata', () => {
    expect(evaluateRlsTable(gTable([...G_POLICIES, policy('w', 'true', 'true')]))).not.toEqual([]);
  });

  it("F1.3-AC7: WITH CHECK'siz UPDATE politikası → hata", () => {
    const policies = [policy('r', 'true', null), policy('w', PLATFORM, null)];
    expect(evaluateRlsTable(gTable(policies)).join(' ')).toContain('WITH CHECK');
  });

  it('F1.3-AC7: platform koşulsuz INSERT veya DELETE politikası → hata', () => {
    expect(evaluateRlsTable(gTable([...G_POLICIES, policy('a', null, 'true')]))).not.toEqual([]);
    expect(evaluateRlsTable(gTable([...G_POLICIES, policy('d', 'true', null)]))).not.toEqual([]);
  });

  it('F1.3-AC7: USING (true) yalnızca SELECT politikasında kabul', () => {
    expect(evaluateRlsTable(gTable([...G_POLICIES, policy('r', 'true', null)]))).toEqual([]);
  });

  it('F2.2: yalnızca migrator rolüne verilmiş (SECURITY DEFINER) yazma politikası G kuralından muaf', () => {
    const definer = { ...policy('a', null, "status = 'pending'"), roles: ['migrator'] };
    expect(evaluateRlsTable(gTable([...G_POLICIES, definer]))).toEqual([]);
  });

  it('F2.2: migrator dışında rol taşıyan veya PUBLIC yazma politikası muaf değil', () => {
    const mixed = { ...policy('a', null, 'true'), roles: ['app_user', 'migrator'] };
    const open = { ...policy('a', null, 'true'), roles: ['public'] };
    expect(evaluateRlsTable(gTable([...G_POLICIES, mixed]))).not.toEqual([]);
    expect(evaluateRlsTable(gTable([...G_POLICIES, open]))).not.toEqual([]);
  });

  it('F2.2: yalnızca migrator yazma politikası olan G tablosu → platform yazma politikası yok hatası', () => {
    const definer = { ...policy('a', null, 'true'), roles: ['migrator'] };
    const problems = evaluateRlsTable(gTable([policy('r', 'true', null), definer]));
    expect(problems.join(' ')).toContain('yazma politikası');
  });
});
