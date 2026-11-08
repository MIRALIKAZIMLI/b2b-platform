// F2.10: perakendeci görünürlük ayarları (`GET|PUT /api/v1/business/privacy`, US-007 AC1–AC3,
// ADR-0014, VARSAYIM V1–V4). İşletmeler kayıt ucuyla açılır (F2.3a); uygulama bağlantısı RLS'e
// tabi app_user. Dizin tarafı (AC4–AC6) F2.11'de.
import { randomUUID } from 'node:crypto';
import { DEFAULT_PRIVACY, PRIVACY_FIELD_KEYS } from '@b2b/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { platformRows, RegistrationHttp, registerBody, runSeeds } from './fixtures';

interface Registered {
  readonly businessId: string;
  readonly accessToken: string;
}

interface ErrorJson {
  readonly code: string;
}

describe('F2.10 /api/v1/business/privacy', () => {
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
    // IP başına saatlik kayıt sınırı (F2.3a'da sınanır) bu dosyayı kesmesin.
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

  const get = (who: Registered) =>
    api
      .http()
      .get('/api/v1/business/privacy')
      .set('Authorization', `Bearer ${who.accessToken}`)
      .set('X-Business-Id', who.businessId);

  const put = (who: Registered, body: object) =>
    api
      .http()
      .put('/api/v1/business/privacy')
      .set('Authorization', `Bearer ${who.accessToken}`)
      .set('X-Business-Id', who.businessId)
      .send(body);

  async function stored(businessId: string) {
    const [row] = await platformRows<Record<string, boolean>>(
      `select p.listed_in_directory, x.show_logo, x.show_address, x.show_business_phone,
              x.show_voen, x.show_contact_name, x.show_personal_contact
         from buyer_profiles p join business_privacy x on x.business_id = p.business_id
        where p.business_id = $1`,
      [businessId],
    );
    return row;
  }

  const events = (businessId: string) =>
    platformRows<{ type: string; payload: unknown }>(
      `select type, payload from outbox_events
        where aggregate_id = $1 and type = 'buyer.privacy_changed'`,
      [businessId],
    );

  const audits = (businessId: string) =>
    platformRows<{ before: unknown; after: unknown }>(
      `select before, after from audit_logs
        where business_id = $1 and action = 'business.privacy_updated' order by occurred_at, id`,
      [businessId],
    );

  it('US-007-AC1: yeni kayıtta yalnız dizinde görünme açık, ek alanların hepsi kapalı', async () => {
    const who = await register();
    const response = await get(who);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual(DEFAULT_PRIVACY);
    expect(await stored(who.businessId)).toEqual({
      listed_in_directory: true,
      show_logo: false,
      show_address: false,
      show_business_phone: false,
      show_voen: false,
      show_contact_name: false,
      show_personal_contact: false,
    });
  });

  it('US-007-AC2: her ek alan tek tek açılır; audit yalnız değişeni, outbox dizine olay yazar', async () => {
    const who = await register();
    let current = { ...DEFAULT_PRIVACY };
    for (const key of PRIVACY_FIELD_KEYS) {
      current = { ...current, [key]: true };
      const response = await put(who, current);
      expect(response.status, `${key} ${JSON.stringify(response.body)}`).toBe(200);
      expect(response.body).toEqual(current);
      expect((await get(who)).body).toEqual(current);
    }
    expect(Object.values((await stored(who.businessId)) ?? {})).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);

    const trail = await audits(who.businessId);
    expect(trail).toHaveLength(PRIVACY_FIELD_KEYS.length);
    expect(trail[0]).toEqual({ before: { showLogo: false }, after: { showLogo: true } });
    expect(await events(who.businessId)).toEqual(
      PRIVACY_FIELD_KEYS.map(() => ({
        type: 'buyer.privacy_changed',
        payload: { businessId: who.businessId },
      })),
    );
  });

  it('US-007-AC2: "dizinde görünme" kapatılır ve yeniden açılır (buyer_profiles)', async () => {
    const who = await register();
    const off = await put(who, { ...DEFAULT_PRIVACY, listedInDirectory: false });
    expect(off.status).toBe(200);
    expect((await stored(who.businessId))?.listed_in_directory).toBe(false);
    const on = await put(who, DEFAULT_PRIVACY);
    expect(on.body).toEqual(DEFAULT_PRIVACY);
    expect((await stored(who.businessId))?.listed_in_directory).toBe(true);
  });

  it('US-007-AC3: ünvan, faaliyet alanı, şehir/rayon kapatılamaz (anahtar yok → 422, değişiklik yok)', async () => {
    const who = await register();
    for (const key of ['showLegalName', 'showActivityType', 'showRegion', 'showCity']) {
      const response = await put(who, { ...DEFAULT_PRIVACY, showVoen: true, [key]: false });
      expect(response.status, key).toBe(422);
      expect((response.body as ErrorJson).code).toBe('VALIDATION_FAILED');
    }
    expect((await get(who)).body).toEqual(DEFAULT_PRIVACY);
    expect(await audits(who.businessId)).toEqual([]);
  });

  it('F2.10-V2: eksik anahtar, boolean olmayan değer veya boş gövde 422', async () => {
    const who = await register();
    const missing: Record<string, boolean> = { ...DEFAULT_PRIVACY };
    delete missing.showVoen;
    for (const body of [missing, { ...DEFAULT_PRIVACY, showVoen: 'true' }, {}]) {
      const response = await put(who, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
  });

  it('F2.10-V3: aynı ayarlar yeniden gönderilince audit ve outbox yazılmaz', async () => {
    const who = await register();
    const response = await put(who, DEFAULT_PRIVACY);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(DEFAULT_PRIVACY);
    expect(await audits(who.businessId)).toEqual([]);
    expect(await events(who.businessId)).toEqual([]);
  });

  it('F2.10-V3: business_privacy satırı yoksa GET varsayılanı döner, PUT satırı açar', async () => {
    const who = await register();
    await platformRows('delete from business_privacy where business_id = $1', [who.businessId]);
    expect((await get(who)).body).toEqual(DEFAULT_PRIVACY);
    const response = await put(who, { ...DEFAULT_PRIVACY, showAddress: true });
    expect(response.status).toBe(200);
    expect((await stored(who.businessId))?.show_address).toBe(true);
  });

  it('F2.10-V1: buyer yeteneği olmayan işletme 403 CAPABILITY_REQUIRED', async () => {
    const who = await register();
    await platformRows(
      "update business_capabilities set capability = 'seller' where business_id = $1",
      [who.businessId],
    );
    for (const response of [
      await get(who),
      await put(who, { ...DEFAULT_PRIVACY, showVoen: true }),
    ]) {
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('CAPABILITY_REQUIRED');
    }
    expect((await stored(who.businessId))?.show_voen).toBe(false);
  });

  it('F2.10-AUTH: business.manage izni olmayan üye (buyer_branch_staff) ayarları okuyamaz/değiştiremez (403)', async () => {
    const owner = await register();
    const staffId = randomUUID();
    await insertTestUser({ id: staffId, phone: randomTestPhone() });
    const [copy] = await platformRows<{ id: string }>(
      `select r.id from roles r join role_templates t on t.id = r.source_template_id
        where r.business_id = $1 and t.code = 'buyer_branch_staff' and not r.is_custom`,
      [owner.businessId],
    );
    const roleId = copy?.id ?? '';
    expect(roleId).not.toBe('');
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

    for (const response of [
      await get(staff),
      await put(staff, { ...DEFAULT_PRIVACY, showVoen: true }),
    ]) {
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    }
    expect((await stored(owner.businessId))?.show_voen).toBe(false);
  });
});
