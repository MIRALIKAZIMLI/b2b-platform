// F1.8a entegrasyon/izolasyon testleri için ortak kurulum. Erişim seed'i (izinler, şablonlar,
// unvanlar) migrator ile yüklenir (idempotent). İşletme, kullanıcı ve üyelik satırları test başına
// rastgele kimliklerle açılır; dosyalar arasında çakışmaz.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { connectAsMigrator } from '../../../../test/db-clients';
import { insertTestUsers } from '../../../../test/users';
import { AuditService } from '../../../core/audit';
import { SystemClock } from '../../../core/clock';
import { type TenantTxContext, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { OutboxWriter } from '../../../core/outbox';
import { AccessRepository } from '../access.repository';
import { MembershipService } from '../membership.service';
import { RoleService } from '../role.service';
import { seedAccess } from '../seed/access.seed';

export const clock = new SystemClock();
export const ids = new UuidV7IdGenerator(clock);

export interface AccessServices {
  readonly roles: RoleService;
  readonly memberships: MembershipService;
}

export function createServices(): AccessServices {
  const repository = new AccessRepository();
  return {
    roles: new RoleService(repository, ids, clock),
    memberships: new MembershipService(
      repository,
      new AuditService(clock),
      new OutboxWriter(),
      clock,
    ),
  };
}

export async function runAccessSeed(): Promise<number> {
  const client = await connectAsMigrator();
  try {
    return (await seedAccess(client, () => ids.next())).inserted;
  } finally {
    await client.end();
  }
}

/** Şablon ve aynı kodlu unvan kimliği (G tabloları herkese okunur). */
export async function templateRefs(
  code: string,
): Promise<{ templateId: string; jobTitleId: string }> {
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

export interface Refs {
  readonly regionId: string;
}

const PLATFORM = { userId: randomUUID() };

/** Üst kayıtlar (para birimi, ülke, bölge) platform bağlamında; kodlar seed ile çakışmaz. */
async function createRefs(): Promise<Refs> {
  await insertTestUsers(PLATFORM.userId);
  return await withPlatformTx(PLATFORM, async (tx) => {
    await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                         values ('XBA', 'X', 2, true) on conflict do nothing`);
    await tx.execute(sql`insert into countries
                           (code, name, default_currency, default_timezone, phone_prefix)
                         values ('XB', '{"az": "Test"}'::jsonb, 'XBA', 'Asia/Baku', '+997')
                         on conflict do nothing`);
    const region = await tx.execute<{ id: string }>(sql`
      insert into regions (country_code, parent_id, type, name)
      values ('XB', null, 'city', '{"az": "Test"}'::jsonb) returning id`);
    const regionId = region.rows[0]?.id;
    if (regionId === undefined) throw new Error('test üst kayıtları oluşmadı');
    return { regionId };
  });
}

async function createBusiness(tenant: TenantTxContext, shared: Refs): Promise<void> {
  await withTenantTx(tenant, (tx) =>
    tx.execute(sql`
      insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
      values (${tenant.businessId}, 'Test MMC', 'XB', ${shared.regionId}, 'Asia/Baku',
              'self_signup')`),
  );
}

let refs: Refs | undefined;

/** Üst kayıtlar (bölge vb.); dosya başına bir kez açılır. */
export async function testRefs(): Promise<Refs> {
  refs ??= await createRefs();
  return refs;
}

/** Yeni toptancı işletmesi; işlemi yapan kullanıcı (`userId`) users'da. */
export async function newBusiness(): Promise<TenantTxContext & { userId: string }> {
  const shared = await testRefs();
  const tenant = { businessId: randomUUID(), userId: randomUUID() };
  await insertTestUsers(tenant.userId);
  await createBusiness(tenant, shared);
  return tenant;
}

/** Üyelik açar (kiracı bağlamında); yeni kullanıcıyı da ekler. */
export async function addMember(
  tenant: TenantTxContext,
  roleId: string,
  jobTitleId: string,
  userId: string = randomUUID(),
): Promise<{ membershipId: string; userId: string }> {
  await insertTestUsers(userId);
  const membershipId = ids.next();
  await withTenantTx(tenant, (tx) =>
    tx.execute(sql`
      insert into memberships (id, user_id, business_id, role_id, job_title_id)
      values (${membershipId}, ${userId}, ${tenant.businessId}, ${roleId}, ${jobTitleId})`),
  );
  return { membershipId, userId };
}

export interface AdminSetup {
  readonly tenant: TenantTxContext & { userId: string };
  readonly adminRoleId: string;
  readonly staffRoleId: string;
  readonly adminTitleId: string;
  readonly staffTitleId: string;
}

/** İşletme + İşletme Admini ve Satış Temsilcisi rolleri (şablondan kopya). */
export async function adminSetup(services: AccessServices): Promise<AdminSetup> {
  const tenant = await newBusiness();
  const admin = await templateRefs('seller_business_admin');
  const staff = await templateRefs('seller_sales_rep');
  const adminRoleId = await services.roles.createFromTemplate(tenant, admin.templateId);
  const staffRoleId = await services.roles.createFromTemplate(tenant, staff.templateId);
  return {
    tenant,
    adminRoleId,
    staffRoleId,
    adminTitleId: admin.jobTitleId,
    staffTitleId: staff.jobTitleId,
  };
}
