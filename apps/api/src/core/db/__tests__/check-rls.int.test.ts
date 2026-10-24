// check-rls betiğinin gerçek PostgreSQL üzerinde testi (F1.1b, F1.1-AC6).
// Her test kendi geçici şemasında tablo açar; betik yalnızca o şemayı denetler.
// Tablolar `migrator` rolüyle (gerçek migration'larla aynı rol) oluşturulur.
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { checkRls, type CheckRlsResult } from '../check-rls';

/** Her sorunlu tablo ve gerekçesinin beklenen ifadeyi içerip içermediği. */
function problemsMentioning(
  result: CheckRlsResult,
  needle: string,
): { table: string; mentioned: boolean }[] {
  return result.problems.map((p) => ({ table: p.table, mentioned: p.reason.includes(needle) }));
}

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

  function tenantTable(name: string, comment: string): string {
    return `
      create table $s.${name} (id uuid primary key, business_id uuid not null);
      alter table $s.${name} enable row level security;
      alter table $s.${name} force row level security;
      create policy ${name}_isolation on $s.${name} for all ${POLICY};
      comment on table $s.${name} is '${comment}';
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
      ${tenantTable('p_items', 'rls:P')}
      ${tenantTable('u_items', 'rls:U')}
      ${tenantTable('td_items', 'rls:T,D')}
      create table $s.g_items (id uuid primary key);
      comment on table $s.g_items is 'rls:G';
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
});
