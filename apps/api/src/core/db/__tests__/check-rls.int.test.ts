// check-rls betiğinin gerçek PostgreSQL üzerinde testi (F1.1b, F1.1-AC6).
// Her test kendi geçici şemasında tablo açar; betik yalnızca o şemayı denetler.
// Tablolar `migrator` rolüyle (gerçek migration'larla aynı rol) oluşturulur.
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createTestTenantTable } from '../../../../test/isolation';
import { checkRls, type CheckRlsResult, evaluateRlsTable, readRlsTables } from '../check-rls';

const I18N_TABLES = [
  'public.languages',
  'public.ui_translations',
  'public.currencies',
  'public.countries',
  'public.regions',
];

/** F1.7 tabloları ve beklenen sınıf yorumu (data-model §4.4). */
const F17_TABLES: Record<string, string> = {
  'public.activity_types': 'rls:G',
  'public.branches': 'rls:T',
  'public.business_capabilities': 'rls:T',
  'public.business_privacy': 'rls:T,D',
  'public.businesses': 'rls:T,D',
  'public.buyer_profiles': 'rls:T,D',
  // F2.11a: yetkili adı dizin D fonksiyonunca (yalnız açıksa) okunur.
  'public.person_data': 'rls:T,D',
  'public.seller_profiles': 'rls:T',
  'public.service_areas': 'rls:T',
  'public.warehouses': 'rls:T',
};

/** Her sorunlu tablo ve gerekçesinin beklenen ifadeyi içerip içermediği. */
function problemsMentioning(
  result: CheckRlsResult,
  needle: string,
): { table: string; mentioned: boolean }[] {
  return result.problems.map((p) => ({ table: p.table, mentioned: p.reason.includes(needle) }));
}

const PLATFORM = `current_setting('app.is_platform', true) = 'true'`;

const POLICY = `using (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  with check (business_id = nullif(current_setting('app.business_id', true), '')::uuid)`;

