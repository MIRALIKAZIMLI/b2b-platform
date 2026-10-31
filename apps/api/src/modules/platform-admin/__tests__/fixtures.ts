// F2.1a entegrasyon testleri için ortak kurulum: seed'ler (diller, para birimi, çeviriler, planlar,
// rol şablonları), platform ekibi kullanıcısı, test bölgeleri ve HTTP yardımcıları.
// Testler kendi bölgelerini açar (onaylı pilot listesine bağlı değildir).
import { randomInt, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { expect } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { insertTestUser, insertTestUsers, randomTestPhone } from '../../../../test/users';
import { SystemClock } from '../../../core/clock';
import { withPlatformTx } from '../../../core/db';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { seedAccess } from '../../access';
import { seedBilling } from '../../billing';
import { seedI18n } from '../../i18n';
import { TokenService } from '../../identity';

const ids = new UuidV7IdGenerator(new SystemClock());

export type PlatformRoleName = 'super_admin' | 'operations' | 'support' | 'content';

export async function runSeeds(): Promise<void> {
  const client = await connectAsMigrator();
  try {
    await seedI18n(client);
    await seedBilling(client, () => ids.next());
    await seedAccess(client, () => ids.next());
  } finally {
    await client.end();
  }
}

/** Platform ekibinden kullanıcı (platform_staff S tablosu; migrator ile). */
export async function platformUser(role: PlatformRoleName | null): Promise<string> {
  const userId = randomUUID();
  await insertTestUsers(userId);
  if (role === null) return userId;
  const client = await connectAsMigrator();
  try {
    await client.query(`insert into platform_staff (user_id, role) values ($1, $2)`, [
      userId,
      role,
    ]);
  } finally {
    await client.end();
  }
  return userId;
}

export interface Refs {
  readonly sellerPlanId: string;
  readonly buyerPlanId: string;
  readonly cityId: string;
  readonly districtIds: readonly string[];
  /** Pasif para birimi (AC9). */
  readonly inactiveCurrency: string;
}

let refs: Refs | undefined;

export async function testRefs(): Promise<Refs> {
  refs ??= await createRefs();
  return refs;
}

async function createRefs(): Promise<Refs> {
  const actor = await platformUser(null);
  return await withPlatformTx({ userId: actor }, async (tx) => {
    await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                         values ('XIN', 'X', 2, false) on conflict do nothing`);
    const city = await tx.execute<{ id: string }>(sql`
      insert into regions (country_code, type, name)
      values ('AZ', 'city', '{"az": "Test şəhəri"}'::jsonb) returning id`);
    const cityId = city.rows[0]?.id ?? '';
    const districts = await tx.execute<{ id: string }>(sql`
      insert into regions (country_code, parent_id, type, name)
      values ('AZ', ${cityId}, 'district', '{"az": "Test rayonu 1"}'::jsonb),
             ('AZ', ${cityId}, 'district', '{"az": "Test rayonu 2"}'::jsonb)
      returning id`);
    const plans = await tx.execute<{ id: string; code: string }>(
      sql`select id, code from plans where code in ('pilot', 'buyer_free')`,
    );
    const plan = (code: string) => plans.rows.find((row) => row.code === code)?.id ?? '';
    return {
      sellerPlanId: plan('pilot'),
      buyerPlanId: plan('buyer_free'),
      cityId,
      districtIds: districts.rows.map((row) => row.id),
      inactiveCurrency: 'XIN',
    };
  });
}

/** Benzersiz, geçerli VÖEN (son hane 1 = tüzel kişi). */
export function randomVoen(lastDigit: 1 | 2 = 1): string {
  return `${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}${String(lastDigit)}`;
}

export interface SellerBody {
  legalName: string;
  voen: string;
  regionId: string;
  addressLine?: string;
  ownerPhone: string;
  ownerName: string;
  planId: string;
  serviceAreaRegionIds: string[];
  currency: string;
  timezone: string;
  applicationId?: string;
}

export async function sellerBody(overrides: Partial<SellerBody> = {}): Promise<SellerBody> {
  const r = await testRefs();
  return {
    legalName: 'Test Topdan MMC',
    voen: randomVoen(),
    regionId: r.cityId,
    addressLine: 'Nizami küç. 1',
    ownerPhone: randomTestPhone(),
    ownerName: 'Əli Məmmədov',
    planId: r.sellerPlanId,
    serviceAreaRegionIds: [...r.districtIds],
    currency: 'AZN',
    timezone: 'Asia/Baku',
    ...overrides,
  };
}

export class AdminHttp {
  constructor(private readonly app: NestFastifyApplication) {}

  http() {
    return request(this.app.getHttpServer());
  }

  async bearer(userId: string): Promise<{ Authorization: string }> {
    const signed = await this.app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}` };
  }

  /** Son aktivasyon SMS'indeki token (dev_sms_outbox; yalnızca test/local). */
  async lastActivationToken(phone: string): Promise<string> {
    const outbox = await this.http().get('/api/v1/dev/sms-outbox').query({ phone });
    const items = (outbox.body as { items: { body: string }[] }).items;
    const body = items.find((item) => item.body.includes('/activate?token='))?.body ?? '';
    const token = /activate\?token=([A-Za-z0-9_-]+)/.exec(body)?.[1];
    expect(token, 'aktivasyon SMS’i yok').toBeDefined();
    return token ?? '';
  }

  async activationSmsCount(phone: string): Promise<number> {
    const outbox = await this.http().get('/api/v1/dev/sms-outbox').query({ phone });
    const items = (outbox.body as { items: { body: string }[] }).items;
    return items.filter((item) => item.body.includes('/activate?token=')).length;
  }

  /** Gerçek OTP girişi (dev outbox'tan kod); erişim anahtarı döner. */
  async loginWithOtp(phone: string): Promise<string> {
    const requested = await this.http()
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'login' });
    expect(requested.status).toBe(202);
    const { challengeId } = requested.body as { challengeId: string };
    const outbox = await this.http().get('/api/v1/dev/sms-outbox').query({ phone });
    const items = (outbox.body as { items: { body: string }[] }).items;
    const otp = items.find((item) => /\b\d{6}\b/.test(item.body) && !item.body.includes('token='));
    const code = /\b(\d{6})\b/.exec(otp?.body ?? '')?.[1] ?? '';
    const verified = await this.http().post('/api/v1/auth/otp/verify').send({ challengeId, code });
    expect(verified.status).toBe(200);
    return (verified.body as { accessToken: string }).accessToken;
  }
}

