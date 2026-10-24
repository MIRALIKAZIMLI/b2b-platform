// RLS denetimi (F1.1b, `pnpm check-rls`): migration'ları uygulanmış veritabanındaki her
// tablonun RLS sınıfını tablo yorumundan (`COMMENT ON TABLE ... IS 'rls:T'`) okur ve
// sınıfa göre kontrol eder (data-model §1.1, §6).
//   T, P, U : RLS açık, FORCE açık, en az bir politika
//   S       : app_user'ın doğrudan SELECT izni yok
//   G, D    : bu adımda ek kontrol yok
// Yorumu olmayan veya biçimi yanlış tablo da hatadır.
// Yalnızca sistem kataloğunu okur; tablo verisine dokunmaz. Adres ve şifre yazdırmaz.

import type { ClientBase } from 'pg';

export const RLS_CLASSES = ['T', 'P', 'G', 'U', 'S', 'D'] as const;
export type RlsClass = (typeof RLS_CLASSES)[number];

const COMMENT_PATTERN = /^rls:[TPGUSD](,[TPGUSD])*$/;
const RLS_REQUIRED: ReadonlySet<RlsClass> = new Set<RlsClass>(['T', 'P', 'U']);

/** Denetlenmeyen şemalar (sistem ve Drizzle'ın migration kayıt şeması). */
const EXCLUDED_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast', 'drizzle'];

export interface RlsTableInfo {
  /** `şema.tablo` */
  readonly table: string;
  readonly comment: string | null;
  readonly rowSecurity: boolean;
  readonly forceRowSecurity: boolean;
  readonly policyCount: number;
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

/** Bir tablonun sorunlarını döndürür; boş dizi = sorun yok. */
export function evaluateRlsTable(info: RlsTableInfo): string[] {
  const classes = parseRlsComment(info.comment);
  if (classes === undefined) {
    return ["RLS sınıfı yok veya geçersiz (beklenen tablo yorumu: 'rls:<T|P|G|U|S|D>[,...]')"];
  }
  const reasons: string[] = [];
  if (classes.some((c) => RLS_REQUIRED.has(c))) {
    if (!info.rowSecurity) reasons.push('RLS kapalı (ENABLE ROW LEVEL SECURITY yok)');
    if (!info.forceRowSecurity) reasons.push('FORCE ROW LEVEL SECURITY yok');
    if (info.policyCount === 0) reasons.push('RLS politikası yok');
  }
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
  app_user_can_select: boolean;
}

// relkind: r = normal tablo, p = bölümlenmiş (partitioned) tablo.
const CATALOG_QUERY = `
  select format('%s.%s', n.nspname, c.relname) as table_name,
         obj_description(c.oid, 'pg_class') as comment,
         c.relrowsecurity as row_security,
         c.relforcerowsecurity as force_row_security,
         (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policy_count,
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
