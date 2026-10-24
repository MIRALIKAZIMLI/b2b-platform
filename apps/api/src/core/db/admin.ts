// Veritabanı kurulum işleri: rollerin hazırlanması (db:bootstrap) ve migration (db:migrate).
// cli.ts ve test kurulumu (test/db.ts) kullanır; modüller kullanmaz.
// Adresler ve şifreler hiçbir koşulda loglanmaz veya hata mesajına yazılmaz.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

/** apps/api (src/core/db ve dist/core/db için aynı göreli yol). */
const API_ROOT = join(__dirname, '..', '..', '..');
/** apps/api/drizzle: yalnızca Drizzle migration'ları (meta/_journal.json). */
export const MIGRATIONS_FOLDER = join(API_ROOT, 'drizzle');
/** Rol dosyası migration değildir; migration klasörünün dışında durur (F1.2a). */
const ROLES_SQL_FILE = join(API_ROOT, 'db', 'bootstrap', 'roles.sql');

export interface Credentials {
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
}

/** Adresin kullanıcı, şifre veya veritabanı kısmını değiştirir (ana makine ve port aynı kalır). */
export function withCredentials(url: string, credentials: Credentials): string {
  const parsed = new URL(url);
  if (credentials.user !== undefined) parsed.username = encodeURIComponent(credentials.user);
  if (credentials.password !== undefined) {
    parsed.password = encodeURIComponent(credentials.password);
  }
  if (credentials.database !== undefined) parsed.pathname = `/${credentials.database}`;
  return parsed.toString();
}

interface UrlParts {
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

function urlParts(url: string): UrlParts {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  };
}

export interface BootstrapInput {
  /** Süper kullanıcı adresi; hedef veritabanına bağlanır. */
  readonly adminUrl: string;
  /** app_user adresi (DATABASE_URL); şifre buradan alınır. */
  readonly databaseUrl: string;
  /** migrator adresi (DATABASE_MIGRATOR_URL); şifre buradan alınır. */
  readonly migratorUrl: string;
}

/**
 * Rolleri oluşturur (db/bootstrap/roles.sql) ve app_user / migrator için LOGIN + şifre atar.
 * Adreslerdeki kullanıcı adları beklenen rol adları değilse hiçbir şey yapmadan durur.
 */
export async function bootstrapRoles(input: BootstrapInput): Promise<void> {
  const app = urlParts(input.databaseUrl);
  const migrator = urlParts(input.migratorUrl);
  const admin = urlParts(input.adminUrl);
  if (app.user !== 'app_user') {
    throw new Error('DATABASE_URL kullanıcısı app_user olmalı');
  }
  if (migrator.user !== 'migrator') {
    throw new Error('DATABASE_MIGRATOR_URL kullanıcısı migrator olmalı');
  }
  if (app.password === '' || migrator.password === '') {
    throw new Error('DATABASE_URL ve DATABASE_MIGRATOR_URL şifre içermeli');
  }
  if (app.database !== admin.database || migrator.database !== admin.database) {
    throw new Error('Bütün adresler aynı veritabanını göstermeli');
  }

  const client = new Client({ connectionString: input.adminUrl });
  await client.connect();
  try {
    await client.query(readFileSync(ROLES_SQL_FILE, 'utf8'));
    // ALTER ROLE parametre kabul etmez; şifre istemci tarafında güvenli biçimde tırnaklanır.
    await client.query(`ALTER ROLE app_user LOGIN PASSWORD ${client.escapeLiteral(app.password)}`);
    await client.query(
      `ALTER ROLE migrator LOGIN PASSWORD ${client.escapeLiteral(migrator.password)}`,
    );
  } finally {
    await client.end();
  }
}

/** Drizzle migration'larını (meta/_journal.json) migrator rolüyle uygular. */
export async function runMigrations(migratorUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: migratorUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}
