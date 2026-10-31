// F2.1a entegrasyon (access modülünün kabul ucu, admin açılışıyla uçtan uca): davet kabulü (US-009 AC2) ve `invitation_accept` SECURITY DEFINER fonksiyonu
// (R16, R17): proconfig, PUBLIC izni, eşzamanlı iki kabul. Gerçek PostgreSQL, app_user bağlantısı.
import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser, connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  AdminHttp,
  platformQuery,
  platformUser,
  runSeeds,
  sellerBody,
  userWithPhone,
} from './fixtures';

/** access/invitation-token.ts ile aynı özet (SHA-256 hex); modül iç dosyası içe aktarılmaz. */
function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

describe('F2.1a davet kabulü (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: AdminHttp;
  let admin: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    api = new AdminHttp(app);
    admin = await platformUser('super_admin');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function openSeller() {
    const body = await sellerBody();
    const response = await api
      .http()
      .post('/api/v1/admin/sellers')
      .set(await api.bearer(admin))
      .send(body);
    expect(response.status).toBe(201);
    const { businessId } = response.body as { businessId: string };
    const token = await api.lastActivationToken(body.ownerPhone);
    const owner = await platformQuery<{ id: string }>(sql`
      select id from users where phone_e164 = ${body.ownerPhone}`);
    return { businessId, token, phone: body.ownerPhone, ownerId: owner[0]?.id ?? '' };
  }

  it('F2.1a-AC2 davetteki telefonla OTP girişi yapan kullanıcı kabul eder; /me işletmeyi seller olarak döner', async () => {
    const seller = await openSeller();
    const accessToken = await api.loginWithOtp(seller.phone);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const accepted = await api
      .http()
      .post('/api/v1/team/invitations/accept')
      .set(auth)
      .send({ token: seller.token });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ businessId: seller.businessId });

    const me = await api.http().get('/api/v1/me').set(auth).set('X-Business-Id', seller.businessId);
    expect(me.status).toBe(200);
    const json = me.body as {
      memberships: { businessId: string; capability: string }[];
      activeBusiness: { id: string; capability: string; permissions: { code: string }[] };
    };
    expect(json.memberships).toEqual([
      expect.objectContaining({ businessId: seller.businessId, capability: 'seller' }),
    ]);
    expect(json.activeBusiness).toMatchObject({ id: seller.businessId, capability: 'seller' });
    expect(json.activeBusiness.permissions.map((p) => p.code)).toContain('team.manage');

    const memberships = await platformQuery(sql`
      select m.status, r.is_business_admin, i.accepted_at is not null as accepted
        from memberships m
        join roles r on r.id = m.role_id
        join invitations i on i.business_id = m.business_id
       where m.business_id = ${seller.businessId}`);
    expect(memberships).toEqual([{ status: 'active', is_business_admin: true, accepted: true }]);
  });

  it('F2.1a-AC2 gövdesiz istek 422, JWT olmadan 401', async () => {
    const user = await userWithPhone();
    const noBody = await api
      .http()
      .post('/api/v1/team/invitations/accept')
      .set(await api.bearer(user.id))
      .send({});
    expect(noBody.status).toBe(422);
    const anonymous = await api.http().post('/api/v1/team/invitations/accept').send({ token: 'x' });
    expect(anonymous.status).toBe(401);
  });

  it('F2.1a-AC8 invitation_accept: proconfig search_path sırası, PUBLIC EXECUTE yok, app_user EXECUTE var, sahibi migrator', async () => {
    const client = await connectAsMigrator();
    try {
      const fn = await client.query<{
        proconfig: string[];
        prosecdef: boolean;
        owner: string;
        public_exec: boolean;
        app_exec: boolean;
      }>(`
        select p.proconfig, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
               has_function_privilege('public', p.oid, 'EXECUTE') as public_exec,
               has_function_privilege('app_user', p.oid, 'EXECUTE') as app_exec
          from pg_proc p where p.proname = 'invitation_accept'`);
      expect(fn.rows).toEqual([
        {
          proconfig: ['search_path=pg_catalog, public, pg_temp'],
          prosecdef: true,
          owner: 'migrator',
          public_exec: false,
          app_exec: true,
        },
      ]);
      const acl = await client.query<{ acl: string }>(
        `select proacl::text as acl from pg_proc where proname = 'invitation_accept'`,
      );
      // PUBLIC hakkı "=X/" biçiminde görünürdü.
      expect(acl.rows[0]?.acl ?? '').not.toMatch(/(^|[{,])=X/);
    } finally {
      await client.end();
    }
  });

  it('F2.1a-AC8 kullanıcı bağlamı yoksa 42501', async () => {
    const client = await connectAsAppUser();
    try {
      await expect(
        client.query(`select * from invitation_accept('x', gen_random_uuid(), now())`),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.end();
    }
  });

  it('F2.1a-AC8 iki eşzamanlı kabul → tek üyelik (FOR UPDATE)', async () => {
    const seller = await openSeller();
    const hash = hashInvitationToken(seller.token);
    const first = await connectAsAppUser();
    const second = await connectAsAppUser();
    const call = `select * from invitation_accept($1, gen_random_uuid(), now())`;
    try {
      for (const client of [first, second]) {
        await client.query('begin');
        await client.query(`select set_config('app.user_id', $1, true)`, [seller.ownerId]);
      }
      const a = await first.query(call, [hash]);
      expect(a.rows).toHaveLength(1);
      // İkinci kabul ilk işlemin kilidini bekler; ilk commit'ten sonra kabul edilmiş satırı görür.
      const pending = second.query(call, [hash]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await first.query('commit');
      const b = await pending;
      await second.query('commit');
      expect(b.rows).toHaveLength(0);
    } finally {
      await first.end();
      await second.end();
    }
    const memberships = await platformQuery(sql`
      select count(*)::int as n from memberships where business_id = ${seller.businessId}`);
    expect(memberships).toEqual([{ n: 1 }]);
  });

  it('F2.1a-AC8 app_user davet tablosunu bağlamsız göremez (T kuralı değişmedi)', async () => {
    const seller = await openSeller();
    const client = await connectAsAppUser();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.user_id', $1, true)`, [seller.ownerId]);
      const rows = await client.query(`select id from invitations where business_id = $1`, [
        seller.businessId,
      ]);
      expect(rows.rows).toHaveLength(0);
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });
});
