// Uçtan uca test yardımcıları (F1.13a): test kullanıcısı (migrator, platform bağlamı; users FORCE
// RLS) ve mock SMS kutusundan kod okuma (`/api/v1/dev/sms-outbox`, yalnız local/test).
// F2.1b: platform ekibi kullanıcısı + TOTP kurulumu, test bölgesi, SMS'teki aktivasyon bağlantısı.
import { createHmac, randomInt, randomUUID } from 'node:crypto';
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

export function randomPhone(): string {
  return `+99455${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
}

/** Biçimce geçerli VÖEN (10 rakam, son hane 1 = tüzel kişi). */
export function randomVoen(): string {
  return `${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}1`;
}

export async function createUser(
  preferred: string | null = null,
): Promise<{ id: string; phone: string }> {
  const id = randomUUID();
  const phone = randomPhone();
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

/** İşletmeye etkin abonelik (F2.7b: `users.max` hak sınırı plandan; `pilot` / `buyer_free`). */
export async function addSubscription(businessId: string, planCode: string): Promise<void> {
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query(
      `insert into subscriptions
         (id, business_id, plan_id, status, current_period_start, current_period_end)
       select $1, $2, id, 'active', current_date, current_date + 30 from plans where code = $3`,
      [randomUUID(), businessId, planCode],
    );
    await client.query('commit');
  });
}

/**
 * İşletmeye şablondan ek rol (F2.7b): izinler kopyalanır. `addMembership` işletmeyi doğrudan SQL ile
 * açtığı için uygulamanın açılışta yaptığı tüm şablon kopyası (F2.7c) burada yoktur.
 */
export async function addRoleFromTemplate(businessId: string, templateCode: string): Promise<void> {
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    const roleId = randomUUID();
    // F2.8: aynı şablonun ikinci kopyası açılamaz (roles_business_template_copy_uq); varsa atlanır.
    const created = await client.query(
      `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id)
       select $1, $2, name, capability, is_business_admin, id from role_templates where code = $3
       on conflict (business_id, source_template_id)
         where source_template_id is not null and not is_custom do nothing`,
      [roleId, businessId, templateCode],
    );
    if ((created.rowCount ?? 0) > 0) {
      await client.query(
        `insert into role_permissions (role_id, permission_code, scope)
         select $1, p.permission_code, p.default_scope
           from role_template_permissions p join role_templates t on t.id = p.template_id
          where t.code = $2`,
        [roleId, templateCode],
      );
    }
    await client.query('commit');
  });
}

/**
 * F2.5b S1: işletmeye admin olmayan şube yöneticisi. `buyer_branch_admin` izinlerine ek olarak
 * `team.manage` ve `business.manage` taşıyan özel rol; üyelik adı verilen şubeye bağlanır.
 */
export async function addBranchManager(
  userId: string,
  businessId: string,
  branchName: string,
): Promise<void> {
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    const roleId = randomUUID();
    const template = await client.query<{ id: string; job_title_id: string }>(
      `select t.id, j.id as job_title_id
         from role_templates t join job_titles j on j.role_template_id = t.id and j.code = t.code
        where t.code = 'buyer_branch_admin'`,
    );
    const branch = await client.query<{ id: string }>(
      `select id from branches where business_id = $1 and name = $2`,
      [businessId, branchName],
    );
    const row = template.rows[0];
    const branchId = branch.rows[0]?.id;
    if (row === undefined || branchId === undefined) throw new Error('şablon veya şube yok');
    await client.query(
      `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id, is_custom)
       values ($1, $2, '{"az": "E2E filial müdiri"}'::jsonb, 'buyer', false, $3, true)`,
      [roleId, businessId, row.id],
    );
    await client.query(
      `insert into role_permissions (role_id, permission_code, scope)
       select $1::uuid, permission_code, default_scope from role_template_permissions where template_id = $2
       union all select $1::uuid, 'team.manage', 'all'
       union all select $1::uuid, 'business.manage', 'all'`,
      [roleId, row.id],
    );
    await client.query(
      `insert into memberships (id, user_id, business_id, role_id, job_title_id, branch_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), userId, businessId, roleId, row.job_title_id, branchId],
    );
    await client.query('commit');
  });
}

/** Platform ekibi kullanıcısı (`platform_staff` S tablosu). TOTP girişte kurulur. */
export async function createPlatformStaff(role: string): Promise<{ id: string; phone: string }> {
  const user = await createUser();
  await withMigrator(async (client) => {
    await client.query('insert into platform_staff (user_id, role) values ($1, $2)', [
      user.id,
      role,
    ]);
  });
  return user;
}

/** Test bölgesi (şehir): adı benzersiz, formda seçilir. */
export async function createRegion(): Promise<{ id: string; name: string }> {
  const name = `E2E şəhər ${randomUUID().slice(0, 8)}`;
  const id = await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    const result = await client.query<{ id: string }>(
      `insert into regions (country_code, parent_id, type, name)
       values ('AZ', null, 'city', jsonb_build_object('az', $1::text)) returning id`,
      [name],
    );
    await client.query('commit');
    return result.rows[0]?.id ?? '';
  });
  return { id, name };
}

async function smsBodies(request: APIRequestContext, phone: string): Promise<string[]> {
  const response = await request.get(`${API_URL}/api/v1/dev/sms-outbox`, { params: { phone } });
  expect(response.ok()).toBe(true);
  const json = (await response.json()) as { items: { body: string }[] };
  return json.items.map((item) => item.body);
}

async function latestCode(request: APIRequestContext, phone: string): Promise<string> {
  const [latest] = await smsBodies(request, phone);
  return /\b(\d{6})\b/.exec(latest ?? '')?.[1] ?? '';
}

