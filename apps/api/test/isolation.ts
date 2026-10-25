// İzolasyon testleri için yardımcılar: iki kiracı bağlamı (A, B) ve yalnızca testte
// kullanılan örnek tablo (`test_tenant_items`). Tablo gerçek migration'a girmez (F1.1a K1).
import { randomUUID } from 'node:crypto';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import type { TenantTxContext } from '../src/core/db';

export const testTenantItems = pgTable('test_tenant_items', {
  id: uuid('id').primaryKey(),
  businessId: uuid('business_id').notNull(),
  name: text('name').notNull(),
});

export interface TenantPair {
  readonly a: TenantTxContext;
  readonly b: TenantTxContext;
}

/** Her çağrıda yeni, birbirinden farklı iki kiracı bağlamı üretir. */
export function createTenantPair(): TenantPair {
  return {
    a: { businessId: randomUUID(), userId: randomUUID() },
    b: { businessId: randomUUID(), userId: randomUUID() },
  };
}

// Politika, gerçek tablolardaki kalıpla aynıdır (data-model §1.1, F1.1a K5).
const CREATE_TEST_TABLE_SQL = `
  drop table if exists test_tenant_items;
  create table test_tenant_items (
    id uuid primary key,
    business_id uuid not null,
    name text not null
  );
  alter table test_tenant_items enable row level security;
  alter table test_tenant_items force row level security;
  create policy test_tenant_items_isolation on test_tenant_items
    for all
    using (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
    with check (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
  grant select, insert, update, delete on test_tenant_items to app_user;
  comment on table test_tenant_items is 'rls:T';
`;

/** Örnek tabloyu `migrator` rolüyle (tablo sahibi) sıfırdan oluşturur. */
export async function createTestTenantTable(migratorUrl: string): Promise<void> {
  const client = new Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query(CREATE_TEST_TABLE_SQL);
  } finally {
    await client.end();
  }
}

/** Tablo sahibi `migrator` ile sorgu çalıştırır (yalnızca testte doğrulama için; RLS/izin dışı). */
export async function queryAsOwner<Row extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const client = new Client({ connectionString: process.env.DATABASE_MIGRATOR_URL });
  await client.connect();
  try {
    const result = await client.query<Row>(text, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

/** Hata zincirinde (Drizzle hatayı `cause` ile sarar) PostgreSQL hata kodunu bulur. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && typeof current.code === 'string') {
      return current.code;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

/** PostgreSQL "insufficient_privilege" (RLS WITH CHECK ihlali dahil). */
export const PG_INSUFFICIENT_PRIVILEGE = '42501';
