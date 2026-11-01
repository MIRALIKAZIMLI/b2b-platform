// F2.7a (US-013): ekip daveti, kabul, rol/kapsam değişikliği, çıkarma, kullanıcı limiti.
// İşletmeler F2.6 fikstürüyle (onaylı yetenek, şablondan admin, abonelik); davet edilen kişi gerçek
// OTP girişiyle (dev SMS kutusu) kabul eder. Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  addMemberFromTemplate,
  newRegion,
  newTestBusiness,
  platformRows,
  roleFromTemplate as role,
  runTeamSeeds,
  TeamHttp,
} from './team-fixtures';

interface Who {
  readonly userId: string;
  readonly businessId: string;
  readonly auth: Record<string, string>;
}

interface MemberJson {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string;
  readonly phone: string;
  readonly roleId: string;
  readonly jobTitleId: string;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  readonly regionIds: string[];
  readonly isBusinessAdmin: boolean;
  readonly isSelf: boolean;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

describe('F2.7a ekip yönetimi (US-013)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TeamHttp;

  beforeAll(async () => {
    await runTeamSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TeamHttp(app);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const http = () => h.http();

  async function as(userId: string, businessId: string): Promise<Who> {
    const bearer = await h.bearer(userId);
    return { userId, businessId, auth: { ...bearer, 'X-Business-Id': businessId } };
  }

  async function admin(capability: 'seller' | 'buyer' = 'seller'): Promise<Who> {
    const business = await newTestBusiness(capability);
    return await as(business.adminUserId, business.businessId);
  }

  async function warehouse(businessId: string, status = 'active'): Promise<string> {
    const id = randomUUID();
    await platformRows(
      `insert into warehouses (id, business_id, name, status) values ($1, $2, 'Depo', $3)`,
      [id, businessId, status],
    );
    return id;
  }

  async function setMaxUsers(businessId: string, limit: number): Promise<void> {
    await platformRows(
      `insert into entitlement_overrides (business_id, key, value) values ($1, 'users.max', $2::jsonb)
       on conflict (business_id, key) do update set value = excluded.value`,
      [businessId, JSON.stringify(limit)],
    );
  }

  const invite = (who: Who, body: object) =>
    http().post('/api/v1/team/invitations').set(who.auth).send(body);
  const members = (who: Who) => http().get('/api/v1/team/members').set(who.auth);
  const patchMember = (who: Who, id: string, body: object) =>
    http().patch(`/api/v1/team/members/${id}`).set(who.auth).send(body);

  /** Davet edilen telefon OTP ile girer ve son SMS'teki daveti kabul eder. */
  async function acceptAs(
    phone: string,
    existingAccessToken?: string,
  ): Promise<{ status: number; businessId: string | undefined; accessToken: string }> {
    const token = await h.lastInvitationToken(phone);
    // Aynı numaraya 60 sn içinde ikinci OTP istenemez (otp.resend_interval_seconds).
    const accessToken = existingAccessToken ?? (await h.loginWithOtp(phone));
    const response = await http()
      .post('/api/v1/team/invitations/accept')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ token });
    return {
      status: response.status,
      businessId: (response.body as { businessId?: string }).businessId,
      accessToken,
    };
  }

  async function userIdOf(phone: string): Promise<string> {
    const [row] = await platformRows<{ id: string }>('select id from users where phone_e164 = $1', [
      phone,
    ]);
    if (row === undefined) throw new Error('kullanıcı yok');
    return row.id;
  }

  async function memberByPhone(who: Who, phone: string): Promise<MemberJson | undefined> {
    return ((await members(who)).body as MemberJson[]).find((m) => m.phone === phone);
  }

  describe('AC1 davet ve kabul', () => {
    it('US-013 AC1: kayıtsız telefona davet SMS’i gider; OTP ile giren kişi kabul edince üyelik rol ve unvanla aktif olur', async () => {
      const who = await admin();
      const target = await role(who.businessId, 'seller_sales_manager');
      const phone = randomTestPhone();
      const response = await invite(who, { phone, fullName: 'Leyla Əliyeva', ...target });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body).toMatchObject({ smsSent: true });
      expect(Object.keys(response.body as object).sort()).toEqual([
        'expiresAt',
        'invitationId',
        'smsSent',
      ]);

      const sms = await h.lastInvitationSms(phone);
      expect(sms).toContain('F2.7 Test');
      expect(sms).toContain('/activate?token=');

      const [user] = await platformRows<{ full_name: string }>(
        'select full_name from users where phone_e164 = $1',
        [phone],
      );
      expect(user?.full_name).toBe('Leyla Əliyeva');
      const open = await http().get('/api/v1/team/invitations').set(who.auth);
      expect((open.body as { phone: string }[]).map((i) => i.phone)).toEqual([phone]);

      const accepted = await acceptAs(phone);
      expect(accepted).toMatchObject({ status: 200, businessId: who.businessId });
      const member = await memberByPhone(who, phone);
      expect(member).toMatchObject({
        fullName: 'Leyla Əliyeva',
        roleId: target.roleId,
        jobTitleId: target.jobTitleId,
        branchId: null,
        warehouseId: null,
        isSelf: false,
        isBusinessAdmin: false,
      });
      expect((await http().get('/api/v1/team/invitations').set(who.auth)).body).toEqual([]);
      const audits = await platformRows<{ action: string }>(
        `select action from audit_logs where business_id = $1
           and action in ('invitation.created', 'invitation.accepted') order by id`,
        [who.businessId],
      );
      expect(audits.map((a) => a.action)).toEqual(['invitation.created', 'invitation.accepted']);
    });

    it('US-013 AC1: kayıtlı telefonda kullanıcının adı değişmez ve yanıt kayıtsız telefonla aynı biçimdedir (varlık sızmaz)', async () => {
      const who = await admin();
      const target = await role(who.businessId, 'seller_sales_manager');
      const existing = randomTestPhone();
      await insertTestUser({ id: randomUUID(), phone: existing });
      const fresh = randomTestPhone();
      const a = await invite(who, { phone: existing, fullName: 'Başqa Ad', ...target });
      const b = await invite(who, { phone: fresh, fullName: 'Yeni Ad', ...target });
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(Object.keys(a.body as object).sort()).toEqual(Object.keys(b.body as object).sort());
      expect((a.body as { smsSent: boolean }).smsSent).toBe(
        (b.body as { smsSent: boolean }).smsSent,
      );
      const [row] = await platformRows<{ full_name: string }>(
        'select full_name from users where phone_e164 = $1',
        [existing],
      );
      expect(row?.full_name).toBe('Test Kullanıcı');
    });

    it('US-013 AC1: depo kapsamlı rolde depo zorunlu; başka işletmenin deposu 404; gerekmeyen şube 422', async () => {
      const who = await admin();
      const other = await admin();
      const target = await role(who.businessId, 'seller_warehouse');
      const phone = randomTestPhone();
      const base = { phone, fullName: 'Anbar', ...target };

      const missing = await invite(who, base);
      expect(missing.status).toBe(422);
      expect((missing.body as ErrorJson).details).toMatchObject({ warehouseId: ['required'] });

      const foreign = await invite(who, {
        ...base,
        warehouseId: await warehouse(other.businessId),
      });
      expect(foreign.status).toBe(404);

      const inactive = await invite(who, {
        ...base,
        warehouseId: await warehouse(who.businessId, 'inactive'),
      });
      expect(inactive.status).toBe(422);

      const notAllowed = await invite(who, {
        ...base,
        warehouseId: await warehouse(who.businessId),
        branchId: randomUUID(),
      });
      expect(notAllowed.status).toBe(422);
      expect((notAllowed.body as ErrorJson).details).toMatchObject({ branchId: ['not_allowed'] });

      const own = await warehouse(who.businessId);
      expect((await invite(who, { ...base, warehouseId: own })).status).toBe(201);
      expect((await acceptAs(phone)).status).toBe(200);
      expect(await memberByPhone(who, phone)).toMatchObject({ warehouseId: own });
    });

    it('US-013 AC1: başka işletmenin rolü veya başka yeteneğin unvanı reddedilir', async () => {
      const who = await admin();
      const other = await admin();
      const foreignRole = await role(other.businessId, 'seller_sales_manager');
      const phone = randomTestPhone();
      expect((await invite(who, { phone, fullName: 'X', ...foreignRole })).status).toBe(404);
      const own = await role(who.businessId, 'seller_sales_manager');
      const [title] = await platformRows<{ id: string }>(
        "select id from job_titles where capability = 'buyer' and is_active limit 1",
      );
      const wrong = await invite(who, {
        phone,
        fullName: 'X',
        roleId: own.roleId,
        jobTitleId: title?.id,
      });
      expect(wrong.status).toBe(422);
      expect((wrong.body as ErrorJson).details).toMatchObject({ jobTitleId: ['capability'] });
    });

    it('US-013 AC1: aktif üyeye davet 409 MEMBER_ALREADY_EXISTS; aynı telefona yeni davet eskisini kapatır (VARSAYIM K3)', async () => {
      const who = await admin();
      const target = await role(who.businessId, 'seller_sales_manager');
      const [self] = await platformRows<{ phone_e164: string }>(
        'select phone_e164 from users where id = $1',
        [who.userId],
      );
      const dup = await invite(who, { phone: self?.phone_e164, fullName: 'Ben', ...target });
      expect(dup.status).toBe(409);
      expect((dup.body as ErrorJson).code).toBe('MEMBER_ALREADY_EXISTS');

      const phone = randomTestPhone();
      expect((await invite(who, { phone, fullName: 'İlk', ...target })).status).toBe(201);
      const firstToken = await h.lastInvitationToken(phone);
      expect((await invite(who, { phone, fullName: 'İlk', ...target })).status).toBe(201);
      const open = (await http().get('/api/v1/team/invitations').set(who.auth)).body as unknown[];
      expect(open).toHaveLength(1);

      const accessToken = await h.loginWithOtp(phone);
      const old = await http()
        .post('/api/v1/team/invitations/accept')
        .set({ Authorization: `Bearer ${accessToken}` })
        .send({ token: firstToken });
      expect(old.status).toBe(404);
    });

    it('US-013 AC1: çıkarılmış üye yeniden davetle aynı üyelikte, davetteki rol ve kapsamla döner (VARSAYIM K5)', async () => {
      const who = await admin();
      const warehouseRole = await role(who.businessId, 'seller_warehouse');
      const managerRole = await role(who.businessId, 'seller_sales_manager');
      const phone = randomTestPhone();
      const wh = await warehouse(who.businessId);
      await invite(who, { phone, fullName: 'Dönən', ...warehouseRole, warehouseId: wh });
      const first = await acceptAs(phone);
      expect(first.status).toBe(200);
      const before = await memberByPhone(who, phone);
      expect(before).toMatchObject({ roleId: warehouseRole.roleId, warehouseId: wh });

      expect((await patchMember(who, before?.id ?? '', { status: 'removed' })).status).toBe(200);
      expect(await memberByPhone(who, phone)).toBeUndefined();

      expect((await invite(who, { phone, fullName: 'Dönən', ...managerRole })).status).toBe(201);
      expect((await acceptAs(phone, first.accessToken)).status).toBe(200);
      const after = await memberByPhone(who, phone);
      expect(after).toMatchObject({
        id: before?.id,
        roleId: managerRole.roleId,
        jobTitleId: managerRole.jobTitleId,
        warehouseId: null,
        branchId: null,
      });
    });
  });

