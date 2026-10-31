// F2.2 entegrasyon: kimliksiz toptancı başvurusu (US-008 AC1, AC3), IP hız sınırı, admin başvuru
// listesi, ret ve başvurudan toptancı açma (state-machines §12). Bağlantı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { queryAsOwner } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { Clock, FixedClock } from '../../../core/clock';
import { withSystemTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  AdminHttp,
  auditRows,
  platformQuery,
  platformUser,
  randomVoen,
  runSeeds,
  sellerBody,
  testRefs,
} from './fixtures';

interface ApplicationJson {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string;
  readonly contactName: string;
  readonly phone: string;
  readonly regionId: string;
  readonly categoryNote: string | null;
  readonly status: string;
  readonly businessId: string | null;
  readonly createdAt: string;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

const HOUR_MS = 60 * 60 * 1000;

describe('F2.2 toptancı başvurusu (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: AdminHttp;
  let admin: string;
  const clock = new FixedClock(new Date('2026-11-03T08:00:00.000Z'));

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: REDIS_CLIENT, useValue: redis.client },
      ],
    });
    api = new AdminHttp(app);
    admin = await platformUser('operations');
  });

  afterEach(() => {
    // IP hız sınırı penceresi (1 saat) testleri etkilemesin.
    clock.advance(2 * HOUR_MS);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function applicationBody(overrides: Record<string, unknown> = {}) {
    const refs = await testRefs();
    return {
      legalName: 'Başvuru Topdan MMC',
      voen: randomVoen(),
      contactName: 'Vüsal Həsənov',
      phone: randomTestPhone(),
      regionId: refs.cityId,
      categoryNote: 'Ərzaq, içkilər',
      ...overrides,
    };
  }

  async function submit(body: object) {
    return await api.http().post('/api/v1/seller-applications').send(body);
  }

  async function list(query: Record<string, string> = {}, userId = admin) {
    return await api
      .http()
      .get('/api/v1/admin/seller-applications')
      .query(query)
      .set(await api.bearer(userId));
  }

  async function reject(id: string, userId = admin) {
    return await api
      .http()
      .post(`/api/v1/admin/seller-applications/${id}/reject`)
      .set(await api.bearer(userId));
  }

  async function createSeller(body: object) {
    return await api
      .http()
      .post('/api/v1/admin/sellers')
      .set(await api.bearer(admin))
      .send(body);
  }

  async function submitted(overrides: Record<string, unknown> = {}) {
    const body = await applicationBody(overrides);
    const response = await submit(body);
    expect(response.status).toBe(201);
    return { body, id: (response.body as { id: string }).id };
  }

  async function applicationRow(id: string) {
    const [row] = await platformQuery<Record<string, unknown>>(sql`
      select status, reviewed_by, business_id from seller_applications where id = ${id}`);
    return row;
  }

  it('US-008-AC1 ziyaretçi formu gönderir → başvuru pending kaydedilir ve admin listesinde görünür', async () => {
    const { body, id } = await submitted();

    const response = await list();
    expect(response.status).toBe(200);
    const items = (response.body as { items: ApplicationJson[] }).items;
    const found = items.find((item) => item.id === id);
    expect(found).toEqual({
      id,
      legalName: body.legalName,
      voen: body.voen,
      contactName: body.contactName,
      phone: body.phone,
      regionId: body.regionId,
      categoryNote: body.categoryNote,
      status: 'pending',
      businessId: null,
      createdAt: clock.now().toISOString(),
    });
  });

  it('US-008-AC1 yanıt yalnızca kimlik ve durum döner; kategori notu isteğe bağlı', async () => {
    const withoutNote: Record<string, unknown> = { ...(await applicationBody()) };
    delete withoutNote.categoryNote;
    const response = await submit(withoutNote);
    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(['id', 'status']);
    expect((response.body as { status: string }).status).toBe('pending');
  });

  it('US-008-AC3 aynı VÖEN ile açık başvuru varken ikinci başvuru → 409 SELLER_APPLICATION_ALREADY_PENDING', async () => {
    const { body } = await submitted();
    const second = await submit({ ...(await applicationBody()), voen: body.voen });
    expect(second.status).toBe(409);
    expect((second.body as ErrorJson).code).toBe('SELLER_APPLICATION_ALREADY_PENDING');
    const rows = await platformQuery<{ n: number }>(
      sql`select count(*)::int as n from seller_applications where voen = ${body.voen}`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('US-008-AC3 reddedilen başvurudan sonra aynı VÖEN ile yeniden başvurulabilir', async () => {
    const { body, id } = await submitted();
    expect((await reject(id)).status).toBe(200);
    clock.advance(2 * HOUR_MS);
    const again = await submit({ ...(await applicationBody()), voen: body.voen });
    expect(again.status).toBe(201);
  });

  it('F2.2 eşzamanlı aynı VÖEN → yalnızca biri kaydedilir, diğeri 409', async () => {
    const body = await applicationBody();
    const responses = await Promise.all([
      submit(body),
      submit({ ...body, phone: randomTestPhone() }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('F2.2 doğrulama: geçersiz VÖEN, telefon, bilinmeyen bölge, fazla alan → 422', async () => {
    const invalidVoen = await submit(await applicationBody({ voen: '1234567893' }));
    expect(invalidVoen.status).toBe(422);
    const invalidPhone = await submit(await applicationBody({ phone: '+99412' }));
    expect(invalidPhone.status).toBe(422);
    expect((invalidPhone.body as ErrorJson).details).toHaveProperty('phone');
    const unknownRegion = await submit(await applicationBody({ regionId: randomUUID() }));
    expect(unknownRegion.status).toBe(422);
    expect((unknownRegion.body as ErrorJson).details).toEqual({ regionId: ['not_found'] });
    const extra = await submit({ ...(await applicationBody()), status: 'approved' });
    expect(extra.status).toBe(422);
    const longNote = await submit(await applicationBody({ categoryNote: 'x'.repeat(501) }));
    expect(longNote.status).toBe(422);
  });

  it('F2.2 IP hız sınırı: saatte 5 başvurudan sonra 429 RATE_LIMITED + Retry-After; pencere geçince açılır', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await submit(await applicationBody())).status).toBe(201);
    }
    const limited = await submit(await applicationBody());
    expect(limited.status).toBe(429);
    expect((limited.body as ErrorJson).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    clock.advance(HOUR_MS + 1000);
    expect((await submit(await applicationBody())).status).toBe(201);
    // Anahtarda IP düz yazılmaz.
    const keys = await redis.keys();
    expect(keys.some((key) => key.startsWith('seller_app:req:ip:'))).toBe(true);
    expect(keys.some((key) => key.includes('127.0.0.1') || key.includes('::1'))).toBe(false);
  });

  it('F2.2 RLS: platform dışı bağlam başvuruyu okuyamaz ve doğrudan ekleyemez/güncelleyemez', async () => {
    const { id } = await submitted();
    const seen = await withSystemTx((tx) =>
      tx.execute(sql`select id from seller_applications where id = ${id}`),
    );
    expect(seen.rows).toEqual([]);

    const client = await connectAsAppUser();
    try {
      await expect(
        client.query(
          `insert into seller_applications (id, legal_name, voen, contact_name, phone_e164, region_id)
           values ($1, 'X', $2, 'Y', '+994501234567', $3)`,
          [randomUUID(), randomVoen(), (await testRefs()).cityId],
        ),
      ).rejects.toThrow();
      const updated = await client.query(
        `update seller_applications set status = 'rejected' where id = $1`,
        [id],
      );
      expect(updated.rowCount).toBe(0);
    } finally {
      await client.end();
    }
    expect((await applicationRow(id))?.status).toBe('pending');
  });

  it('F2.2 bekçi: elle yazılan politikalar ve rolleri (T6)', async () => {
    const rows = await queryAsOwner<{ name: string; cmd: string; roles: string }>(
      `select p.polname as name, p.polcmd::text as cmd,
              (select string_agg(case when r = 0 then 'public' else pg_get_userbyid(r)::text end, ',')
                 from unnest(p.polroles) r) as roles
         from pg_policy p
        where p.polrelid = 'seller_applications'::regclass
        order by p.polname`,
    );
    expect(rows).toEqual([
      { name: 'seller_applications_definer_insert', cmd: 'a', roles: 'migrator' },
      { name: 'seller_applications_platform_select', cmd: 'r', roles: 'public' },
      { name: 'seller_applications_platform_update', cmd: 'w', roles: 'public' },
    ]);
  });

  it('F2.2 admin listesi: durum filtresi ve imleçle sayfalama (yeniden eskiye)', async () => {
    const first = await submitted();
    clock.advance(1000);
    const second = await submitted();

    const page1 = await list({ limit: '1' });
    const json1 = page1.body as { items: ApplicationJson[]; nextCursor: string | null };
    expect(json1.items.map((item) => item.id)).toEqual([second.id]);
    expect(json1.nextCursor).toBe(second.id);
    const page2 = await list({ limit: '1', cursor: json1.nextCursor ?? '' });
    expect((page2.body as { items: ApplicationJson[] }).items[0]?.id).toBe(first.id);

    expect((await reject(first.id)).status).toBe(200);
    const rejected = await list({ status: 'rejected' });
    const rejectedIds = (rejected.body as { items: ApplicationJson[] }).items.map((i) => i.id);
    expect(rejectedIds).toContain(first.id);
    const pending = await list();
    const pendingIds = (pending.body as { items: ApplicationJson[] }).items.map((i) => i.id);
    expect(pendingIds).not.toContain(first.id);

    expect((await list({ status: 'unknown' })).status).toBe(422);
  });

  it('F2.2 yetki: support rolü ve platform rolü olmayan kullanıcı listeleyemez ve reddedemez (403)', async () => {
    const { id } = await submitted();
    for (const role of ['support', null] as const) {
      const user = await platformUser(role);
      expect((await list({}, user)).status).toBe(403);
      expect((await reject(id, user)).status).toBe(403);
    }
    const anonymous = await api.http().get('/api/v1/admin/seller-applications');
    expect(anonymous.status).toBe(401);
    expect((await applicationRow(id))?.status).toBe('pending');
  });

  it('F2.2 ret: pending → rejected, reviewed_by ve audit; ikinci ret 409, olmayan başvuru 404', async () => {
    const { id } = await submitted();
    const response = await reject(id);
    expect(response.status).toBe(200);
    expect((response.body as ApplicationJson).status).toBe('rejected');
    expect(await applicationRow(id)).toEqual({
      status: 'rejected',
      reviewed_by: admin,
      business_id: null,
    });
    const audits = await auditRows(id);
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'seller_application.rejected',
        actor_type: 'platform',
        before: { status: 'pending' },
      }),
    ]);
    // Kişisel veri audit'e yazılmaz.
    expect(JSON.stringify(audits)).not.toContain('Vüsal');

    const again = await reject(id);
    expect(again.status).toBe(409);
    expect((again.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');
    expect((await reject(randomUUID())).status).toBe(404);
  });

  it('F2.2 başvurudan toptancı açma: başvuru approved olur, işletmeye bağlanır, audit yazılır', async () => {
    const { body, id } = await submitted();
    const seller = await sellerBody({
      legalName: body.legalName,
      voen: body.voen,
      ownerPhone: body.phone,
      ownerName: body.contactName,
      applicationId: id,
    });
    const response = await createSeller(seller);
    expect(response.status).toBe(201);
    const businessId = (response.body as { businessId: string }).businessId;

    expect(await applicationRow(id)).toEqual({
      status: 'approved',
      reviewed_by: admin,
      business_id: businessId,
    });
    expect((await auditRows(id)).map((row) => row.action)).toEqual(['seller_application.approved']);
    const created = await auditRows(businessId);
    expect(created[0]?.after).toMatchObject({ applicationId: id });

    // Onaylanmış başvurudan ikinci açılış ve ret 409.
    const twice = await createSeller(await sellerBody({ applicationId: id }));
    expect(twice.status).toBe(409);
    expect((twice.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');
    expect((await reject(id)).status).toBe(409);
  });

  it('F2.2 başvurudan açma: olmayan başvuru 404, reddedilmiş başvuru 409; hiçbir işletme açılmaz', async () => {
    const missing = await sellerBody({ applicationId: randomUUID() });
    expect((await createSeller(missing)).status).toBe(404);

    const { id } = await submitted();
    await reject(id);
    const fromRejected = await sellerBody({ applicationId: id });
    expect((await createSeller(fromRejected)).status).toBe(409);

    const rows = await platformQuery<{ n: number }>(sql`
      select count(*)::int as n from businesses where voen in (${missing.voen}, ${fromRejected.voen})`);
    expect(rows[0]?.n).toBe(0);
  });

  it('F2.2 başvurudan açma tek işlem: VÖEN başka işletmede kayıtlıysa 409 ve başvuru pending kalır', async () => {
    const existing = await sellerBody();
    expect((await createSeller(existing)).status).toBe(201);
    const { id } = await submitted({ voen: existing.voen });

    const response = await createSeller(
      await sellerBody({ voen: existing.voen, applicationId: id }),
    );
    expect(response.status).toBe(409);
    expect((response.body as ErrorJson).code).toBe('VOEN_ALREADY_REGISTERED');
    expect(await applicationRow(id)).toEqual({
      status: 'pending',
      reviewed_by: null,
      business_id: null,
    });
  });
});