/** Son aktivasyon SMS'indeki bağlantının yolu (`/<dil>/activate?token=…`; web köküne göre). */
export async function latestActivationPath(
  request: APIRequestContext,
  phone: string,
): Promise<string> {
  const body = (await smsBodies(request, phone)).find((text) => text.includes('/activate?token='));
  const link = /(https?:\/\/\S+\/activate\?token=[^\s]+)/.exec(body ?? '')?.[1];
  expect(link, 'aktivasyon SMS bağlantısı').toBeDefined();
  const url = new URL(link ?? '');
  return `${url.pathname}${url.search}`;
}

/** RFC 6238 TOTP (SHA-1, 6 hane, 30 sn); `offsetSteps` sonraki adımın kodu için. */
export function totpCode(base32Secret: string, offsetSteps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const hmac = createHmac('sha1', bytes).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

/** Ekrandaki telefon → SMS kodu adımları (giriş formu hangi sayfada olursa). */
export async function completeOtpLogin(page: Page, phone: string): Promise<void> {
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('input[name="code"]')).toBeVisible();
  const code = await latestCode(page.request, phone);
  await page.locator('input[name="code"]').fill(code);
  await page.locator('button[type="submit"]').click();
}

/** Giriş ekranında telefon → SMS kodu; oturum açılınca dönen adres beklenir. */
export async function loginThroughUi(page: Page, locale: string, phone: string): Promise<void> {
  await page.goto(`/${locale}/login`);
  await completeOtpLogin(page, phone);
}

/**
 * Platform ekibi girişi (US-002): SMS kodu → TOTP kurulumu (ekrandaki anahtarla) → kurtarma
 * kodları → TOTP. Kurulum onayı bir adımı kullandığı için girişte sonraki adımın kodu girilir
 * (sunucu ±1 adım kabul eder, aynı adımı ikinci kez kabul etmez).
 */
export async function loginPlatformThroughUi(
  page: Page,
  locale: string,
  phone: string,
): Promise<void> {
  await loginThroughUi(page, locale, phone);
  const uri = await page.locator('form code').first().textContent();
  const secret = new URL(uri ?? '').searchParams.get('secret') ?? '';
  await page.locator('input[name="code"]').fill(totpCode(secret));
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('form li code').first()).toBeVisible();
  await page.locator('button[type="submit"]').click();
  await page.locator('input[name="code"]').fill(totpCode(secret, 1));
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**/${locale}/admin`);
}

/** Temsilciye (`assigned` kapsam) bölge atar (F2.13b E2E-04): dizin ve istek bu bölgeyle sınırlı. */
export async function assignMembershipRegion(
  userId: string,
  businessId: string,
  regionId: string,
): Promise<void> {
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query(
      `insert into membership_regions (membership_id, region_id)
       select id, $3 from memberships where user_id = $1 and business_id = $2`,
      [userId, businessId, regionId],
    );
    await client.query('commit');
  });
}

/**
 * F2.15b: aktif bağlantı kurulumu (E2E-09). Bekçiler gereği istek satıcı bağlamında `pending`
 * eklenir, alıcı bağlamında `accepted` olur, bağlantıyı alıcı bağlamı ekler.
 */
export async function createActiveConnection(
  sellerId: string,
  buyerId: string,
  sentByUserId: string,
  respondedByUserId: string,
): Promise<string> {
  const requestId = randomUUID();
  const connectionId = randomUUID();
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.business_id', $1, true)", [sellerId]);
    await client.query(
      `insert into connection_requests
         (id, seller_id, buyer_id, sent_by_user_id, status, expires_at, seller_local_date)
       values ($1, $2, $3, $4, 'pending', now() + interval '14 days', current_date)`,
      [requestId, sellerId, buyerId, sentByUserId],
    );
    await client.query("select set_config('app.business_id', $1, true)", [buyerId]);
    await client.query(
      `update connection_requests
          set status = 'accepted', responded_at = now(), responded_by_user_id = $2
        where id = $1`,
      [requestId, respondedByUserId],
    );
    await client.query(
      `insert into connections (id, seller_id, buyer_id, request_id, status, started_at)
       select $1, seller_id, buyer_id, id, 'active', responded_at
         from connection_requests where id = $2`,
      [connectionId, requestId],
    );
    await client.query('commit');
  });
  return connectionId;
}

/** F2.18b: işletmeye VÖEN yazar (0016 tetikleyicisi hukuki tipi türetir; doğrulama boş kalır). */
export async function setBusinessVoen(businessId: string, voen: string): Promise<void> {
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query('update businesses set voen = $2 where id = $1', [businessId, voen]);
    await client.query('commit');
  });
}

/** F2.18b: işletme durumunu doğrudan yazar (ör. `dormant`; F2.17 gelene kadar başka yolu yok). */
export async function setBusinessStatus(businessId: string, status: string): Promise<void> {
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query('update businesses set status = $2 where id = $1', [businessId, status]);
    await client.query('commit');
  });
}

/**
 * Toptancının bekleyen marka talebi (F3.2b): `POST /catalog/brands` ile aynı satır (`requested`,
 * talep eden işletme ve kullanıcı); platform bağlamında, migrator ile.
 */
export async function createBrandRequest(
  businessId: string,
  userId: string,
  name: string,
): Promise<void> {
  await withMigrator(async (client) => {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query(
      `insert into brands (id, name, status, requested_by_business_id, requested_by_user_id)
       values ($1, $2, 'requested', $3, $4)`,
      [randomUUID(), name, businessId, userId],
    );
    await client.query('commit');
  });
}
