// pg havuzu + Drizzle örneği. Yalnızca core/db içinden kullanılır (lint: no-restricted-imports);
// modüller veritabanına withTenantTx / withPlatformTx üzerinden erişir (coding-guidelines §3.7).
import { Logger } from '@nestjs/common';
import { parseDbEnv } from '@b2b/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Db = NodePgDatabase;

interface DbState {
  readonly pool: Pool;
  readonly db: Db;
}

let state: DbState | undefined;

const logger = new Logger('Db');

/**
 * Boştaki bir bağlantı koparsa pg havuzu 'error' olayı yayar; dinleyici yoksa süreç çöker.
 * Olay loglanır, süreç ayakta kalır (havuz kopan bağlantıyı kendisi atar).
 * Mesaja yalnızca hata kodu yazılır: pg mesajları adres içerebilir.
 */
export function attachPoolErrorHandler(pool: Pool, log: (message: string) => void): void {
  pool.on('error', (error: Error & { code?: unknown }) => {
    const code = typeof error.code === 'string' ? error.code : 'unknown';
    log(`db.pool_error: havuzda boştaki bağlantı hatası (kod: ${code})`);
  });
}

/** Havuzu ilk kullanımda, ortam değişkenlerinden (DATABASE_URL, DB_POOL_MAX) oluşturur. */
export function getDb(): Db {
  if (state === undefined) {
    const env = parseDbEnv(process.env);
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX });
    attachPoolErrorHandler(pool, (message) => {
      logger.error(message);
    });
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