  describe('AC2 kullanıcı limiti', () => {
    it('US-013 AC2: users.max doluysa (aktif üye + açık davet) yeni davet 403 ENTITLEMENT_LIMIT_REACHED; geri çekince yer açılır (VARSAYIM K2)', async () => {
      const who = await admin();
      await setMaxUsers(who.businessId, 2);
      const target = await role(who.businessId, 'seller_sales_manager');
      const first = await invite(who, { phone: randomTestPhone(), fullName: 'A', ...target });
      expect(first.status).toBe(201);
      const full = await invite(who, { phone: randomTestPhone(), fullName: 'B', ...target });
      expect(full.status).toBe(403);
      expect(full.body).toMatchObject({
        code: 'ENTITLEMENT_LIMIT_REACHED',
        details: { key: 'users.max', limit: 2 },
      });

      const id = (first.body as { invitationId: string }).invitationId;
      const revoke = await http().post(`/api/v1/team/invitations/${id}/revoke`).set(who.auth);
      expect(revoke.status).toBe(204);
      expect(
        (await http().post(`/api/v1/team/invitations/${id}/revoke`).set(who.auth)).status,
      ).toBe(404);
      expect(
        (await invite(who, { phone: randomTestPhone(), fullName: 'B', ...target })).status,
      ).toBe(201);
    });

    it('US-013 AC2: aynı telefona yeniden davet limiti tüketmez', async () => {
      const who = await admin();
      await setMaxUsers(who.businessId, 2);
      const target = await role(who.businessId, 'seller_sales_manager');
      const phone = randomTestPhone();
      expect((await invite(who, { phone, fullName: 'A', ...target })).status).toBe(201);
      expect((await invite(who, { phone, fullName: 'A', ...target })).status).toBe(201);
    });

    it('US-013 AC2: limit 2 iken eşzamanlı iki davetten yalnız biri geçer', async () => {
      const who = await admin();
      await setMaxUsers(who.businessId, 2);
      const target = await role(who.businessId, 'seller_sales_manager');
      const results = await Promise.all([
        invite(who, { phone: randomTestPhone(), fullName: 'A', ...target }),
        invite(who, { phone: randomTestPhone(), fullName: 'B', ...target }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    });
  });

  describe('AC3 son admin', () => {
    it('US-013 AC3: tek admin kendini çıkaramaz ve kendi admin rolünü düşüremez (409 LAST_ADMIN_PROTECTED)', async () => {
      const who = await admin();
      const self = ((await members(who)).body as MemberJson[]).find((m) => m.isSelf);
      expect(self?.isBusinessAdmin).toBe(true);
      const removed = await patchMember(who, self?.id ?? '', { status: 'removed' });
      expect(removed.status).toBe(409);
      expect((removed.body as ErrorJson).code).toBe('LAST_ADMIN_PROTECTED');
      const lower = await role(who.businessId, 'seller_sales_manager');
      const demoted = await patchMember(who, self?.id ?? '', { roleId: lower.roleId });
      expect(demoted.status).toBe(409);
      expect((demoted.body as ErrorJson).code).toBe('LAST_ADMIN_PROTECTED');
      expect(((await members(who)).body as MemberJson[]).find((m) => m.isSelf)).toMatchObject({
        isBusinessAdmin: true,
      });
    });
  });

  describe('AC4 rol değişikliği', () => {
    it('US-013 AC4: rol değişikliği audit’e kim/kime/eski/yeni yazılır ve sonraki istekte geçerli olur', async () => {
      const who = await admin();
      const memberUserId = await addMemberFromTemplate(who.businessId, 'seller_business_admin');
      const member = await as(memberUserId, who.businessId);
      expect((await members(member)).status).toBe(200); // izin önbelleğe girer

      const row = ((await members(who)).body as MemberJson[]).find(
        (m) => m.userId === memberUserId,
      );
      const lower = await role(who.businessId, 'seller_sales_manager');
      const changed = await patchMember(who, row?.id ?? '', { roleId: lower.roleId });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(changed.body).toMatchObject({ roleId: lower.roleId, isBusinessAdmin: false });

      const [audit] = await platformRows<{
        actor_user_id: string;
        before: { userId: string; roleId: string };
        after: { userId: string; roleId: string };
      }>(
        `select actor_user_id, before, after from audit_logs
          where business_id = $1 and action = 'membership.role_changed'`,
        [who.businessId],
      );
      expect(audit).toMatchObject({
        actor_user_id: who.userId,
        before: { userId: memberUserId, roleId: row?.roleId },
        after: { userId: memberUserId, roleId: lower.roleId },
      });
      const next = await members(member);
      expect(next.status).toBe(403);
      expect((next.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    });

    it('US-013 AC4: temsilcinin bölgeleri atanır; assigned kapsamı olmayan rolde 422, olmayan bölge 404, çıkarmada silinir (K4)', async () => {
      const who = await admin();
      const repUserId = await addMemberFromTemplate(who.businessId, 'seller_sales_rep');
      const rep = ((await members(who)).body as MemberJson[]).find((m) => m.userId === repUserId);
      const r1 = await newRegion('F2.7 bölge 1');
      const r2 = await newRegion('F2.7 bölge 2');
      const set = await patchMember(who, rep?.id ?? '', { regionIds: [r1, r2, r1] });
      expect(set.status, JSON.stringify(set.body)).toBe(200);
      expect((set.body as MemberJson).regionIds).toEqual([r1, r2].sort());
      expect((await patchMember(who, rep?.id ?? '', { regionIds: [randomUUID()] })).status).toBe(
        404,
      );

      const managerUserId = await addMemberFromTemplate(who.businessId, 'seller_sales_manager');
      const manager = ((await members(who)).body as MemberJson[]).find(
        (m) => m.userId === managerUserId,
      );
      const bad = await patchMember(who, manager?.id ?? '', { regionIds: [r1] });
      expect(bad.status).toBe(422);

      const scopeAudit = await platformRows(
        `select 1 from audit_logs where business_id = $1 and action = 'membership.scope_changed'`,
        [who.businessId],
      );
      expect(scopeAudit).toHaveLength(1);

      expect((await patchMember(who, rep?.id ?? '', { status: 'removed' })).status).toBe(200);
      const left = await platformRows('select 1 from membership_regions where membership_id = $1', [
        rep?.id,
      ]);
      expect(left).toHaveLength(0);
      expect((await patchMember(who, rep?.id ?? '', { roleId: rep?.roleId })).status).toBe(404);
    });
  });

  describe('AC5 izin', () => {
    it('US-013 AC5: team.manage izni olmayan üye tüm /team uçlarında 403 alır', async () => {
      const who = await admin();
      const userId = await addMemberFromTemplate(who.businessId, 'seller_sales_manager');
      const member = await as(userId, who.businessId);
      const id = randomUUID();
      const calls = [
        http().get('/api/v1/team/members').set(member.auth),
        http().patch(`/api/v1/team/members/${id}`).set(member.auth).send({ status: 'removed' }),
        http().get('/api/v1/team/invitations').set(member.auth),
        http()
          .post('/api/v1/team/invitations')
          .set(member.auth)
          .send({ phone: randomTestPhone(), fullName: 'X', roleId: id, jobTitleId: id }),
        http().post(`/api/v1/team/invitations/${id}/revoke`).set(member.auth),
        http().get('/api/v1/team/roles').set(member.auth),
        http().get('/api/v1/team/job-titles').set(member.auth),
      ];
      for (const response of await Promise.all(calls)) {
        expect(response.status).toBe(403);
        expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
      }
    });

    it('roller izin kapsamlarıyla, unvanlar işletmenin yeteneğiyle listelenir', async () => {
      const who = await admin('buyer');
      const roles = (await http().get('/api/v1/team/roles').set(who.auth)).body as {
        capability: string;
        permissions: { code: string; scope: string }[];
      }[];
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.every((r) => r.capability === 'buyer')).toBe(true);
      expect(roles[0]?.permissions.some((p) => p.code === 'team.manage')).toBe(true);
      const titles = (await http().get('/api/v1/team/job-titles').set(who.auth)).body as {
        capability: string;
      }[];
      expect(titles.length).toBeGreaterThan(0);
      expect(titles.every((t) => t.capability === 'buyer')).toBe(true);
    });
  });

  describe('user_ensure_for_invitation (SECURITY DEFINER)', () => {
    async function callAsApp(
      context: { businessId?: string; userId?: string },
      phone: string,
    ): Promise<string> {
      const client = await connectAsAppUser();
      try {
        await client.query('begin');
        if (context.businessId !== undefined) {
          await client.query("select set_config('app.business_id', $1, true)", [
            context.businessId,
          ]);
        }
        if (context.userId !== undefined) {
          await client.query("select set_config('app.user_id', $1, true)", [context.userId]);
        }
        try {
          const result = await client.query<{ id: string }>(
            'select user_ensure_for_invitation($1, $2, $3, now()) as id',
            [randomUUID(), phone, 'Saxta'],
          );
          return result.rows[0]?.id ?? '';
        } catch (error) {
          return (error as { code?: string }).code ?? 'error';
        }
      } finally {
        await client.query('rollback');
        await client.end();
      }
    }

    it('bağlamsız, team.manage’siz üye veya başka işletme bağlamıyla 42501; kullanıcı oluşmaz', async () => {
      const who = await admin();
      const other = await admin();
      const staff = await addMemberFromTemplate(who.businessId, 'seller_sales_manager');
      const phone = randomTestPhone();
      expect(await callAsApp({}, phone)).toBe('42501');
      expect(await callAsApp({ businessId: who.businessId, userId: staff }, phone)).toBe('42501');
      expect(await callAsApp({ businessId: other.businessId, userId: who.userId }, phone)).toBe(
        '42501',
      );
      expect(await platformRows('select 1 from users where phone_e164 = $1', [phone])).toHaveLength(
        0,
      );
    });

    it('yalnız kimlik döner; kayıtlı telefonda var olan kimlik, ad değişmez', async () => {
      const who = await admin();
      const phone = randomTestPhone();
      const existingId = randomUUID();
      await insertTestUser({ id: existingId, phone });
      expect(await callAsApp({ businessId: who.businessId, userId: who.userId }, phone)).toBe(
        existingId,
      );
      expect(await userIdOf(phone)).toBe(existingId);
    });
  });

  describe('son kullanılan işletme (S8)', () => {
    it('PATCH /me lastBusinessId: üye olunmayan işletme 422; üye olunan /me’de döner, çıkarılınca null', async () => {
      const who = await admin();
      const other = await admin();
      const userId = await addMemberFromTemplate(who.businessId, 'seller_sales_manager');
      const bearer = await h.bearer(userId);
      const bad = await http()
        .patch('/api/v1/me')
        .set(bearer)
        .send({ lastBusinessId: other.businessId });
      expect(bad.status).toBe(422);
      expect(
        (await http().patch('/api/v1/me').set(bearer).send({ lastBusinessId: who.businessId }))
          .status,
      ).toBe(200);
      expect((await http().get('/api/v1/me').set(bearer)).body).toMatchObject({
        lastBusinessId: who.businessId,
      });

      const member = ((await members(who)).body as MemberJson[]).find((m) => m.userId === userId);
      expect((await patchMember(who, member?.id ?? '', { status: 'removed' })).status).toBe(200);
      expect((await http().get('/api/v1/me').set(bearer)).body).toMatchObject({
        lastBusinessId: null,
      });
    });
  });
});
