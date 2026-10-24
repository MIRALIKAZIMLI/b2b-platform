// Drizzle Kit yapılandırması (migration üretimi: `pnpm --filter @b2b/api exec drizzle-kit generate`).
// Migration'ları uygulamak için `pnpm db:migrate` kullanılır (src/cli.ts, migrator rolü).
// Not: drizzle/0000_roles.sql bilinçli olarak meta/_journal.json'da yoktur (db:bootstrap çalıştırır).
import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

const ENV_FILE = '../../.env';
if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/*.schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_MIGRATOR_URL ?? '',
  },
});
