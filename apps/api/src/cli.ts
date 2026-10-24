// Komut satırı işleri. Kullanım (apps/api içinden, derlendikten sonra):
//   node dist/cli.js db:bootstrap   rolleri hazırlar (yalnızca local / test ortamı)
//   node dist/cli.js db:migrate     migration'ları migrator rolüyle uygular
//   node dist/cli.js check-rls      tabloların RLS sınıfını denetler; sorun varsa çıkış kodu 1
//   node dist/cli.js db:seed        başlangıç verisini migrator rolüyle yükler (idempotent)
// Kökten: pnpm db:bootstrap · pnpm db:migrate · pnpm db:seed · pnpm check-rls
// Adres ve şifreler ekrana yazılmaz.
import { parseDbEnv, parseMigratorEnv } from '@b2b/shared';
import { Client } from 'pg';
import { bootstrapRoles, runMigrations, withCredentials } from './core/db/admin';
import { checkRls } from './core/db/check-rls';
import { assertBootstrapAllowed } from './core/db/bootstrap-env';
import { seedI18n } from './modules/i18n';

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

async function dbSeed(): Promise<void> {
  const { DATABASE_MIGRATOR_URL } = parseMigratorEnv(process.env);
  const client = new Client({ connectionString: DATABASE_MIGRATOR_URL });
  await client.connect();
  try {
    const i18n = await seedI18n(client);
    process.stdout.write(`db:seed tamamlandı: i18n ${String(i18n.inserted)} yeni satır.
`);
  } finally {
    await client.end();
  }
}

async function checkRlsCommand(): Promise<void> {
  const { DATABASE_MIGRATOR_URL } = parseMigratorEnv(process.env);
  const client = new Client({ connectionString: DATABASE_MIGRATOR_URL });
  await client.connect();
  try {
    const result = await checkRls(client);
    if (result.problems.length > 0) {
      for (const problem of result.problems) {
        process.stderr.write(`check-rls: ${problem.table}: ${problem.reason}\n`);
      }
      throw new Error(
        `check-rls: ${String(result.checked)} tablodan ${String(result.problems.length)} tanesinde sorun var`,
      );
    }
    process.stdout.write(
      `check-rls tamamlandı: ${String(result.checked)} tablo denetlendi, sorun yok.\n`,
    );
  } finally {
    await client.end();
  }
}

const COMMANDS: Record<string, () => Promise<void>> = {
  'db:bootstrap': dbBootstrap,
  'db:migrate': dbMigrate,
  'db:seed': dbSeed,
  'check-rls': checkRlsCommand,
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
