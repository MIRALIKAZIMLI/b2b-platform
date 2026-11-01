// F2.7a test kurulumu (ekip yönetimi). Seed'ler ve işletme (onaylı yetenek, şablondan admin rolü
// ve üyeliği, abonelik) tablo sahibi `migrator` ile platform bağlamında yazılır; test edilen uçlar
// RLS'e tabi app_user ile çalışır. Başka modüllere yalnız index.ts üzerinden erişilir.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { expect } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { SystemClock } from '../../../core/clock';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { seedBilling } from '../../billing';
import { seedBusinesses } from '../../businesses';
import { seedI18n } from '../../i18n';
import { TokenService } from '../../identity';
import { seedAccess } from '../seed/access.seed';

const ids = new UuidV7IdGenerator(new SystemClock());

export async function runTeamSeeds(): Promise<void> {
  const client = await connectAsMigrator();
  try {
    await seedI18n(client);
    await seedBusinesses(client);
    await seedBilling(client, () => ids.next());
    await seedAccess(client, () => ids.next());
  } finally {
    await client.end();
  }
}

/** Platform bağlamında (migrator, `app.is_platform`) sorgu. */
export async function platformRows<Row extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const client = await connectAsMigrator();
  try {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    const result = await client.query<Row>(text, params);
    await client.query('commit');
    return result.rows;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

/** Testin kendi bölgesi (AZ ülkesi seed'den). */
export async function newRegion(name: string): Promise<string> {
  const [row] = await platformRows<{ id: string }>(
    `insert into regions (country_code, type, name) values ('AZ', 'city', $1::jsonb) returning id`,
    [JSON.stringify({ az: name })],
  );
  if (row === undefined) throw new Error('bölge eklenemedi');
  return row.id;
}

/** İşletmeye şablondan (üyeliksiz) rol; rol ve şablonun aynı kodlu unvanı. */
export async function roleFromTemplate(
  businessId: string,
  templateCode: string,
): Promise<{ roleId: string; jobTitleId: string }> {
  const roleId = randomUUID();
  await platformRows(
    `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id)
     select $1, $2, name, capability, is_business_admin, id from role_templates where code = $3`,
    [roleId, businessId, templateCode],
  );
  await platformRows(
    `insert into role_permissions (role_id, permission_code, scope)
     select $1, p.permission_code, p.default_scope
       from role_template_permissions p join role_templates t on t.id = p.template_id
      where t.code = $2`,
    [roleId, templateCode],
  );
  const [title] = await platformRows<{ id: string }>(
    `select j.id from job_titles j join role_templates t on t.id = j.role_template_id
      where t.code = $1 and j.code = t.code`,
    [templateCode],
  );
  if (title === undefined) throw new Error(`unvan yok: ${templateCode}`);
  return { roleId, jobTitleId: title.id };
}

/** Var olan işletmeye şablondan rol ve üyelik; yeni kullanıcının kimliğini döner. */
export async function addMemberFromTemplate(
  businessId: string,
  templateCode: string,
): Promise<string> {
  const userId = randomUUID();
  await insertTestUser({ id: userId, phone: randomTestPhone() });
  const { roleId, jobTitleId } = await roleFromTemplate(businessId, templateCode);
  await platformRows(
    `insert into memberships (id, user_id, business_id, role_id, job_title_id)
     values ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, businessId, roleId, jobTitleId],
  );
  return userId;
}

export interface TestBusiness {
  readonly businessId: string;
  /** İşletme admini (`<yetenek>_business_admin` şablonu). */
  readonly adminUserId: string;
}

/** Onaylı yetenekli işletme + admin + abonelik (`pilot` / `buyer_free`). */
export async function newTestBusiness(
  capability: 'seller' | 'buyer' = 'seller',
): Promise<TestBusiness> {
  const businessId = randomUUID();
  const regionId = await newRegion('F2.7 test');
  await platformRows(
    `insert into businesses (id, legal_name, region_id, timezone, created_via)
     values ($1, $2, $3, 'Asia/Baku', 'admin')`,
    [businessId, `F2.7 Test ${businessId.slice(0, 8)}`, regionId],
  );
  await platformRows(
    `insert into business_capabilities (business_id, capability, status)
     values ($1, $2, 'approved')`,
    [businessId, capability],
  );
  await platformRows(
    `insert into subscriptions
       (id, business_id, plan_id, status, current_period_start, current_period_end)
     select $1, $2, id, 'active', current_date, current_date + 30 from plans where code = $3`,
    [randomUUID(), businessId, capability === 'seller' ? 'pilot' : 'buyer_free'],
  );
  const adminUserId = await addMemberFromTemplate(businessId, `${capability}_business_admin`);
  return { businessId, adminUserId };
}

/** HTTP yardımcıları: imzalı erişim anahtarı, dev SMS kutusu, gerçek OTP girişi. */
export class TeamHttp {
  constructor(private readonly app: NestFastifyApplication) {}

  http() {
    return request(this.app.getHttpServer());
  }

  async bearer(userId: string): Promise<{ Authorization: string }> {
    const signed = await this.app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}` };
  }

  private async smsBodies(phone: string): Promise<string[]> {
    const outbox = await this.http().get('/api/v1/dev/sms-outbox').query({ phone });
    return (outbox.body as { items: { body: string }[] }).items.map((item) => item.body);
  }

  /** Son davet SMS'i (dev_sms_outbox; yalnız test/local). */
  async lastInvitationSms(phone: string): Promise<string> {
    return (await this.smsBodies(phone)).find((body) => body.includes('/activate?token=')) ?? '';
  }

  async lastInvitationToken(phone: string): Promise<string> {
    const token = /activate\?token=([A-Za-z0-9_-]+)/.exec(await this.lastInvitationSms(phone))?.[1];
    expect(token, 'davet SMS’i yok').toBeDefined();
    return token ?? '';
  }

  /** Gerçek OTP girişi (dev kutusundan kod); erişim anahtarı döner. */
  async loginWithOtp(phone: string): Promise<string> {
    const requested = await this.http()
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'login' });
    expect(requested.status, JSON.stringify(requested.body)).toBe(202);
    const { challengeId } = requested.body as { challengeId: string };
    const otp = (await this.smsBodies(phone)).find(
      (body) => /\b\d{6}\b/.test(body) && !body.includes('token='),
    );
    const code = /\b(\d{6})\b/.exec(otp ?? '')?.[1] ?? '';
    const verified = await this.http().post('/api/v1/auth/otp/verify').send({ challengeId, code });
    expect(verified.status).toBe(200);
    return (verified.body as { accessToken: string }).accessToken;
  }
}
