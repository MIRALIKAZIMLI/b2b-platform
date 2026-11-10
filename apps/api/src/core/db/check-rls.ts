// RLS denetimi (F1.1b, `pnpm check-rls`): migration'ları uygulanmış veritabanındaki her
// tablonun RLS sınıfını tablo yorumundan (`COMMENT ON TABLE ... IS 'rls:T'`) okur ve
// sınıfa göre kontrol eder (data-model §1.1, §6).
//   T, P, U : RLS açık, FORCE açık, en az bir politika
//   G       : RLS açık, FORCE açık, en az bir yazma politikası; her yazma politikası (INSERT,
//             UPDATE, DELETE, FOR ALL) gereken her ifadede `app.is_platform` koşulunu taşır
//             (F1.3, Mimar düzeltmesi D1). USING (true) yalnızca FOR SELECT'te kabul.
//   P       : ayrıca okuma politikası satıcı ve alıcı kolonunu `app.business_id` ile karşılaştırır;
//             her politika ifadesi `app.business_id` veya `app.is_platform` koşulu taşır (F2.12a, R18)
//   S       : app_user'ın doğrudan SELECT izni yok
//   D       : ek kontrol yok
// Yorumu olmayan veya biçimi yanlış tablo da hatadır.
// Yalnızca sistem kataloğunu okur; tablo verisine dokunmaz. Adres ve şifre yazdırmaz.

import type { ClientBase } from 'pg';

export const RLS_CLASSES = ['T', 'P', 'G', 'U', 'S', 'D'] as const;
export type RlsClass = (typeof RLS_CLASSES)[number];

const COMMENT_PATTERN = /^rls:[TPGUSD](,[TPGUSD])*$/;
const RLS_REQUIRED: ReadonlySet<RlsClass> = new Set<RlsClass>(['T', 'P', 'U']);

/** Denetlenmeyen şemalar (sistem ve Drizzle'ın migration kayıt şeması). */
const EXCLUDED_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast', 'drizzle'];

/** pg_policy.polcmd: r = SELECT, a = INSERT, w = UPDATE, d = DELETE, * = ALL. */
export type PolicyCommand = 'r' | 'a' | 'w' | 'd' | '*';

export interface RlsPolicyInfo {
  readonly cmd: PolicyCommand;
  /** USING ifadesi (pg_get_expr); yoksa null. */
  readonly using: string | null;
  /** WITH CHECK ifadesi (pg_get_expr); yoksa null. */
  readonly withCheck: string | null;
  /** Politikanın rolleri (`TO ...`); PUBLIC `public` olarak gelir. Verilmezse PUBLIC sayılır. */
  readonly roles?: readonly string[];
}

export interface RlsTableInfo {
  /** `şema.tablo` */
  readonly table: string;
  readonly comment: string | null;
  readonly rowSecurity: boolean;
  readonly forceRowSecurity: boolean;
  readonly policyCount: number;
  readonly policies: readonly RlsPolicyInfo[];
  readonly appUserCanSelect: boolean;
}

export interface RlsProblem {
  readonly table: string;
  readonly reason: string;
}

export interface CheckRlsResult {
  readonly checked: number;
  readonly problems: readonly RlsProblem[];
}

export interface CheckRlsOptions {
  /** Yalnızca bu şemaları denetle (testler için). Verilmezse sistem dışı bütün şemalar. */
  readonly schemas?: readonly string[];
}

/** pg `Client` / `Pool` / `PoolClient` (yalnızca `query` gerekir). */
export type Queryable = Pick<ClientBase, 'query'>;

/** `rls:T,D` → ['T', 'D']; geçersiz veya boşsa undefined. */
export function parseRlsComment(comment: string | null): RlsClass[] | undefined {
  if (comment === null || !COMMENT_PATTERN.test(comment)) return undefined;
  return comment.slice('rls:'.length).split(',') as RlsClass[];
}

const PLATFORM_SETTING = 'app.is_platform';

const COMMAND_NAMES: Record<PolicyCommand, string> = {
  r: 'SELECT',
  a: 'INSERT',
  w: 'UPDATE',
  d: 'DELETE',
  '*': 'ALL',
};