describe('check-rls', () => {
  let client: Client;
  const schemas: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: inject('migratorUrl') });
    await client.connect();
  });

  afterAll(async () => {
    for (const schema of schemas) {
      await client.query(`drop schema if exists ${schema} cascade`);
    }
    await client.end();
  });

  /** Geçici bir şema açar, içinde verilen SQL'i çalıştırır (`$s` → şema adı). */
  async function schemaWith(sqlText: string): Promise<string> {
    const schema = `check_rls_${randomBytes(6).toString('hex')}`;
    schemas.push(schema);
    await client.query(`create schema ${schema}`);
    await client.query(sqlText.replaceAll('$s', schema));
    return schema;
  }

  /** F1.3 G kalıbı; `extra` ile politika eklenir veya çıkarılır. */
  function globalTable(name: string, extra = ''): string {
    return `
      create table $s.${name} (id uuid primary key);
      alter table $s.${name} enable row level security;
      alter table $s.${name} force row level security;
      create policy ${name}_read on $s.${name} for select using (true);
      create policy ${name}_insert on $s.${name} for insert with check (${PLATFORM});
      create policy ${name}_update on $s.${name} for update using (${PLATFORM}) with check (${PLATFORM});
      create policy ${name}_delete on $s.${name} for delete using (${PLATFORM});
      comment on table $s.${name} is 'rls:G';
      ${extra}
    `;
  }

  function tenantTable(name: string, comment: string): string {
    return `
      create table $s.${name} (id uuid primary key, business_id uuid not null);
      alter table $s.${name} enable row level security;
      alter table $s.${name} force row level security;
      create policy ${name}_isolation on $s.${name} for all ${POLICY};
      comment on table $s.${name} is '${comment}';
    `;
  }

  /** P kalıbı (F2.12a): satıcı veya alıcı bağlamdaysa okur. */
  function pairTable(name: string): string {
    const ctx = "nullif(current_setting('app.business_id', true), '')::uuid";
    return `
      create table $s.${name} (id uuid primary key, seller_id uuid not null, buyer_id uuid not null);
      alter table $s.${name} enable row level security;
      alter table $s.${name} force row level security;
      create policy ${name}_party on $s.${name} for all
        using (seller_id = ${ctx} or buyer_id = ${ctx})
        with check (seller_id = ${ctx} or buyer_id = ${ctx});
      comment on table $s.${name} is 'rls:P';
    `;
  }

  it("F1.1-AC6: RLS'siz T tablosu → hata", async () => {
    const schema = await schemaWith(`
      create table $s.items (id uuid primary key, business_id uuid not null);
      comment on table $s.items is 'rls:T';
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(result.checked).toBe(1);
    expect(problemsMentioning(result, 'RLS')).toEqual([
      { table: `${schema}.items`, mentioned: true },
    ]);
  });

  it('F1.1-AC6: FORCE RLS yok → hata', async () => {
    const schema = await schemaWith(`
      ${tenantTable('items', 'rls:T')}
      alter table $s.items no force row level security;
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'FORCE')).toEqual([
      { table: `${schema}.items`, mentioned: true },
    ]);
  });

  it('F1.1-AC6: politika yok → hata', async () => {
    const schema = await schemaWith(`
      ${tenantTable('items', 'rls:P')}
      drop policy items_isolation on $s.items;
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'politika')).toEqual([
      { table: `${schema}.items`, mentioned: true },
    ]);
  });

  it('F1.1-AC6: sınıfsız tablo → hata', async () => {
    const schema = await schemaWith(`
      create table $s.no_comment (id uuid primary key);
      create table $s.bad_comment (id uuid primary key);
      comment on table $s.bad_comment is 'rls:X';
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(result.problems.map((p) => p.table).sort()).toEqual([
      `${schema}.bad_comment`,
      `${schema}.no_comment`,
    ]);
  });

  it('F1.1-AC6: doğru tablolar → başarılı', async () => {
    const schema = await schemaWith(`
      ${tenantTable('t_items', 'rls:T')}
      ${pairTable('p_items')}
      ${tenantTable('u_items', 'rls:U')}
      ${tenantTable('td_items', 'rls:T,D')}
      ${globalTable('g_items')}
      create table $s.s_items (id uuid primary key);
      comment on table $s.s_items is 'rls:S';
      create table $s.d_items (id uuid primary key);
      comment on table $s.d_items is 'rls:D';
      create table $s.parted (id uuid not null, business_id uuid not null) partition by hash (id);
      alter table $s.parted enable row level security;
      alter table $s.parted force row level security;
      create policy parted_isolation on $s.parted for all ${POLICY};
      comment on table $s.parted is 'rls:T';
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(result.problems).toEqual([]);
    expect(result.checked).toBe(8);
  });

  it('F2.12a-R18: yalnız business_id koşullu P tablosu → çift kiracı hatası', async () => {
    const schema = await schemaWith(tenantTable('p_wrong', 'rls:P'));

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'seller_id ve buyer_id')).toEqual([
      { table: `${schema}.p_wrong`, mentioned: true },
    ]);
  });

  it('F1.1-AC6: bölümlenmiş (partitioned) T tablosu da denetlenir', async () => {
    const schema = await schemaWith(`
      create table $s.parted (id uuid not null, business_id uuid not null) partition by hash (id);
      comment on table $s.parted is 'rls:T';
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'RLS')).toEqual([
      { table: `${schema}.parted`, mentioned: true },
    ]);
  });

  it("F1.1-AC6: app_user'ın SELECT izni olan S tablosu → hata", async () => {
    const schema = await schemaWith(`
      create table $s.s_items (id uuid primary key);
      comment on table $s.s_items is 'rls:S';
      grant select on $s.s_items to app_user;
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'app_user')).toEqual([
      { table: `${schema}.s_items`, mentioned: true },
    ]);
  });

  it("F1.1-AC6: app_user'ın kolon düzeyinde SELECT izni olan S tablosu → hata", async () => {
    const schema = await schemaWith(`
      create table $s.s_items (id uuid primary key, secret text);
      comment on table $s.s_items is 'rls:S';
      grant select (id) on $s.s_items to app_user;
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'app_user')).toEqual([
      { table: `${schema}.s_items`, mentioned: true },
    ]);
  });

  it('F1.1-AC6: varsayılan kapsam sistem şemalarını ve drizzle şemasını denetlemez', async () => {
    const result = await checkRls(client, {});

    for (const problem of result.problems) {
      expect(problem.table).not.toMatch(/^(pg_catalog|information_schema|pg_toast|drizzle)\./);
    }
  });

  it('F1.3-AC7: yazma politikası olmayan G tablosu → hata', async () => {
    const schema = await schemaWith(`
      create table $s.g_items (id uuid primary key);
      alter table $s.g_items enable row level security;
      alter table $s.g_items force row level security;
      create policy g_items_read on $s.g_items for select using (true);
      comment on table $s.g_items is 'rls:G';
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'yazma politikası')).toEqual([
      { table: `${schema}.g_items`, mentioned: true },
    ]);
  });

  it("F1.3-AC7: RLS'siz G tablosu → hata", async () => {
    const schema = await schemaWith(`
      create table $s.g_items (id uuid primary key);
      comment on table $s.g_items is 'rls:G';
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'RLS')).toEqual([
      { table: `${schema}.g_items`, mentioned: true },
    ]);
  });

  it('F1.3-AC7: FOR ALL USING (true) politikası olan G tablosu → hata', async () => {
    const schema = await schemaWith(
      globalTable('g_items', 'create policy g_items_all on $s.g_items for all using (true);'),
    );

    const result = await checkRls(client, { schemas: [schema] });

    expect(problemsMentioning(result, 'app.is_platform')).toEqual([
      { table: `${schema}.g_items`, mentioned: true },
    ]);
  });

  it("F1.3-AC7: korumasız veya WITH CHECK'siz UPDATE politikası olan G tablosu → hata", async () => {
    const schema = await schemaWith(`
      ${globalTable('open_update', 'create policy open_update_w2 on $s.open_update for update using (true) with check (true);')}
      ${globalTable(
        'no_check',
        `drop policy no_check_update on $s.no_check;
        create policy no_check_update on $s.no_check for update using (${PLATFORM});`,
      )}
    `);

    const result = await checkRls(client, { schemas: [schema] });

    expect(result.problems.map((p) => p.table).sort()).toEqual([
      `${schema}.no_check`,
      `${schema}.open_update`,
    ]);
    expect(result.problems.find((p) => p.table.endsWith('no_check'))?.reason).toContain(
      'WITH CHECK',
    );
  });

  it('F1.3-AC7: doğru G tablosu → başarılı', async () => {
    const schema = await schemaWith(globalTable('g_items'));

    const result = await checkRls(client, { schemas: [schema] });

    expect(result).toEqual({ checked: 1, problems: [] });
  });

  it('F1.3-AC7: migration sonrası i18n G tabloları denetimden geçer', async () => {
    const tables = await readRlsTables(client, { schemas: ['public'] });
    const i18n = tables.filter((t) => I18N_TABLES.includes(t.table));

    expect(i18n.map((t) => t.table).sort()).toEqual([...I18N_TABLES].sort());
    for (const info of i18n) {
      expect({ table: info.table, problems: evaluateRlsTable(info) }).toEqual({
        table: info.table,
        problems: [],
      });
    }
  });
  it('F1.7-AC1: check-rls temiz; F1.7 tablolarının sınıf yorumu doğru', async () => {
    const result = await checkRls(client, { schemas: ['public'] });
    expect(result.problems).toEqual([]);

    const tables = await readRlsTables(client, { schemas: ['public'] });
    const f17 = Object.fromEntries(
      tables.filter((t) => t.table in F17_TABLES).map((t) => [t.table, t.comment]),
    );
    expect(f17).toEqual(F17_TABLES);
  });

  it('F1.9: audit_logs rls:S ve app_user SELECT izni yok → check-rls temiz', async () => {
    const tables = await readRlsTables(client, { schemas: ['public'] });
    const audit = tables.find((t) => t.table === 'public.audit_logs');

    expect(audit?.comment).toBe('rls:S');
    expect(audit === undefined ? undefined : evaluateRlsTable(audit)).toEqual([]);
  });

  it('F1.5-AC10/AC14: users ve user_sessions rls:U, otp_challenges ve dev_sms_outbox rls:S → temiz', async () => {
    const tables = await readRlsTables(client, { schemas: ['public'] });
    const identity = tables.filter((t) =>
      [
        'public.users',
        'public.otp_challenges',
        'public.dev_sms_outbox',
        'public.user_sessions',
        'public.user_totp',
        'public.platform_staff',
      ].includes(t.table),
    );

    expect(Object.fromEntries(identity.map((t) => [t.table, t.comment]))).toEqual({
      'public.users': 'rls:U',
      'public.otp_challenges': 'rls:S',
      'public.dev_sms_outbox': 'rls:S',
      'public.user_sessions': 'rls:U',
      'public.user_totp': 'rls:U',
      'public.platform_staff': 'rls:S',
    });
    for (const info of identity) {
      expect({ table: info.table, problems: evaluateRlsTable(info) }).toEqual({
        table: info.table,
        problems: [],
      });
    }
  });

  it('F1.11-AC7: bildirim tabloları rls:U, şablonlar rls:G → temiz', async () => {
    const expected = {
      'public.push_tokens': 'rls:U',
      'public.notifications': 'rls:U',
      'public.notification_preferences': 'rls:U',
      'public.notification_templates': 'rls:G',
    };
    const tables = await readRlsTables(client, { schemas: ['public'] });
    const ours = tables.filter((t) => Object.keys(expected).includes(t.table));

    expect(Object.fromEntries(ours.map((t) => [t.table, t.comment]))).toEqual(expected);
    for (const info of ours) {
      expect({ table: info.table, problems: evaluateRlsTable(info) }).toEqual({
        table: info.table,
        problems: [],
      });
    }
  });

  it('check-rls test sırasına bağlı değil: test_tenant_items kurulu olsa da public temiz', async () => {
    // İzolasyon testleri bu tabloyu public şemasında bırakır; daha önce yorumsuz olduğu için
    // bu dosya onlardan sonra çalışınca düşüyordu. Tablo burada bilerek kurulur.
    await createTestTenantTable(inject('migratorUrl'));

    const result = await checkRls(client, { schemas: ['public'] });
    const tables = await readRlsTables(client, { schemas: ['public'] });

    expect(result.problems).toEqual([]);
    expect(tables.find((t) => t.table === 'public.test_tenant_items')?.comment).toBe('rls:T');
  });
});
