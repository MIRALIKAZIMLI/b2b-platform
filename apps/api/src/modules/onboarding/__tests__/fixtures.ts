// F2.3a test kurulumu: seed'ler (diller, çeviriler, planlar, rol şablonları, faaliyet türleri),
// test bölgesi, kayıt anahtarı ve platform bağlamında doğrulama sorguları.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { SystemClock } from '../../../core/clock';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { seedAccess } from '../../access';
import { seedBilling } from '../../billing';
import { seedBusinesses } from '../../businesses';
import { seedI18n } from '../../i18n';
import { TokenService } from '../../identity';

const ids = new UuidV7IdGenerator(new SystemClock());

export async function runSeeds(): Promise<void> {
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

/** Platform bağlamında (migrator, `app.is_platform`) doğrulama sorgusu. */
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
  } finally {
    await client.end();
  }
}

export async function count(text: string, params: unknown[] = []): Promise<number> {
  const [row] = await platformRows<{ n: number }>(text, params);
  return row?.n ?? -1;
}

export interface Refs {
  readonly regionId: string;
  readonly activityTypeId: string;
  readonly inactiveActivityTypeId: string;
}

let refs: Refs | undefined;

/** Testin kendi bölgesi (AZ) ve seed'deki ilk faaliyet türü; ayrıca pasif bir tür. */
export async function testRefs(): Promise<Refs> {
  refs ??= await createRefs();
  return refs;
}

async function createRefs(): Promise<Refs> {
  const [region] = await platformRows<{ id: string }>(
    `insert into regions (country_code, type, name)
     values ('AZ', 'city', '{"az": "Kayıt test şəhəri"}'::jsonb) returning id`,
  );
  const [activity] = await platformRows<{ id: string }>(
    `select id from activity_types where is_active order by sort_order limit 1`,
  );
  const [inactive] = await platformRows<{ id: string }>(
    `insert into activity_types (name, is_active, sort_order)
     values ('{"az": "Pasif test növü"}'::jsonb, false, 999) returning id`,
  );
  return {
    regionId: region?.id ?? '',
    activityTypeId: activity?.id ?? '',
    inactiveActivityTypeId: inactive?.id ?? '',
  };
}

export async function registerBody(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const r = await testRefs();
  return {
    fullName: 'Leyla Əliyeva',
    legalName: `Leyla Market ${randomUUID().slice(0, 8)}`,
    activityTypeId: r.activityTypeId,
    regionId: r.regionId,
    consentVersion: 'v1',
    preferredLanguage: 'az',
    ...overrides,
  };
}

export function idempotencyKey(): string {
  return `reg-${randomUUID()}`;
}

export class RegistrationHttp {
  constructor(private readonly app: NestFastifyApplication) {}

  http() {
    return request(this.app.getHttpServer());
  }

  async pendingToken(phone: string): Promise<string> {
    return await this.app.get(TokenService).signPendingRegistration(phone);
  }

  register(
    token: string | undefined,
    body: object,
    headers: Record<string, string> = {},
  ): request.Test {
    const req = this.http().post('/api/v1/buyers/register').set(headers);
    if (token !== undefined) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  }
}

/** Telefona bağlı her satırın sayısı (R15: hiçbiri kalmamalı). */
export async function rowsForPhone(
  phone: string,
  legalName: string,
): Promise<Record<string, number>> {
  const user = `(select id from users where phone_e164 = $1)`;
  const business = `(select id from businesses where legal_name = $2)`;
  const params = [phone, legalName];
  return {
    users: await count(`select count(*)::int as n from users where phone_e164 = $1`, [phone]),
    businesses: await count(
      `select count(*)::int as n from businesses where legal_name = $2 and $1::text is not null`,
      params,
    ),
    memberships: await count(
      `select count(*)::int as n from memberships where user_id in ${user} or business_id in ${business}`,
      params,
    ),
    subscriptions: await count(
      `select count(*)::int as n from subscriptions where business_id in ${business} and $1::text is not null`,
      params,
    ),
    idempotency: await count(
      `select count(*)::int as n from idempotency_keys where user_id in ${user} and $2::text is not null`,
      params,
    ),
  };
}