/** Yazma politikasının taşıması gereken ifadeler (PostgreSQL'in kabul ettikleri). */
const REQUIRED_EXPRESSIONS: Record<Exclude<PolicyCommand, 'r'>, ('using' | 'withCheck')[]> = {
  a: ['withCheck'],
  w: ['using', 'withCheck'],
  d: ['using'],
  '*': ['using', 'withCheck'],
};

const EXPRESSION_NAMES = { using: 'USING', withCheck: 'WITH CHECK' } as const;

/**
 * Yalnızca `migrator` rolüne verilmiş politika: app_user bu rolü üstlenemez, politika yalnızca
 * migrator sahipli SECURITY DEFINER fonksiyonların içinde etkilidir (fonksiyonlar
 * security-definer.int.test.ts ile ayrıca denetlenir; F2.1a, F2.2).
 */
function isDefinerOnly(policy: RlsPolicyInfo): boolean {
  return (
    policy.roles !== undefined &&
    policy.roles.length > 0 &&
    policy.roles.every((r) => r === 'migrator')
  );
}

/** G sınıfı: herkes okur, yalnızca platform bağlamı yazar (F1.3). */
function evaluateGlobalPolicies(policies: readonly RlsPolicyInfo[]): string[] {
  const writes = policies.filter((p) => p.cmd !== 'r' && !isDefinerOnly(p));
  if (writes.length === 0) {
    return [`G sınıfı tabloda ${PLATFORM_SETTING} koşullu yazma politikası yok`];
  }
  const reasons: string[] = [];
  for (const policy of writes) {
    if (policy.cmd === 'r') continue;
    for (const field of REQUIRED_EXPRESSIONS[policy.cmd]) {
      const expression = policy[field];
      if (!expression?.includes(PLATFORM_SETTING)) {
        reasons.push(
          `${COMMAND_NAMES[policy.cmd]} politikasının ${EXPRESSION_NAMES[field]} ifadesi ${PLATFORM_SETTING} koşulu taşımıyor`,
        );
      }
    }
  }
  return reasons;
}

const TENANT_SETTING = 'app.business_id';

/**
 * P sınıfı (çift kiracı, F2.12a): en az bir okuma politikası (SELECT veya ALL) USING'de
 * `seller_id`, `buyer_id` ve `app.business_id` geçirir; migrator dışındaki her politikanın her
 * ifadesi kiracı veya platform koşulu taşır (`USING (true)` gibi koşulsuz politika yok).
 */
function evaluatePairPolicies(policies: readonly RlsPolicyInfo[]): string[] {
  const own = policies.filter((p) => !isDefinerOnly(p));
  const reasons: string[] = [];
  const pairRead = own.some(
    (p) =>
      (p.cmd === 'r' || p.cmd === '*') &&
      p.using !== null &&
      p.using.includes('seller_id') &&
      p.using.includes('buyer_id') &&
      p.using.includes(TENANT_SETTING),
  );
  if (!pairRead) {
    reasons.push(
      `P sınıfı tabloda seller_id ve buyer_id'yi ${TENANT_SETTING} ile karşılaştıran okuma politikası yok`,
    );
  }
  for (const policy of own) {
    const fields: ('using' | 'withCheck')[] =
      policy.cmd === 'r' ? ['using'] : REQUIRED_EXPRESSIONS[policy.cmd];
    for (const field of fields) {
      const expression = policy[field];
      if (!expression?.includes(TENANT_SETTING) && !expression?.includes(PLATFORM_SETTING)) {
        reasons.push(
          `${COMMAND_NAMES[policy.cmd]} politikasının ${EXPRESSION_NAMES[field]} ifadesi kiracı veya platform koşulu taşımıyor`,
        );
      }
    }
  }
  return reasons;
}

