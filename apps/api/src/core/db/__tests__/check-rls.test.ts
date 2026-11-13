// check-rls kurallarının birim testi (veritabanı gerekmez).
import { describe, expect, it } from 'vitest';
import {
  evaluateRlsTable,
  PLATFORM_WRITE_FORBIDDEN_TABLES,
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

describe('evaluateRlsTable — P sınıfı (F2.12a, R18)', () => {
  const CTX = "nullif(current_setting('app.business_id'::text, true), ''::text)::uuid";
  const PARTY = `((seller_id = ${CTX}) OR (buyer_id = ${CTX}))`;
  const SELLER = `(seller_id = ${CTX})`;
  const P_POLICIES: RlsPolicyInfo[] = [
    policy('r', PARTY, null),
    policy('a', null, SELLER),
    policy('w', PARTY, PARTY),
    policy('r', PLATFORM, null),
  ];
  const pTable = (policies: RlsPolicyInfo[]) =>
    table({ comment: 'rls:P', policies, policyCount: policies.length });

  it('F2.12a-R18 doğru P kalıbı → başarılı; migrator politikası muaf', () => {
    expect(evaluateRlsTable(pTable(P_POLICIES))).toEqual([]);
    const definer = { ...policy('r', 'true', null), roles: ['migrator'] };
    expect(evaluateRlsTable(pTable([...P_POLICIES, definer]))).toEqual([]);
  });

  it('F2.12a-R18 yalnız satıcı tarafını okuyan P tablosu → hata', () => {
    const problems = evaluateRlsTable(pTable([policy('r', SELLER, null)]));
    expect(problems.join(' ')).toContain('seller_id ve buyer_id');
  });

  it('F2.12a-R18 koşulsuz (USING true) veya koşulsuz yazma politikası → hata', () => {
    expect(evaluateRlsTable(pTable([...P_POLICIES, policy('r', 'true', null)]))).not.toEqual([]);
    expect(evaluateRlsTable(pTable([...P_POLICIES, policy('a', null, 'true')]))).not.toEqual([]);
    expect(
      evaluateRlsTable(
        pTable([...P_POLICIES, { ...policy('r', 'true', null), roles: ['public'] }]),
      ),
    ).not.toEqual([]);
  });
});

describe('evaluateRlsTable — platformun yazamadığı tablolar (F2.18, US-016 AC5)', () => {
  const TENANT =
    "(business_id = (NULLIF(current_setting('app.business_id'::text, true), ''::text))::uuid)";
  const tenantPolicies: RlsPolicyInfo[] = [policy('*', TENANT, TENANT)];

  it('US-016 AC5: liste data-model §1.1 ile aynı', () => {
    expect([...PLATFORM_WRITE_FORBIDDEN_TABLES].sort()).toEqual(
      [
        'customer_prices',
        'ledger_entries',
        'order_items',
        'orders',
        'payments',
        'price_list_items',
        'price_lists',
      ].sort(),
    );
  });

  it('US-016 AC5: yalnız kiracı politikası olan yasak tablo → başarılı', () => {
    expect(evaluateRlsTable(table({ table: 'public.orders', policies: tenantPolicies }))).toEqual(
      [],
    );
  });

  it.each(PLATFORM_WRITE_FORBIDDEN_TABLES)(
    'US-016 AC5: %s tablosunda platform yazma politikası → hata',
    (name) => {
      const policies = [...tenantPolicies, policy('w', PLATFORM, PLATFORM)];
      const reasons = evaluateRlsTable(table({ table: `public.${name}`, policies }));
      expect(reasons.some((r) => r.startsWith('US-016 AC5'))).toBe(true);
    },
  );

  it('US-016 AC5: FOR ALL içinde kiracı veya platform (OR) → hata', () => {
    const either = `(${TENANT} OR ${PLATFORM})`;
    const reasons = evaluateRlsTable(
      table({ table: 'public.ledger_entries', policies: [policy('*', either, either)] }),
    );
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('US-016 AC5: koşulsuz yazma politikası (USING true) → hata', () => {
    const reasons = evaluateRlsTable(
      table({ table: 'public.payments', policies: [policy('d', 'true', null)] }),
    );
    expect(reasons).toEqual([
      'US-016 AC5: platformun yazamadığı tabloda DELETE politikasının USING ifadesi kiracı koşulu taşımıyor',
    ]);
  });

  it('US-016 AC5: platform okuma (SELECT) politikası yazma sayılmaz', () => {
    const policies = [...tenantPolicies, policy('r', PLATFORM, null)];
    expect(evaluateRlsTable(table({ table: 'public.price_lists', policies }))).toEqual([]);
  });

  it('US-016 AC5: aynı adlı başka şemadaki tablo kurala girmez', () => {
    const policies = [policy('w', PLATFORM, PLATFORM)];
    expect(
      evaluateRlsTable(table({ table: 'archive.orders', policies })).some((r) =>
        r.startsWith('US-016 AC5'),
      ),
    ).toBe(false);
  });
});