/** Telefonu bilinen yeni kullanıcı (başka telefonla kabul denemesi). */
export async function userWithPhone(): Promise<{ id: string; phone: string }> {
  const id = randomUUID();
  const phone = randomTestPhone();
  await insertTestUser({ id, phone });
  return { id, phone };
}

/** İşletmeye ait satır sayıları (AC4, AC5: hiçbir satır kalmaz). */
export async function rowCounts(voen: string, phone: string): Promise<Record<string, number>> {
  const client = await connectAsMigrator();
  try {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    const count = async (text: string, params: unknown[]) =>
      (await client.query<{ n: number }>(text, params)).rows[0]?.n ?? -1;
    const business = `(select id from businesses where voen = $1)`;
    const result = {
      businesses: await count(`select count(*)::int as n from businesses where voen = $1`, [voen]),
      capabilities: await count(
        `select count(*)::int as n from business_capabilities where business_id in ${business}`,
        [voen],
      ),
      users: await count(`select count(*)::int as n from users where phone_e164 = $1`, [phone]),
      invitations: await count(`select count(*)::int as n from invitations where phone_e164 = $1`, [
        phone,
      ]),
    };
    await client.query('commit');
    return result;
  } finally {
    await client.end();
  }
}

/** Platform bağlamında tek sorgu (doğrulama). */
export async function platformQuery<T extends Record<string, unknown>>(
  query: ReturnType<typeof sql>,
): Promise<T[]> {
  const actor = await platformUser(null);
  const result = await withPlatformTx({ userId: actor }, (tx) => tx.execute<T>(query));
  return result.rows as T[];
}

/** audit_logs (S): yalnızca migrator okur. */
export async function auditRows(
  targetId: string,
): Promise<{ action: string; actor_type: string; before: unknown; after: unknown }[]> {
  const client = await connectAsMigrator();
  try {
    const result = await client.query<{
      action: string;
      actor_type: string;
      before: unknown;
      after: unknown;
    }>(
      `select action, actor_type, before, after from audit_logs where target_id = $1 order by id`,
      [targetId],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}
