// F2.11a test kurulumu (onboarding fixtures'ının dizin testleri için kopyası; modül sınırı
// başka modülün test dosyasına erişime izin vermez): seed'ler, test bölgesi, kayıt ucu.
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
