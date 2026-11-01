// F2.4: VÖEN girişi ve profil düzenleme (`PATCH /api/v1/business`, US-006 AC1–AC3, R20, K1–K3).
// İşletmeler kayıt ucuyla açılır (F2.3a); uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { platformRows, RegistrationHttp, registerBody, runSeeds, testRefs } from './fixtures';

interface Registered {
  readonly businessId: string;
  readonly accessToken: string;
}

interface ErrorJson {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, string[]>;
}

/** Her çağrıda benzersiz, biçimi geçerli VÖEN. */
function newVoen(last: '1' | '2' = '1'): string {
  return `${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}${last}`;
}

describe('F2.4 PATCH /api/v1/business', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: RegistrationHttp;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    api = new RegistrationHttp(app);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function register(): Promise<Registered> {
    // Bu dosya IP başına saatlik kayıt sınırından (10) fazla işletme açar; sınır F2.3a'da sınanır.
    const limits = (await redis.keys()).filter((key) => key.startsWith('buyer_reg:'));
    if (limits.length > 0) await redis.client.del(...limits);
    const response = await api.register(
      await api.pendingToken(randomTestPhone()),
      await registerBody(),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const json = response.body as { businessId: string; accessToken: string };
    return { businessId: json.businessId, accessToken: json.accessToken };
  }

  const patch = (who: Registered, body: object, language = 'tr') =>
    api
      .http()
      .patch('/api/v1/business')
      .set('Authorization', `Bearer ${who.accessToken}`)
      .set('X-Business-Id', who.businessId)
      .set('Accept-Language', language)
      .send(body);

  async function businessRow(businessId: string) {
    const [row] = await platformRows<{
      voen: string | null;
      legal_type: string | null;
      verified_at: Date | null;
      profile_completeness: number;
    }>('select voen, legal_type, verified_at, profile_completeness from businesses where id = $1', [
      businessId,
    ]);
    return row;
  }

  it('US-006-AC1: 10 haneli olmayan veya son hanesi 1/2 olmayan VÖEN reddedilir ("VÖEN geçersiz")', async () => {
    const who = await register();
    for (const voen of ['123456789', '12345678901', '123456789a', '1234567893', ' 1234567891']) {
      const response = await patch(who, { voen });
      expect(response.status, voen).toBe(422);
      const body = response.body as ErrorJson;
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.details?.voen).toEqual(['VOEN_INVALID']);
    }
    expect((await businessRow(who.businessId))?.voen).toBeNull();
  });

  it('US-006-AC2: geçerli VÖEN → hukuki tip son haneden, "doğrulama bekliyor", doluluk 40 → 50', async () => {
    const who = await register();
    const entity = newVoen('1');
    const response = await patch(who, { voen: entity });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      id: who.businessId,
      voen: entity,
      legalType: 'legal_entity',
      verified: false,
      profileCompleteness: 50,
    });

    const other = await register();
    const individual = await patch(other, { voen: newVoen('2') });
    expect(individual.body).toMatchObject({
      legalType: 'individual_entrepreneur',
      verified: false,
    });

    const audits = await platformRows<{ action: string; after: { voen: string } }>(
      `select action, after from audit_logs where business_id = $1 and action like 'business.%'`,
      [who.businessId],
    );
    expect(audits.map((row) => [row.action, row.after.voen])).toEqual([
      ['business.voen_changed', entity],
    ]);
  });

  it('US-006-AC3: başka işletmede kayıtlı VÖEN → 409 VOEN_ALREADY_REGISTERED ve davet mesajı', async () => {
    const first = await register();
    const second = await register();
    const voen = newVoen();
    expect((await patch(first, { voen })).status).toBe(200);

    const response = await patch(second, { voen }, 'tr');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'VOEN_ALREADY_REGISTERED',
      message: 'Bu VÖEN ile kayıtlı bir işletme var; yöneticisinden davet isteyin.',
    });
    expect((await businessRow(second.businessId))?.voen).toBeNull();
  });

  it('US-006-AC3: aynı VÖEN için eşzamanlı iki istekten yalnız biri kazanır', async () => {
    const a = await register();
    const b = await register();
    const voen = newVoen();
    const statuses = (await Promise.all([patch(a, { voen }), patch(b, { voen })])).map(
      (r) => r.status,
    );
    expect(statuses.sort()).toEqual([200, 409]);
    const [row] = await platformRows<{ n: number }>(
      'select count(*)::int as n from businesses where voen = $1',
      [voen],
    );
    expect(row?.n).toBe(1);
  });

  it('F2.4-R20: doğrulanmış işletme VÖEN değiştirince rozet sıfırlanır; aynı VÖEN rozeti korur (K3)', async () => {
    const who = await register();
    const voen = newVoen();
    await patch(who, { voen });
    await platformRows('update businesses set verified_at = now() where id = $1', [who.businessId]);

    const same = await patch(who, { voen, addressLine: 'Nizami küç. 10' });
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({
      verified: true,
      addressLine: 'Nizami küç. 10',
      profileCompleteness: 60,
    });

    const changed = await patch(who, { voen: newVoen('2') });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ verified: false, legalType: 'individual_entrepreneur' });
    expect((await businessRow(who.businessId))?.verified_at).toBeNull();
  });

  it('F2.4-K1: profil alanları güncellenir; kişisel veri ve logo alanları bu adımda 422', async () => {
    const who = await register();
    const { regionId } = await testRefs();
    const ok = await patch(who, {
      legalName: '  Yeni Market  ',
      regionId,
      businessPhone: '+994 12 555 11 22',
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({
      legalName: 'Yeni Market',
      regionId,
      businessPhone: '+994 12 555 11 22',
      profileCompleteness: 50,
    });

    for (const body of [
      { email: 'a@b.az' },
      { contactName: 'X' },
      { logoFileId: '00000000-0000-0000-0000-000000000000' },
      {},
      { voen: null },
      { regionId: '01890000-0000-7000-8000-000000000000' },
      { businessPhone: 'abc' },
    ]) {
      const response = await patch(who, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
      expect((response.body as ErrorJson).code).toBe('VALIDATION_FAILED');
    }
  });

  it('F2.4-K2: buyer yeteneği olmayan işletme VÖEN değiştiremez (403 CAPABILITY_REQUIRED)', async () => {
    const who = await register();
    await platformRows(
      "update business_capabilities set capability = 'seller' where business_id = $1",
      [who.businessId],
    );
    const response = await patch(who, { voen: newVoen() });
    expect(response.status).toBe(403);
    expect((response.body as ErrorJson).code).toBe('CAPABILITY_REQUIRED');
    expect((await businessRow(who.businessId))?.voen).toBeNull();
  });

  it("F2.4-AUTH: business.manage izni olmayan üye (buyer_branch_staff) profili ve VÖEN'i değiştiremez (403)", async () => {
    const owner = await register();
    const staffId = randomUUID();
    await insertTestUser({ id: staffId, phone: randomTestPhone() });
    const roleId = randomUUID();
    await platformRows(
      `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id)
       select $1, $2, name, capability, is_business_admin, id from role_templates
        where code = 'buyer_branch_staff'`,
      [roleId, owner.businessId],
    );
    await platformRows(
      `insert into role_permissions (role_id, permission_code, scope)
       select $1, p.permission_code, p.default_scope
         from role_template_permissions p join role_templates t on t.id = p.template_id
        where t.code = 'buyer_branch_staff'`,
      [roleId],
    );
    const [perm] = await platformRows<{ n: number }>(
      `select count(*)::int as n from role_permissions
        where role_id = $1 and permission_code = 'business.manage'`,
      [roleId],
    );
    expect(perm?.n).toBe(0);
    await platformRows(
      `insert into memberships (id, user_id, business_id, role_id, job_title_id, branch_id)
       select $1, $2, $3, $4, j.id, (select id from branches where business_id = $3 limit 1)
         from job_titles j join role_templates t on t.id = j.role_template_id
        where t.code = 'buyer_branch_staff' and j.code = t.code`,
      [randomUUID(), staffId, owner.businessId, roleId],
    );
    const signed = await app
      .get(TokenService)
      .signAccess({ userId: staffId, sessionId: randomUUID() });
    const staff: Registered = { businessId: owner.businessId, accessToken: signed.token };

    const response = await patch(staff, { voen: newVoen(), legalName: 'Personel değiştirdi' });
    expect(response.status).toBe(403);
    expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    const row = await businessRow(owner.businessId);
    expect(row?.voen).toBeNull();
    const [name] = await platformRows<{ legal_name: string }>(
      'select legal_name from businesses where id = $1',
      [owner.businessId],
    );
    expect(name?.legal_name).not.toBe('Personel değiştirdi');
  });
});
