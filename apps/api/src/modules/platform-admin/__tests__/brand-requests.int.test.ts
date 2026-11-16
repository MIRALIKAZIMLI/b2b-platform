// F3.2a entegrasyon (US-029 AC2, R37, V5, K1, K2, K5): toptancının marka talebi, admin onayı/reddi,
// bildirim olayları, ad tekliği ve günlük sınır. Uçlar HTTP üzerinden; olaylar outbox_events'ten.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsSuperuser } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  addMember,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
} from './buyer-fixtures';
import { AdminHttp, platformUser } from './fixtures';

interface BrandRequestJson {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

interface AdminBrandJson extends BrandRequestJson {
  readonly requestedBy: { businessId: string; legalName: string | null } | null;
}

function brandName(prefix = 'Talep'): string {
  return `${prefix} ${randomUUID().slice(0, 12)}`;
}

describe('F3.2a marka talebi (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: AdminHttp;
  let content: Record<string, string>;
  let regionId: string;
  const businessIds: string[] = [];

  async function tenantHeaders(userId: string, businessId: string) {
    return { ...(await h.bearer(userId)), 'X-Business-Id': businessId };
  }

  async function request(userId: string, businessId: string, name: string) {
    return await h
      .http()
      .post('/api/v1/catalog/brands')
      .set(await tenantHeaders(userId, businessId))
      .send({ name });
  }

  async function seller() {
    const created = await newSeller(regionId);
    businessIds.push(created.businessId);
    return created;
  }

  async function decidedEvents(brandId: string) {
    return await platformRows<{ payload: Record<string, unknown> }>(
      `select payload from outbox_events where type = 'brand.request_decided'
          and payload->>'brandId' = $1 order by payload->>'userId'`,
      [brandId],
    );
  }

  beforeAll(async () => {
    await runSeeds();
    regionId = await newRegion('F3.2a marka');
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new AdminHttp(app);
    content = await h.bearer(await platformUser('content'));
  });

  afterAll(async () => {
    const client = await connectAsSuperuser();
    try {
      await client.query('delete from brands where requested_by_business_id = any($1)', [
        businessIds,
      ]);
    } finally {
      await client.end();
    }
    await redis.cleanup();
    await app.close();
  });

  it('F3.2a-AC2 toptancı talep gönderir; talep admin kuyruğuna düşer, yalnız talep eden görür', async () => {
    const a = await seller();
    const manager = await addMember(a.businessId, 'seller_sales_manager');
    const name = brandName();
    const created = await request(manager.userId, a.businessId, `  ${name} `);
    expect(created.status).toBe(201);
    const brand = created.body as BrandRequestJson;
    expect(brand).toMatchObject({ name, status: 'requested', isActive: true, decidedAt: null });

    const own = await h
      .http()
      .get('/api/v1/catalog/brand-requests')
      .set(await tenantHeaders(a.admin.userId, a.businessId));
    expect(own.status).toBe(200);
    expect((own.body as BrandRequestJson[]).map((item) => item.id)).toContain(brand.id);

    // Onaylanmadan ürün formu listesinde yok (talep edene de, başkasına da; V5).
    const options = await h
      .http()
      .get('/api/v1/catalog/brands')
      .query({ q: name })
      .set(await h.bearer(manager.userId));
    expect(options.body).toEqual([]);

    const queue = await h
      .http()
      .get('/api/v1/admin/catalog/brands')
      .query({ status: 'requested', q: name })
      .set(content);
    expect(queue.status).toBe(200);
    const queued = queue.body as AdminBrandJson[];
    expect(queued.map((item) => [item.id, item.status])).toEqual([[brand.id, 'requested']]);
    expect(queued[0]?.requestedBy?.businessId).toBe(a.businessId);
    expect(typeof queued[0]?.requestedBy?.legalName).toBe('string');

    const audit = await platformRows<{ action: string; business_id: string; actor_type: string }>(
      `select action, business_id, actor_type from audit_logs where target_id = $1`,
      [brand.id],
    );
    expect(audit).toEqual([
      { action: 'brand.requested', business_id: a.businessId, actor_type: 'user' },
    ]);
  });

  it('F3.2a-AC2 admin onaylar: marka herkese görünür; talep eden ve adminlere bildirim olayı (K5)', async () => {
    const a = await seller();
    const manager = await addMember(a.businessId, 'seller_sales_manager');
    const name = brandName('Onay');
    const brand = (await request(manager.userId, a.businessId, name)).body as BrandRequestJson;

    const approved = await h
      .http()
      .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
      .set(content)
      .send({ status: 'active' });
    expect(approved.status).toBe(200);
    expect((approved.body as AdminBrandJson).status).toBe('active');
    expect(typeof (approved.body as AdminBrandJson).decidedAt).toBe('string');

    const other = await seller();
    const options = await h
      .http()
      .get('/api/v1/catalog/brands')
      .query({ q: name })
      .set(await h.bearer(other.admin.userId));
    expect(options.body).toEqual([{ id: brand.id, name }]);

    const events = (await decidedEvents(brand.id)).map((row) => row.payload);
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        {
          brandId: brand.id,
          businessId: a.businessId,
          userId: manager.userId,
          decision: 'approved',
        },
        {
          brandId: brand.id,
          businessId: a.businessId,
          userId: a.admin.userId,
          decision: 'approved',
        },
      ]),
    );

