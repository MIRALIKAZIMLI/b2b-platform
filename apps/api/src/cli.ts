// Komut satırı işleri. Kullanım (apps/api içinden, derlendikten sonra):
//   node dist/cli.js db:bootstrap   rolleri hazırlar (yalnızca local / test ortamı)
//   node dist/cli.js db:migrate     migration'ları migrator rolüyle uygular
// Kökten: pnpm db:bootstrap · pnpm db:migrate
// Adres ve şifreler ekrana yazılmaz.
import { parseDbEnv, parseMigratorEnv } from '@b2b/shared';
import { bootstrapRoles, runMigrations, withCredentials } from './core/db/admin';
import { assertBootstrapAllowed } from './core/db/bootstrap-env';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Ortam değişkeni eksik: ${name}`);
  }
  return value;
}

async function dbBootstrap(): Promise<void> {
  assertBootstrapAllowed(process.env);
  const { DATABASE_URL } = parseDbEnv(process.env);
  const { DATABASE_MIGRATOR_URL } = parseMigratorEnv(process.env);
  // Süper kullanıcı: docker compose'un POSTGRES_USER / POSTGRES_PASSWORD değerleri;
  // ana makine, port ve veritabanı DATABASE_URL ile aynıdır.
  const adminUrl = withCredentials(DATABASE_URL, {
    user: requireEnv('POSTGRES_USER'),
    password: requireEnv('POSTGRES_PASSWORD'),
  });
  await bootstrapRoles({ adminUrl, databaseUrl: DATABASE_URL, migratorUrl: DATABASE_MIGRATOR_URL });
  process.stdout.write('db:bootstrap tamamlandı: app_user, migrator, readonly hazır.\n');
}

async function dbMigrate(): Promise<void> {
  const { DATABASE_MIGRATOR_URL } = parseMigratorEnv(process.env);
  await runMigrations(DATABASE_MIGRATOR_URL);
  process.stdout.write('db:migrate tamamlandı.\n');
}

const COMMANDS: Record<string, () => Promise<void>> = {
  'db:bootstrap': dbBootstrap,
  'db:migrate': dbMigrate,
};

async function main(): Promise<void> {
  const name = process.argv[2] ?? '';
  const command = COMMANDS[name];
  if (command === undefined) {
    throw new Error(`Bilinmeyen komut: "${name}". Komutlar: ${Object.keys(COMMANDS).join(', ')}`);
  }
  await command();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'bilinmeyen hata';
  process.stderr.write(`Hata: ${message}\n`);
  process.exitCode = 1;
});
