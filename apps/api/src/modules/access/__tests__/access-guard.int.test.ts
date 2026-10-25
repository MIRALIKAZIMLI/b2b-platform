// F1.8b entegrasyon: global AccessGuard + TenantContext + izin önbelleği + /me. Gerçek iş uç noktası
// olmadığı için yalnızca bu testte kayıtlı controller kullanılır (kart, emin olunmayan nokta 1).
// Bağlantı RLS'e tabi app_user'dır; Redis gerçek (rastgele önekli test istemcisi).
import { randomBytes, randomUUID } from 'node:crypto';
import { Controller, Get, Param } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUsers } from '../../../../test/users';
import {
  Authenticated,
  Public,
  RequirePermission,
  RequirePlatformRole,
} from '../../../core/auth/access-decorators';
import { withPlatformTx, withTenantTx } from '../../../core/db';
import { DomainError } from '../../../core/errors/domain-error';
import { CurrentTenant, type TenantContext } from '../../../core/tenant-context';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { SettingsService } from '../../settings';
import { MembershipService } from '../membership.service';
import { permissionCacheKey } from '../permission.cache';
import { RoleService } from '../role.service';
import { addMember, grantCapability, newBusiness, runAccessSeed, templateRefs } from './fixtures';

@Controller('api/v1/test-f18')
class GuardProbeController {
  @Get('orders')
  @RequirePermission('orders.view')
  orders(@CurrentTenant() tenant: TenantContext) {
    return { businessId: tenant.businessId, membershipId: tenant.membershipId };
  }

  @Get('catalog-manage')
  @RequirePermission('catalog.manage')
  catalogManage() {
    return { ok: true };
  }

  @Get('cart')
  @RequirePermission('cart.edit')
  cart() {
    return { ok: true };
  }

  /** US-003 AC3: başka kiracının kaydı RLS ile görünmez → 404. */
  @Get('roles/:id')
  @RequirePermission('team.manage')
  async role(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    const rows = await withTenantTx(tenant, (tx) =>
      tx.execute<{ id: string }>(sql`select id from roles where id = ${id}`),
    );
    if (rows.rows[0] === undefined) throw new DomainError('NOT_FOUND');
    return { id };
  }

  @Get('platform')
  @RequirePlatformRole('super_admin')
  platform() {
    return { ok: true };
  }

  @Get('authenticated')
  @Authenticated()
  authenticated() {
    return { ok: true };
  }

  @Get('public')
  @Public()
  open() {
    return { ok: true };
  }

  // Varsayılan reddet testi için bilerek işaretsiz (Mimar). Lint kuralı bunu yakalar.
  // eslint-disable-next-line b2b/require-endpoint-access
  @Get('unmarked')
  unmarked() {
    return { ok: true };
  }
}

interface ErrorJson {
  readonly code: string;
}

