// pg havuzu + Drizzle örneği. Yalnızca core/db içinden kullanılır (lint: no-restricted-imports);
// modüller veritabanına withTenantTx / withPlatformTx üzerinden erişir (coding-guidelines §3.7).
import { parseDbEnv } from '@b2b/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Db = NodePgDatabase;

interface DbState {
  readonly pool: Pool;
  readonly db: Db;
}

let state: DbState | undefined;

/** Havuzu ilk kullanımda, ortam değişkenlerinden (DATABASE_URL, DB_POOL_MAX) oluşturur. */
export function getDb(): Db {
  if (state === undefined) {
    const env = parseDbEnv(process.env);
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX });
    state = { pool, db: drizzle({ client: pool }) };
  }
  return state.db;
}

/** Havuzu kapatır (testler ve uygulama kapanışı için). */
export async function closeDb(): Promise<void> {
  if (state === undefined) {
    return;
  }
  const { pool } = state;
  state = undefined;
  await pool.end();
}
