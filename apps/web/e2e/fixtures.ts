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

/**
 * Kullanıcıya üyelik (F1.13b): yeni işletme + onaylı yetenek + şablondan rol (izinler kopyalanır) +
 * aynı kodlu unvan. Seed'deki rol şablonları kullanılır (c4 §5). Platform bağlamında, migrator ile.
 */
export async function addMembership(
  userId: string,
  templateCode: string,
  businessName: string,
): Promise<{ businessId: string }> {
  const businessId = randomUUID();
  const roleId = randomUUID();
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    const region = await client.query<{ id: string }>(
      `insert into regions (country_code, parent_id, type, name)
       values ('AZ', null, 'city', '{"az": "E2E"}'::jsonb) returning id`,
    );
    const template = await client.query<{ id: string; capability: string; job_title_id: string }>(
      `select t.id, t.capability, j.id as job_title_id
         from role_templates t join job_titles j on j.role_template_id = t.id and j.code = t.code
        where t.code = $1`,
      [templateCode],
    );
    const row = template.rows[0];
    if (row === undefined) throw new Error(`rol şablonu yok: ${templateCode}`);
    await client.query(
      `insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
       values ($1, $2, 'AZ', $3, 'Asia/Baku', 'self_signup')`,
      [businessId, businessName, region.rows[0]?.id],
    );
    await client.query(
      `insert into business_capabilities (business_id, capability, status)
       values ($1, $2, 'approved')`,
      [businessId, row.capability],
    );
    await client.query(
      `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id)
       select $1, $2, name, capability, is_business_admin, id from role_templates where id = $3`,
      [roleId, businessId, row.id],
    );
    await client.query(
      `insert into role_permissions (role_id, permission_code, scope)
       select $1, permission_code, default_scope from role_template_permissions
        where template_id = $2`,
      [roleId, row.id],
    );
    await client.query(
      `insert into memberships (id, user_id, business_id, role_id, job_title_id)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), userId, businessId, roleId, row.job_title_id],
    );
    await client.query('commit');
  });
  return { businessId };
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
