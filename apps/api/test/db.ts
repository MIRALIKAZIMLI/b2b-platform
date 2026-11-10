// Entegrasyon testleri için veritabanı (vitest globalSetup).
// - CI: TEST_DATABASE_ADMIN_URL (servis container'ının süper kullanıcısı) kullanılır.
// - Yerel: @testcontainers/postgresql ile geçici bir PostgreSQL başlatılır (Docker gerekir).
// Her çalıştırmada boş bir veritabanı açılır; roller hazırlanır (db:bootstrap ile aynı kod),
// migration'lar `migrator` olarak uygulanır, testlere `app_user` bağlantısı verilir.
// Rol şifreleri her çalıştırmada rastgele üretilir; depoda ve logda şifre yoktur.
import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import { bootstrapRoles, runMigrations, withCredentials } from '../src/core/db/admin';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    migratorUrl: string;
    redisUrl: string;
    superuserUrl: string;
  }
}

const POSTGRES_IMAGE = 'postgres:16.15-alpine';
/** Yerelde docker compose Redis'i (infra/docker-compose.dev.yml); CI REDIS_URL verir. */
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

let container: StartedPostgreSqlContainer | undefined;
let adminUrl: string | undefined;
let testDatabase: string | undefined;

async function adminQuery(url: string, query: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

/** E1: testler süper kullanıcıyla değil, RLS'e tabi `app_user` ile çalışmalı. */
async function assertAppUserIsRestricted(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      'select current_user, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = current_user',
    );
    const row = result.rows[0];
    if (row?.current_user !== 'app_user' || row.rolsuper || row.rolbypassrls) {
      throw new Error('Test bağlantısı RLS e tabi app_user değil; testler durduruldu.');
    }
  } finally {
    await client.end();
  }
}

export async function setup(project: TestProject): Promise<void> {
  const ciAdminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (ciAdminUrl !== undefined && ciAdminUrl !== '') {
    adminUrl = ciAdminUrl;
  } else {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    adminUrl = container.getConnectionUri();
  }

  testDatabase = `b2b_test_${randomBytes(6).toString('hex')}`;
  await adminQuery(adminUrl, `create database ${testDatabase}`);

  const databaseUrl = withCredentials(adminUrl, {
    user: 'app_user',
    password: randomBytes(24).toString('hex'),
    database: testDatabase,
  });
  const migratorUrl = withCredentials(adminUrl, {
    user: 'migrator',
    password: randomBytes(24).toString('hex'),
    database: testDatabase,
  });
  const testAdminUrl = withCredentials(adminUrl, { database: testDatabase });

  await bootstrapRoles({ adminUrl: testAdminUrl, databaseUrl, migratorUrl });
  await runMigrations(migratorUrl);
  await assertAppUserIsRestricted(databaseUrl);

  project.provide('databaseUrl', databaseUrl);
  project.provide('migratorUrl', migratorUrl);
  // RLS'i aşan süper kullanıcı: yalnız bekçi tetikleyicisinin bağlamsız yolunu sınamak için.
  project.provide('superuserUrl', testAdminUrl);
  const redisUrl = process.env.REDIS_URL;
  project.provide(
    'redisUrl',
    redisUrl === undefined || redisUrl === '' ? LOCAL_REDIS_URL : redisUrl,
  );
}

export async function teardown(): Promise<void> {
  if (container !== undefined) {
    await container.stop();
    return;
  }
  if (adminUrl !== undefined && testDatabase !== undefined) {
    await adminQuery(adminUrl, `drop database if exists ${testDatabase} with (force)`);
  }
}