/** Bir tablonun sorunlarını döndürür; boş dizi = sorun yok. */
export function evaluateRlsTable(info: RlsTableInfo): string[] {
  const classes = parseRlsComment(info.comment);
  if (classes === undefined) {
    return ["RLS sınıfı yok veya geçersiz (beklenen tablo yorumu: 'rls:<T|P|G|U|S|D>[,...]')"];
  }
  const reasons: string[] = [];
  const tenantScoped = classes.some((c) => RLS_REQUIRED.has(c));
  if (tenantScoped || classes.includes('G')) {
    if (!info.rowSecurity) reasons.push('RLS kapalı (ENABLE ROW LEVEL SECURITY yok)');
    if (!info.forceRowSecurity) reasons.push('FORCE ROW LEVEL SECURITY yok');
  }
  if (tenantScoped && info.policyCount === 0) reasons.push('RLS politikası yok');
  if (classes.includes('G')) reasons.push(...evaluateGlobalPolicies(info.policies));
  if (classes.includes('P')) reasons.push(...evaluatePairPolicies(info.policies));
  if (classes.includes('S') && info.appUserCanSelect) {
    reasons.push("S sınıfı tabloda app_user'ın SELECT izni var");
  }
  return reasons;
}

interface CatalogRow {
  table_name: string;
  comment: string | null;
  row_security: boolean;
  force_row_security: boolean;
  policy_count: number;
  policies: {
    cmd: PolicyCommand;
    using: string | null;
    with_check: string | null;
    roles: string[];
  }[];
  app_user_can_select: boolean;
}

// relkind: r = normal tablo, p = bölümlenmiş (partitioned) tablo.
const CATALOG_QUERY = `
  select format('%s.%s', n.nspname, c.relname) as table_name,
         obj_description(c.oid, 'pg_class') as comment,
         c.relrowsecurity as row_security,
         c.relforcerowsecurity as force_row_security,
         (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policy_count,
         (select coalesce(json_agg(json_build_object(
                   'cmd', p.polcmd,
                   'using', pg_get_expr(p.polqual, p.polrelid),
                   'with_check', pg_get_expr(p.polwithcheck, p.polrelid),
                   'roles', (select coalesce(json_agg(case when r.oid = 0 then 'public'
                                                           else pg_get_userbyid(r.oid)::text end
                                                      order by 1), '[]')
                               from unnest(p.polroles) as r(oid))) order by p.polname), '[]')
            from pg_policy p where p.polrelid = c.oid) as policies,
         -- Kolon düzeyindeki GRANT'ları da yakalar (has_table_privilege yakalamaz).
         has_any_column_privilege('app_user', c.oid, 'SELECT') as app_user_can_select
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p')
     and (
       ($1::text[] is not null and n.nspname = any($1::text[]))
       or ($1::text[] is null
           and n.nspname <> all($2::text[])
           and n.nspname not like 'pg\\_temp\\_%'
           and n.nspname not like 'pg\\_toast\\_temp\\_%')
     )
   order by 1
`;

async function assertAppUserExists(client: Queryable): Promise<void> {
  const result = await client.query<{ exists: boolean }>(
    "select exists (select 1 from pg_roles where rolname = 'app_user') as exists",
  );
  if (result.rows[0]?.exists !== true) {
    throw new Error('app_user rolü yok; önce pnpm db:bootstrap çalıştırılmalı');
  }
}

export async function readRlsTables(
  client: Queryable,
  options: CheckRlsOptions = {},
): Promise<RlsTableInfo[]> {
  await assertAppUserExists(client);
  const schemas = options.schemas === undefined ? null : [...options.schemas];
  const result = await client.query<CatalogRow>(CATALOG_QUERY, [schemas, EXCLUDED_SCHEMAS]);
  return result.rows.map((row) => ({
    table: row.table_name,
    comment: row.comment,
    rowSecurity: row.row_security,
    forceRowSecurity: row.force_row_security,
    policyCount: row.policy_count,
    policies: row.policies.map((p) => ({
      cmd: p.cmd,
      using: p.using,
      withCheck: p.with_check,
      roles: p.roles,
    })),
    appUserCanSelect: row.app_user_can_select,
  }));
}

export async function checkRls(
  client: Queryable,
  options: CheckRlsOptions = {},
): Promise<CheckRlsResult> {
  const tables = await readRlsTables(client, options);
  // Tablo başına tek satır; birden fazla eksik "; " ile birleştirilir.
  const problems = tables.flatMap((info) => {
    const reasons = evaluateRlsTable(info);
    return reasons.length === 0 ? [] : [{ table: info.table, reason: reasons.join('; ') }];
  });
  return { checked: tables.length, problems };
}
