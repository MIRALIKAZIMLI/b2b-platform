// F3.2a izolasyon (R37, V5): bir toptancının marka talebi başka kiracıya görünmez; kiracı `brands`'a
// doğrudan yazamaz; talep fonksiyonu yalnız onaylı toptancı bağlamında ve kendi üyesiyle çalışır.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser, connectAsSuperuser } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { newBuyer, newRegion, newSeller, runSeeds, type Seller } from './buyer-fixtures';
import { AdminHttp } from './fixtures';

type Client = Awaited<ReturnType<typeof connectAsAppUser>>;

/** app_user ile tek işlem; bağlam `app.business_id` veya platform. */
async function inContext<T>(
  context: { businessId?: string; platform?: boolean },
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = await connectAsAppUser();
  try {
    await client.query('begin');
    if (context.businessId !== undefined) {
      await client.query("select set_config('app.business_id', $1, true)", [context.businessId]);
    }
    if (context.platform === true) {
      await client.query("select set_config('app.is_platform', 'true', true)");
    }
    return await run(client);
  } finally {
    await client.query('rollback');
    await client.end();
  }
}

function callRequest(client: Client, userId: string, name: string) {
  return client.query(`select brand_request_create($1, $2, $3, 10, now())`, [
    randomUUID(),
    name,
    userId,
  ]);
}

describe('F3.2a marka talebi izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: AdminHttp;
  let a: Seller;
  let b: Seller;
  let brandId: string;
  const name = `İzolasyon ${randomUUID().slice(0, 12)}`;

  beforeAll(async () => {
    await runSeeds();
    const regionId = await newRegion('F3.2a izolasyon');
    a = await newSeller(regionId);
    b = await newSeller(regionId);
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new AdminHttp(app);
    const created = await h
      .http()
      .post('/api/v1/catalog/brands')
      .set({ ...(await h.bearer(a.admin.userId)), 'X-Business-Id': a.businessId })
      .send({ name });
    expect(created.status).toBe(201);
    brandId = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    const client = await connectAsSuperuser();
    try {
      await client.query('delete from brands where requested_by_business_id = any($1)', [
        [a.businessId, b.businessId],
      ]);
    } finally {
      await client.end();
    }
    await redis.cleanup();
    await app.close();
  });

  it('F3.2a-AC2 izolasyon: B toptancısı A nın talebini API de görmez', async () => {
    const own = await h
      .http()
      .get('/api/v1/catalog/brand-requests')
      .set({ ...(await h.bearer(b.admin.userId)), 'X-Business-Id': b.businessId });
    expect(own.status).toBe(200);
    expect((own.body as { id: string }[]).some((item) => item.id === brandId)).toBe(false);
  });

  it('F3.2a-AC2 izolasyon: veritabanında yalnız talep eden ve platform okur', async () => {
    const buyer = await newBuyer(await newRegion('F3.2a izolasyon 2'));
    const seen = async (context: { businessId?: string; platform?: boolean }) =>
      await inContext(context, async (client) => {
        const rows = await client.query('select id from brands where id = $1', [brandId]);
        return rows.rowCount;
      });
    expect(await seen({ businessId: a.businessId })).toBe(1);
    expect(await seen({ businessId: b.businessId })).toBe(0);
    expect(await seen({ businessId: buyer.businessId })).toBe(0);
    expect(await seen({})).toBe(0);
    expect(await seen({ platform: true })).toBe(1);
  });

  it('F3.2a-AC5 izolasyon: kiracı brands e doğrudan ekleyemez, güncelleyemez', async () => {
    await inContext({ businessId: a.businessId }, async (client) => {
      await client.query('savepoint s1');
      await expect(
        client.query(
          `insert into brands (id, name, status, requested_by_business_id)
           values ($1, 'Doğrudan', 'requested', $2)`,
          [randomUUID(), a.businessId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint s1');
      const updated = await client.query(`update brands set status = 'active' where id = $1`, [
        brandId,
      ]);
      expect(updated.rowCount).toBe(0);
    });
  });

  it('F3.2a-AC5 izolasyon: talep fonksiyonu perakendeci, platform, bağlamsız ve yabancı üyeyle 42501', async () => {
    const buyer = await newBuyer(await newRegion('F3.2a izolasyon 3'));
    await inContext({ businessId: buyer.businessId }, async (client) => {
      await expect(callRequest(client, buyer.admin.userId, 'X1')).rejects.toMatchObject({
        code: '42501',
      });
    });
    await inContext({ platform: true }, async (client) => {
      await expect(callRequest(client, a.admin.userId, 'X2')).rejects.toMatchObject({
        code: '42501',
      });
    });
    await inContext({}, async (client) => {
      await expect(callRequest(client, a.admin.userId, 'X3')).rejects.toMatchObject({
        code: '42501',
      });
    });
    // A bağlamında B'nin kullanıcısı adına talep yazılamaz.
    await inContext({ businessId: a.businessId }, async (client) => {
      await expect(callRequest(client, b.admin.userId, 'X4')).rejects.toMatchObject({
        code: '42501',
      });
    });
  });
});
