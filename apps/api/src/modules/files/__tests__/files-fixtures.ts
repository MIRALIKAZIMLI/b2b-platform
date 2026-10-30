// F1.10 entegrasyon/izolasyon testleri için ortak kurulum: AppModule (yerel disk deposu, geçici
// klasör), FixedClock, gerçek PostgreSQL (app_user, RLS) ve önekli test Redis'i.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from '../../../../test/http-app';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUsers } from '../../../../test/users';
import { Clock, FixedClock } from '../../../core/clock';
import { type TenantTxContext, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { RoleService, seedAccess } from '../../access';
import { TokenService } from '../../identity';

const ids = new UuidV7IdGenerator(new FixedClock(new Date()));
const PLATFORM = { userId: randomUUID() };

/** Erişim seed'i (izinler, rol şablonları, unvanlar); idempotent. */
async function runAccessSeed(): Promise<void> {
  const client = await connectAsMigrator();
  try {
    await seedAccess(client, () => ids.next());
  } finally {
    await client.end();
  }
}

async function templateRefs(code: string): Promise<{ templateId: string; jobTitleId: string }> {
  const rows = await withSystemTx((tx) =>
    tx.execute<{ template_id: string; job_title_id: string }>(sql`
      select t.id as template_id, j.id as job_title_id
        from role_templates t join job_titles j on j.role_template_id = t.id
       where t.code = ${code} and j.code = ${code}`),
  );
  const row = rows.rows[0];
  if (row === undefined) throw new Error(`şablon yok: ${code}`);
  return { templateId: row.template_id, jobTitleId: row.job_title_id };
}

let regionId: string | undefined;

/** Üst kayıtlar (para birimi, ülke, bölge); dosya başına bir kez. Kodlar seed ile çakışmaz. */
async function testRegion(): Promise<string> {
  if (regionId !== undefined) return regionId;
  await insertTestUsers(PLATFORM.userId);
  regionId = await withPlatformTx(PLATFORM, async (tx) => {
    await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                         values ('XFA', 'X', 2, true) on conflict do nothing`);
    await tx.execute(sql`insert into countries
                           (code, name, default_currency, default_timezone, phone_prefix)
                         values ('XF', '{"az": "Test"}'::jsonb, 'XFA', 'Asia/Baku', '+998')
                         on conflict do nothing`);
    const region = await tx.execute<{ id: string }>(sql`
      insert into regions (country_code, parent_id, type, name)
      values ('XF', null, 'city', '{"az": "Test"}'::jsonb) returning id`);
    const id = region.rows[0]?.id;
    if (id === undefined) throw new Error('test bölgesi oluşmadı');
    return id;
  });
  return regionId;
}

/** Onaylı toptancı işletmesi; `userId` users'da. */
async function newSeller(): Promise<TenantTxContext & { userId: string }> {
  const region = await testRegion();
  const tenant = { businessId: randomUUID(), userId: randomUUID() };
  await insertTestUsers(tenant.userId);
  await withTenantTx(tenant, (tx) =>
    tx.execute(sql`
      insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
      values (${tenant.businessId}, 'Test MMC', 'XF', ${region}, 'Asia/Baku', 'self_signup')`),
  );
  await withPlatformTx(PLATFORM, (tx) =>
    tx.execute(sql`insert into business_capabilities (business_id, capability, status)
                   values (${tenant.businessId}, 'seller', 'approved')`),
  );
  return tenant;
}

async function addMember(
  tenant: TenantTxContext,
  roleId: string,
  jobTitleId: string,
  userId: string = randomUUID(),
): Promise<string> {
  await insertTestUsers(userId);
  await withTenantTx(tenant, (tx) =>
    tx.execute(sql`
      insert into memberships (id, user_id, business_id, role_id, job_title_id)
      values (${ids.next()}, ${userId}, ${tenant.businessId}, ${roleId}, ${jobTitleId})`),
  );
  return userId;
}

export interface FilesTestContext {
  readonly app: NestFastifyApplication;
  readonly clock: FixedClock;
  close(): Promise<void>;
}

export async function startFilesApp(): Promise<FilesTestContext> {
  await runAccessSeed();
  const directory = await mkdtemp(path.join(tmpdir(), 'b2b-files-int-'));
  const redis: TestRedis = createTestRedis();
  const clock = new FixedClock(new Date());
  const app = await createTestApp({
    env: { REDIS_URL: process.env.REDIS_URL ?? '', STORAGE_LOCAL_DIR: directory },
    overrides: [
      { provide: REDIS_CLIENT, useValue: redis.client },
      { provide: Clock, useValue: clock },
    ],
  });
  return {
    app,
    clock,
    async close() {
      const keys = await redis.keys();
      if (keys.length > 0) await redis.client.del(...keys);
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

/** Toptancı işletmesi; sahibi İşletme Admini, ayrıca bir Satış Temsilcisi üye. */
export async function sellerWithMembers(app: NestFastifyApplication) {
  const roles = app.get(RoleService);
  const tenant = await newSeller();
  const admin = await templateRefs('seller_business_admin');
  const rep = await templateRefs('seller_sales_rep');
  const adminRoleId = await roles.createFromTemplate(tenant, admin.templateId);
  const repRoleId = await roles.createFromTemplate(tenant, rep.templateId);
  await addMember(tenant, adminRoleId, admin.jobTitleId, tenant.userId);
  const repUserId = await addMember(tenant, repRoleId, rep.jobTitleId);
  return { tenant, repUserId };
}

export async function authHeaders(
  app: NestFastifyApplication,
  userId: string,
  businessId: string,
): Promise<Record<string, string>> {
  const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
  return { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId };
}

export interface UploadTicket {
  readonly fileId: string;
  readonly uploadUrl: string;
  readonly headers: Record<string, string>;
}

/** İmzalı URL'nin yolu (yerel depo bağlantısı aynı uygulamaya gider). */
export function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export async function requestUpload(
  app: NestFastifyApplication,
  headers: Record<string, string>,
  body: { purpose: string; contentType: string; sizeBytes: number },
) {
  return await request(app.getHttpServer())
    .post('/api/v1/files/upload-url')
    .set(headers)
    .send(body);
}

export async function putObject(
  app: NestFastifyApplication,
  ticket: UploadTicket,
  content: Buffer,
) {
  return await request(app.getHttpServer())
    .put(pathOf(ticket.uploadUrl))
    .set(ticket.headers)
    .send(content);
}

export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(56, 1),
]);

/** `.png` diye bildirilen EXE (F1.10-AC2). */
export const EXE_BYTES = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(60, 0)]);

export interface FileRowView {
  readonly status: string;
  readonly object_key: string;
  readonly owner_business_id: string | null;
}

/** Satırı platform bağlamında okur (FORCE RLS tablo sahibine de uygulanır). */
export async function fileRow(id: string): Promise<FileRowView | undefined> {
  const result = await withPlatformTx({ userId: randomUUID() }, (tx) =>
    tx.execute<FileRowView & Record<string, unknown>>(
      sql`select status, object_key, owner_business_id from files where id = ${id}`,
    ),
  );
  return result.rows[0];
}
