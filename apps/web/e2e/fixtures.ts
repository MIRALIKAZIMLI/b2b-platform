// Uçtan uca test yardımcıları (F1.13a): test kullanıcısı (migrator, platform bağlamı; users FORCE
// RLS) ve mock SMS kutusundan kod okuma (`/api/v1/dev/sms-outbox`, yalnız local/test).
import { randomInt, randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import pg from 'pg';

export const API_URL = process.env.API_URL ?? 'http://localhost:3000';

async function withMigrator<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_MIGRATOR_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createUser(
  preferred: string | null = null,
): Promise<{ id: string; phone: string }> {
  const id = randomUUID();
  const phone = `+99455${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query(
      `insert into users (id, phone_e164, full_name, preferred_language, status)
       values ($1, $2, 'E2E', $3, 'active')`,
      [id, phone, preferred],
    );
    await client.query('commit');
  });
  return { id, phone };
}

export async function preferredLanguage(userId: string): Promise<string | null> {
  return await withMigrator(async (client) => {
    const result = await client.query<{ preferred_language: string | null }>(
      'select preferred_language from users where id = $1',
      [userId],
    );
    return result.rows[0]?.preferred_language ?? null;
  });
}

async function latestCode(request: APIRequestContext, phone: string): Promise<string> {
  const response = await request.get(`${API_URL}/api/v1/dev/sms-outbox`, { params: { phone } });
  expect(response.ok()).toBe(true);
  const json = (await response.json()) as { items: { body: string }[] };
  return /\b(\d{6})\b/.exec(json.items[0]?.body ?? '')?.[1] ?? '';
}

/** Giriş ekranında telefon → SMS kodu; oturum açılınca dönen adres beklenir. */
export async function loginThroughUi(page: Page, locale: string, phone: string): Promise<void> {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('input[name="code"]')).toBeVisible();
  const code = await latestCode(page.request, phone);
  await page.locator('input[name="code"]').fill(code);
  await page.locator('button[type="submit"]').click();
}
