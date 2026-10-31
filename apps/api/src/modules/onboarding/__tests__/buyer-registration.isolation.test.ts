// F2.3a kiracı izolasyonu: kayıtla açılan iki perakendeci birbirinin satırını görmez; kayıt için
// eklenen SECURITY DEFINER fonksiyonları yalnızca bağlamdaki kullanıcı / işletme için ve yalnızca
// kendi koşullarında yazar; app_user users ve subscriptions'a doğrudan yazamaz.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { withSystemTx, withTenantTx, withUserTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { platformRows, RegistrationHttp, registerBody, runSeeds } from './fixtures';

interface Registered {
  readonly businessId: string;
  readonly userId: string;
}

async function expectDenied(promise: Promise<unknown>): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
}

describe('F2.3a izolasyon: perakendeci kaydı', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let a: Registered;
  let b: Registered;
  let buyerPlanId: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    const api = new RegistrationHttp(app);
    const register = async (): Promise<Registered> => {
      const phone = randomTestPhone();
      const response = await api.register(await api.pendingToken(phone), await registerBody());
      expect(response.status).toBe(201);
      const [user] = await platformRows<{ id: string }>(
        `select id from users where phone_e164 = $1`,
        [phone],
      );
      return {
        businessId: (response.body as { businessId: string }).businessId,
        userId: user?.id ?? '',
      };
    };
    a = await register();
    b = await register();
    const [plan] = await platformRows<{ id: string }>(
      `select id from plans where code = 'buyer_free'`,
    );
    buyerPlanId = plan?.id ?? '';
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F2.3a-ISO perakendeci A yalnızca kendi işletmesini, şubesini, üyeliğini ve aboneliğini görür', async () => {
    const seen = await withTenantTx({ businessId: a.businessId, userId: a.userId }, async (tx) => {
      const rows = await tx.execute<{ t: string; business_id: string }>(sql`
        select 'business' as t, id as business_id from businesses
        union all select 'branch', business_id from branches
        union all select 'membership', business_id from memberships
        union all select 'subscription', business_id from subscriptions
        union all select 'person', business_id from person_data
      `);
      return rows.rows;
    });
    expect(seen.length).toBe(5);
    expect(seen.every((row) => row.business_id === a.businessId)).toBe(true);
    expect(seen.some((row) => row.business_id === b.businessId)).toBe(false);
  });

  it('F2.3a-ISO app_user kiracı bağlamında users ve subscriptions satırını doğrudan yazamaz', async () => {
    await expectDenied(
      withTenantTx({ businessId: a.businessId, userId: randomUUID() }, (tx) =>
        tx.execute(sql`
          insert into users (id, phone_e164, full_name)
          values (nullif(current_setting('app.user_id', true), '')::uuid, ${randomTestPhone()}, 'X')`),
      ),
    );
    await expectDenied(
      withTenantTx({ businessId: a.businessId, userId: a.userId }, (tx) =>
        tx.execute(sql`
          insert into subscriptions (id, business_id, plan_id, status, current_period_start, current_period_end)
          values (${randomUUID()}, ${a.businessId}, ${buyerPlanId}, 'active', '2026-11-01', '2026-11-30')`),
      ),
    );
  });

  it('F2.3a-ISO subscription_start_self_signup: aboneliği olan, var olmayan veya başka işletme için yazmaz', async () => {
    const start = (businessId: string) =>
      withTenantTx({ businessId, userId: a.userId }, (tx) =>
        tx.execute(sql`
          select subscription_start_self_signup(
            ${randomUUID()}::uuid, ${buyerPlanId}::uuid, '2026-11-01'::date, '2026-11-30'::date,
            '2026-11-01T00:00:00Z'::timestamptz)`),
      );
    await expectDenied(start(a.businessId));
    await expectDenied(start(randomUUID()));
    const rows = await platformRows<{ n: number }>(
      `select count(*)::int as n from subscriptions where business_id = any($1::uuid[])`,
      [[a.businessId, b.businessId]],
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('F2.3a-ISO user_create_self_signup kiracı bağlamı olmadan, idempotency_store kullanıcı bağlamı olmadan çalışmaz', async () => {
    await expectDenied(
      withUserTx({ userId: randomUUID() }, (tx) =>
        tx.execute(sql`
          select user_create_self_signup(${randomTestPhone()}, 'X', null, '2026-11-01T00:00:00Z'::timestamptz)`),
      ),
    );
    await expectDenied(
      withSystemTx((tx) =>
        tx.execute(sql`
          select idempotency_store('k-0123456789abcdef', 'POST /x', 'h', 201, '{}'::jsonb,
                                   '2026-11-02T00:00:00Z'::timestamptz)`),
      ),
    );
  });
});