    // Son durum: ikinci karar 409 (state-machines §13).
    const again = await h
      .http()
      .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
      .set(content)
      .send({ status: 'rejected' });
    expect(again.status).toBe(409);
  });

  it('F3.2a-AC2 admin reddeder: bildirim; ayrılan üye alıcı olmaz; reddedilen ad yeniden talep edilebilir (K1)', async () => {
    const a = await seller();
    const manager = await addMember(a.businessId, 'seller_sales_manager');
    const name = brandName('Red');
    const brand = (await request(manager.userId, a.businessId, name)).body as BrandRequestJson;
    await platformRows(`update memberships set status = 'removed' where id = $1`, [
      manager.membershipId,
    ]);

    const rejected = await h
      .http()
      .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
      .set(content)
      .send({ status: 'rejected' });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'rejected' });
    expect((await decidedEvents(brand.id)).map((row) => row.payload)).toEqual([
      { brandId: brand.id, businessId: a.businessId, userId: a.admin.userId, decision: 'rejected' },
    ]);

    const own = await h
      .http()
      .get('/api/v1/catalog/brand-requests')
      .set(await tenantHeaders(a.admin.userId, a.businessId));
    expect(own.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: brand.id, status: 'rejected' })]),
    );

    const retry = await request(a.admin.userId, a.businessId, name.toUpperCase());
    expect(retry.status).toBe(201);
  });

  it('F3.2a-AC2 ad tekliği: aktif marka veya başka toptancının bekleyen talebiyle aynı ad 422 taken', async () => {
    const a = await seller();
    const b = await seller();
    const pending = brandName('Bekleyen');
    expect((await request(a.admin.userId, a.businessId, pending)).status).toBe(201);
    const clash = await request(b.admin.userId, b.businessId, pending.toLowerCase());
    expect(clash.status).toBe(422);
    expect(clash.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { name: ['taken'] } });

    const active = brandName('Aktif');
    const adminBrand = (
      await h.http().post('/api/v1/admin/catalog/brands').set(content).send({ name: active })
    ).body as AdminBrandJson;
    const clashActive = await request(b.admin.userId, b.businessId, ` ${active} `);
    expect(clashActive.status).toBe(422);
    const client = await connectAsSuperuser();
    try {
      await client.query('delete from brands where id = $1', [adminBrand.id]);
    } finally {
      await client.end();
    }
  });

  it('F3.2a-AC5 perakendeci ve catalog.manage izni olmayan toptancı üyesi talep gönderemez (403)', async () => {
    const buyer = await newBuyer(regionId);
    const asBuyer = await request(buyer.admin.userId, buyer.businessId, brandName());
    expect(asBuyer.status).toBe(403);
    const a = await seller();
    const accountant = await addMember(a.businessId, 'seller_accountant');
    const asAccountant = await request(accountant.userId, a.businessId, brandName());
    expect(asAccountant.status).toBe(403);
  });

  it('F3.2a-AC5 günlük sınır: kayan 24 saatte 10 talepten sonra 429 RATE_LIMITED (K2)', async () => {
    const a = await seller();
    for (let index = 0; index < 10; index++) {
      expect((await request(a.admin.userId, a.businessId, brandName('Sınır'))).status).toBe(201);
    }
    const over = await request(a.admin.userId, a.businessId, brandName('Sınır'));
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ code: 'RATE_LIMITED' });
    // Pencere kayar: 24 saatten eski talepler sayılmaz.
    await platformRows(
      `update brands set created_at = created_at - interval '25 hours'
        where requested_by_business_id = $1`,
      [a.businessId],
    );
    expect((await request(a.admin.userId, a.businessId, brandName('Sınır'))).status).toBe(201);
  });
});