describe('F1.8b AccessGuard ve TenantContext (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let tokens: TokenService;
  let roles: RoleService;
  let memberships: MembershipService;

  beforeAll(async () => {
    await runAccessSeed();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      controllers: [GuardProbeController],
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    tokens = app.get(TokenService);
    roles = app.get(RoleService);
    memberships = app.get(MembershipService);
  });

  afterAll(async () => {
    const keys = await redis.keys();
    if (keys.length > 0) await redis.client.del(...keys);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function bearer(userId: string) {
    const signed = await tokens.signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}` };
  }

  /** Toptancı işletmesi: admin (kullanıcı = tenant.userId) ve satış temsilcisi rolleri. */
  async function seller() {
    const tenant = await newBusiness('seller');
    const admin = await templateRefs('seller_business_admin');
    const rep = await templateRefs('seller_sales_rep');
    const adminRoleId = await roles.createFromTemplate(tenant, admin.templateId);
    const repRoleId = await roles.createFromTemplate(tenant, rep.templateId);
    const owner = await addMember(tenant, adminRoleId, admin.jobTitleId, tenant.userId);
    return { tenant, adminRoleId, repRoleId, admin, rep, owner };
  }

  async function setBusinessStatus(businessId: string, status: string) {
    const actor = randomUUID();
    await insertTestUsers(actor);
    await withPlatformTx({ userId: actor }, (tx) =>
      tx.execute(sql`update businesses set status = ${status} where id = ${businessId}`),
    );
  }

  async function asMigrator(
    statements: (q: (t: string, p?: unknown[]) => Promise<unknown>) => Promise<void>,
  ) {
    const client = await connectAsMigrator();
    try {
      await client.query('begin');
      await client.query("select set_config('app.is_platform', 'true', true)");
      await statements((t, p) => client.query(t, p));
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      await client.end();
    }
  }

  describe('işaretler', () => {
    it('F1.8-AC2: @Public uç JWT olmadan çalışır', async () => {
      const response = await http().get('/api/v1/test-f18/public');
      expect(response.status).toBe(200);
    });

    it('F1.8-AC2: işaretli uçlar JWT olmadan 401', async () => {
      for (const path of ['orders', 'authenticated', 'platform', 'unmarked']) {
        const response = await http().get(`/api/v1/test-f18/${path}`);
        expect(response.status, path).toBe(401);
      }
    });

    it('F1.8-AC2: varsayılan reddet — işaretsiz uç geçerli anahtarla bile 403', async () => {
      const { tenant } = await seller();
      const response = await http()
        .get('/api/v1/test-f18/unmarked')
        .set(await bearer(tenant.userId))
        .set('X-Business-Id', tenant.businessId);
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    });

    it('F1.8-AC2: @Authenticated yalnız giriş ister', async () => {
      const userId = randomUUID();
      await insertTestUsers(userId);
      const response = await http()
        .get('/api/v1/test-f18/authenticated')
        .set(await bearer(userId));
      expect(response.status).toBe(200);
    });

    it('F1.8-AC2: @RequirePlatformRole — rolü olmayan 403, süper admin 200', async () => {
      const userId = randomUUID();
      await insertTestUsers(userId);
      const denied = await http()
        .get('/api/v1/test-f18/platform')
        .set(await bearer(userId));
      expect(denied.status).toBe(403);
      await asMigrator(async (q) => {
        await q(`insert into platform_staff (user_id, role) values ($1, 'super_admin')`, [userId]);
      });
      const allowed = await http()
        .get('/api/v1/test-f18/platform')
        .set(await bearer(userId));
      expect(allowed.status).toBe(200);
    });
  });

  describe('kiracı bağlamı', () => {
    it('F1.8-AC1: üyelik dışı X-Business-Id → 403 PERMISSION_DENIED', async () => {
      const a = await seller();
      const b = await seller();
      const response = await http()
        .get('/api/v1/test-f18/orders')
        .set(await bearer(a.tenant.userId))
        .set('X-Business-Id', b.tenant.businessId);
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    });

    it('F1.8-AC1: X-Business-Id yok veya uuid değil → 422 VALIDATION_FAILED', async () => {
      const { tenant } = await seller();
      const auth = await bearer(tenant.userId);
      const missing = await http().get('/api/v1/test-f18/orders').set(auth);
      expect(missing.status).toBe(422);
      expect((missing.body as ErrorJson).code).toBe('VALIDATION_FAILED');
      const bad = await http().get('/api/v1/test-f18/orders').set(auth).set('X-Business-Id', 'x');
      expect(bad.status).toBe(422);
    });

    it('F1.8-AC1: üye → 200 ve bağlam doğru işletme', async () => {
      const { tenant, owner } = await seller();
      const response = await http()
        .get('/api/v1/test-f18/orders')
        .set(await bearer(tenant.userId))
        .set('X-Business-Id', tenant.businessId);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        businessId: tenant.businessId,
        membershipId: owner.membershipId,
      });
    });

    it('F1.8-AC2: izinsiz uç → 403 PERMISSION_DENIED (US-013 AC5 API)', async () => {
      const { tenant, repRoleId, rep } = await seller();
      const member = await addMember(tenant, repRoleId, rep.jobTitleId);
      const response = await http()
        .get('/api/v1/test-f18/catalog-manage')
        .set(await bearer(member.userId))
        .set('X-Business-Id', tenant.businessId);
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    });

    it('F1.8-AC3: yanlış yetenek → 403 CAPABILITY_REQUIRED', async () => {
      const { tenant } = await seller();
      const response = await http()
        .get('/api/v1/test-f18/cart')
        .set(await bearer(tenant.userId))
        .set('X-Business-Id', tenant.businessId);
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('CAPABILITY_REQUIRED');
    });

    it('F1.8-AC3: yeteneği onaylı değilse (askıda) any izin de CAPABILITY_REQUIRED', async () => {
      const { tenant } = await seller();
      await grantCapability(tenant.businessId, 'seller', 'suspended');
      const response = await http()
        .get('/api/v1/test-f18/orders')
        .set(await bearer(tenant.userId))
        .set('X-Business-Id', tenant.businessId);
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('CAPABILITY_REQUIRED');
    });

    it('F1.8b: askıdaki veya arşivli işletme → 403 BUSINESS_SUSPENDED; dormant geçer', async () => {
      const { tenant } = await seller();
      const call = async () =>
        http()
          .get('/api/v1/test-f18/orders')
          .set(await bearer(tenant.userId))
          .set('X-Business-Id', tenant.businessId);
      for (const status of ['suspended', 'archived']) {
        await setBusinessStatus(tenant.businessId, status);
        const response = await call();
        expect(response.status, status).toBe(403);
        expect((response.body as ErrorJson).code).toBe('BUSINESS_SUSPENDED');
      }
      await setBusinessStatus(tenant.businessId, 'dormant');
      expect((await call()).status).toBe(200);
    });

    it('US-004 AC3: işletmeden çıkarılan kullanıcının istekleri anında 403 (önbellek dolu olsa da)', async () => {
      const { tenant, repRoleId, rep } = await seller();
      const member = await addMember(tenant, repRoleId, rep.jobTitleId);
      const call = async () =>
        http()
          .get('/api/v1/test-f18/orders')
          .set(await bearer(member.userId))
          .set('X-Business-Id', tenant.businessId);
      expect((await call()).status).toBe(200);
      expect(await redis.client.get(permissionCacheKey(member.membershipId))).not.toBeNull();

      await withTenantTx(tenant, (tx) =>
        tx.execute(
          sql`update memberships set status = 'removed' where id = ${member.membershipId}`,
        ),
      );
      const response = await call();
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    });

    it('US-003 AC3: A bağlamında B işletmesinin rol kimliği → 404', async () => {
      const a = await seller();
      const b = await seller();
      const auth = await bearer(a.tenant.userId);
      const own = await http()
        .get(`/api/v1/test-f18/roles/${a.repRoleId}`)
        .set(auth)
        .set('X-Business-Id', a.tenant.businessId);
      expect(own.status).toBe(200);
      const other = await http()
        .get(`/api/v1/test-f18/roles/${b.repRoleId}`)
        .set(auth)
        .set('X-Business-Id', a.tenant.businessId);
      expect(other.status).toBe(404);
      expect((other.body as ErrorJson).code).toBe('NOT_FOUND');
    });
  });

  describe('F1.8-AC5 izin önbelleği', () => {
    it('F1.8-AC5: rol değişikliği bir sonraki istekte geçerli; önbellek anahtarı silinir', async () => {
      const { tenant, repRoleId, rep } = await seller();
      const member = await addMember(tenant, repRoleId, rep.jobTitleId);
      const call = async () =>
        http()
          .get('/api/v1/test-f18/catalog-manage')
          .set(await bearer(member.userId))
          .set('X-Business-Id', tenant.businessId);
      expect((await call()).status).toBe(403);
      const key = permissionCacheKey(member.membershipId);
      expect(await redis.client.get(key)).not.toBeNull();

      const manager = await templateRefs('seller_sales_manager');
      const managerRoleId = await roles.createFromTemplate(tenant, manager.templateId);
      await memberships.changeRole(tenant, {
        membershipId: member.membershipId,
        roleId: managerRoleId,
      });
      expect(await redis.client.get(key)).toBeNull();
      expect((await call()).status).toBe(200);
    });

    it('F1.8-AC5: anahtar silinmese de (eski rol kayıtlı) yeni rol geçerli — rol kimliği doğrulaması', async () => {
      const { tenant, repRoleId, rep } = await seller();
      const member = await addMember(tenant, repRoleId, rep.jobTitleId);
      const key = permissionCacheKey(member.membershipId);
      const call = async () =>
        http()
          .get('/api/v1/test-f18/catalog-manage')
          .set(await bearer(member.userId))
          .set('X-Business-Id', tenant.businessId);
      expect((await call()).status).toBe(403);
      const stale = await redis.client.get(key);
      expect(stale).not.toBeNull();

      const manager = await templateRefs('seller_sales_manager');
      const managerRoleId = await roles.createFromTemplate(tenant, manager.templateId);
      await withTenantTx(tenant, (tx) =>
        tx.execute(
          sql`update memberships set role_id = ${managerRoleId} where id = ${member.membershipId}`,
        ),
      );
      await redis.client.set(key, stale ?? '', 'EX', 60);
      expect((await call()).status).toBe(200);
    });
  });

  describe('US-002 AC3 admin 2FA', () => {
    it('US-002 AC3: /me twoFactorRecommended — TOTP yoksa true, kuruluysa false', async () => {
      const { tenant } = await seller();
      const before = await http()
        .get('/api/v1/me')
        .set(await bearer(tenant.userId));
      expect(before.status).toBe(200);
      expect((before.body as { twoFactorRecommended: boolean }).twoFactorRecommended).toBe(true);

      await asMigrator(async (q) => {
        await q(
          `insert into user_totp (user_id, secret_encrypted, recovery_codes_hash, enabled_at)
           values ($1, $2, '[]'::jsonb, now())`,
          [tenant.userId, randomBytes(32)],
        );
      });
      const after = await http()
        .get('/api/v1/me')
        .set(await bearer(tenant.userId));
      expect((after.body as { twoFactorRecommended: boolean }).twoFactorRecommended).toBe(false);
    });

    it('US-002 AC3: security.require_admin_2fa açık + TOTP yok → admin TOTP_REQUIRED; üye etkilenmez', async () => {
      const { tenant, repRoleId, rep } = await seller();
      const member = await addMember(tenant, repRoleId, rep.jobTitleId);
      const actor = randomUUID();
      await insertTestUsers(actor);
      await app.get(SettingsService).set(
        'security.require_admin_2fa',
        true,
        { scope: 'business', businessId: tenant.businessId },
        {
          userId: actor,
        },
      );
      const admin = await http()
        .get('/api/v1/test-f18/orders')
        .set(await bearer(tenant.userId))
        .set('X-Business-Id', tenant.businessId);
      // TOTP_REQUIRED → 401 (http-map.ts, F1.6).
      expect(admin.status).toBe(401);
      expect((admin.body as ErrorJson).code).toBe('TOTP_REQUIRED');
      const staff = await http()
        .get('/api/v1/test-f18/orders')
        .set(await bearer(member.userId))
        .set('X-Business-Id', tenant.businessId);
      expect(staff.status).toBe(200);
    });
  });

  describe('/me', () => {
    it('F1.8b: /me üyelik listesi ve X-Business-Id ile activeBusiness.permissions', async () => {
      const { tenant, owner } = await seller();
      const auth = await bearer(tenant.userId);
      const plain = await http().get('/api/v1/me').set(auth);
      expect(plain.status).toBe(200);
      const body = plain.body as {
        memberships: {
          membershipId: string;
          businessId: string;
          businessStatus: string;
          capability: string;
          roleName: string;
        }[];
        activeBusiness?: unknown;
      };
      expect(body.memberships).toEqual([
        {
          membershipId: owner.membershipId,
          businessId: tenant.businessId,
          businessName: 'Test MMC',
          businessStatus: 'active',
          capability: 'seller',
          roleName: 'Biznes admini',
        },
      ]);
      expect(body.activeBusiness).toBeUndefined();

      const active = await http()
        .get('/api/v1/me')
        .set(auth)
        .set('X-Business-Id', tenant.businessId);
      expect(active.status).toBe(200);
      const activeBusiness = (
        active.body as {
          activeBusiness: {
            id: string;
            capability: string;
            permissions: { code: string; scope: string }[];
          };
        }
      ).activeBusiness;
      expect(activeBusiness.id).toBe(tenant.businessId);
      expect(activeBusiness.capability).toBe('seller');
      expect(activeBusiness.permissions).toContainEqual({ code: 'team.manage', scope: 'all' });
    });

    it('F1.8b: /me başka işletmenin X-Business-Id ile 403; askıdaki işletme listede status ile', async () => {
      const a = await seller();
      const b = await seller();
      const auth = await bearer(a.tenant.userId);
      const denied = await http()
        .get('/api/v1/me')
        .set(auth)
        .set('X-Business-Id', b.tenant.businessId);
      expect(denied.status).toBe(403);
      await setBusinessStatus(a.tenant.businessId, 'suspended');
      const listed = await http().get('/api/v1/me').set(auth);
      expect(
        (listed.body as { memberships: { businessStatus: string }[] }).memberships[0]
          ?.businessStatus,
      ).toBe('suspended');
    });

    it('F1.8b (Müfettiş M1): yetenek onaylı değilse /me activeBusiness.capability null, izinli uç CAPABILITY_REQUIRED', async () => {
      const { tenant } = await seller();
      const auth = await bearer(tenant.userId);
      for (const status of ['pending', 'suspended'] as const) {
        await grantCapability(tenant.businessId, 'seller', status);
        const me = await http().get('/api/v1/me').set(auth).set('X-Business-Id', tenant.businessId);
        expect(me.status, status).toBe(200);
        const active = (me.body as { activeBusiness: { id: string; capability: unknown } })
          .activeBusiness;
        expect(active.id).toBe(tenant.businessId);
        expect(active.capability, status).toBeNull();
        const orders = await http()
          .get('/api/v1/test-f18/orders')
          .set(auth)
          .set('X-Business-Id', tenant.businessId);
        expect((orders.body as ErrorJson).code, status).toBe('CAPABILITY_REQUIRED');
      }
      await grantCapability(tenant.businessId, 'seller', 'approved');
      const approved = await http()
        .get('/api/v1/me')
        .set(auth)
        .set('X-Business-Id', tenant.businessId);
      expect(
        (approved.body as { activeBusiness: { capability: unknown } }).activeBusiness.capability,
      ).toBe('seller');
    });
  });

  describe('Müfettiş PR #23 notları', () => {
    it('not 1: rol yeteneği işletmenin yeteneği değilse rol açılamaz (CAPABILITY_REQUIRED)', async () => {
      const tenant = await newBusiness('seller');
      const buyerTemplate = await templateRefs('buyer_branch_staff');
      await expect(
        roles.createFromTemplate(tenant, buyerTemplate.templateId),
      ).rejects.toMatchObject({
        code: 'CAPABILITY_REQUIRED',
      });
    });

    it('not 3: removed üyelikte rol değişikliği NOT_FOUND, audit yazılmaz', async () => {
      const { tenant, repRoleId, rep, adminRoleId } = await seller();
      const member = await addMember(tenant, repRoleId, rep.jobTitleId);
      await withTenantTx(tenant, (tx) =>
        tx.execute(
          sql`update memberships set status = 'removed' where id = ${member.membershipId}`,
        ),
      );
      await expect(
        memberships.changeRole(tenant, { membershipId: member.membershipId, roleId: adminRoleId }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
