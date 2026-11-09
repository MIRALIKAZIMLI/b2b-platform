// F2.10b: yetkili adı, kişisel telefon, e-posta (🔒 `person_data`) ve logo (`PATCH /api/v1/business`,
// US-007 AC2 alanlarının düzenlenmesi, VARSAYIM V5–V6, ADR-0024 `BusinessLogoPort`). İşletmeler
// kayıt ucuyla açılır (F2.3a); uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { platformRows, RegistrationHttp, registerBody, runSeeds } from './fixtures';

interface Registered {
  readonly businessId: string;
  readonly accessToken: string;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, string[]>;
}

describe('F2.10b PATCH /api/v1/business kişisel veri ve logo', () => {
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

  const patch = (who: Registered, body: object) =>
    api
      .http()
      .patch('/api/v1/business')
      .set('Authorization', `Bearer ${who.accessToken}`)
      .set('X-Business-Id', who.businessId)
      .send(body);

  const get = (who: Registered) =>
    api
      .http()
      .get('/api/v1/business')
      .set('Authorization', `Bearer ${who.accessToken}`)
      .set('X-Business-Id', who.businessId);

  async function person(businessId: string) {
    const [row] = await platformRows<{
      contact_name: string;
      personal_phone: string | null;
      email: string | null;
    }>('select contact_name, personal_phone, email from person_data where business_id = $1', [
      businessId,
    ]);
    return row;
  }

  /** Sahibin dosya satırı (yükleme akışı F1.10'da sınanır; burada yalnız durum/amaç önemli). */
  async function insertFile(
    owner: string,
    purpose: 'logo' | 'product_image',
    status: 'pending' | 'ready' | 'rejected',
  ): Promise<string> {
    const id = randomUUID();
    await platformRows(
      `insert into files (id, owner_business_id, purpose, bucket, object_key, content_type,
                          size_bytes, status, created_by)
       select $1::uuid, $2::uuid, $3::text, 'public', $5::text, 'image/png', 10, $4::text,
              m.user_id
         from memberships m where m.business_id = $2::uuid limit 1`,
      [id, owner, purpose, status, `${owner}/${purpose}/${id}.png`],
    );
    return id;
  }

  it('F2.10b-AC1: yetkili adı, kişisel telefon ve e-posta güncellenir; GET döner; e-posta doluluğa sayılır', async () => {
    const who = await register();
    const response = await patch(who, {
      contactName: '  Rəşad Məmmədov ',
      personalPhone: '+994501234567',
      email: 'resad@example.az',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      contactName: 'Rəşad Məmmədov',
      personalPhone: '+994501234567',
      email: 'resad@example.az',
      profileCompleteness: 50,
    });
    expect(await person(who.businessId)).toEqual({
      contact_name: 'Rəşad Məmmədov',
      personal_phone: '+994501234567',
      email: 'resad@example.az',
    });
    expect((await get(who)).body).toMatchObject({ email: 'resad@example.az' });
  });

  it('F2.10b-V5: kişisel telefon ve e-posta null ile silinir; yetkili adı silinemez', async () => {
    const who = await register();
    await patch(who, { personalPhone: '+994501234567', email: 'a@b.az' });
    const cleared = await patch(who, { personalPhone: null, email: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect(cleared.body).toMatchObject({
      personalPhone: null,
      email: null,
      profileCompleteness: 40,
    });
    for (const body of [{ contactName: null }, { contactName: '  ' }]) {
      const response = await patch(who, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
  });

  it('F2.10b-AC1: biçimi hatalı kişisel telefon ve e-posta alan hatasıyla 422', async () => {
    const who = await register();
    const phone = await patch(who, { personalPhone: '050 123 45 67' });
    expect(phone.status).toBe(422);
    expect((phone.body as ErrorJson).details?.personalPhone).toEqual(['invalid_phone']);
    const email = await patch(who, { email: 'a@' });
    expect(email.status).toBe(422);
    expect((email.body as ErrorJson).details?.email).toEqual(['invalid_email']);
    expect((await person(who.businessId))?.email).toBeNull();
  });

  it('F2.10b-AUDIT: kişisel veri audit kaydında maskeli', async () => {
    const who = await register();
    await patch(who, { contactName: 'Yeni Ad', email: 'gizli@example.az' });
    const [audit] = await platformRows<{ before: unknown; after: unknown }>(
      `select before, after from audit_logs
        where business_id = $1 and action = 'business.profile_updated'`,
      [who.businessId],
    );
    expect(audit?.after).toEqual({ contactName: '***', email: '***' });
    expect(JSON.stringify(audit)).not.toContain('gizli@example.az');
  });

  it('ADR-0024: kendi hazır logo dosyası atanır, logoUrl döner, doluluk +10; null kaldırır', async () => {
    const who = await register();
    const fileId = await insertFile(who.businessId, 'logo', 'ready');
    const response = await patch(who, { logoFileId: fileId });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const body = response.body as { logoFileId: string; logoUrl: string | null };
    expect(body).toMatchObject({ logoFileId: fileId, profileCompleteness: 50 });
    expect(body.logoUrl).toMatch(/^https?:\/\//);
    expect((await get(who)).body).toMatchObject({ logoFileId: fileId });

    const removed = await patch(who, { logoFileId: null });
    expect(removed.body).toMatchObject({
      logoFileId: null,
      logoUrl: null,
      profileCompleteness: 40,
    });
  });

  it('ADR-0024: başka işletmenin, hazır olmayan veya amacı logo olmayan dosya 422 invalid_logo', async () => {
    const who = await register();
    const other = await register();
    const cases = [
      await insertFile(other.businessId, 'logo', 'ready'),
      await insertFile(who.businessId, 'logo', 'pending'),
      await insertFile(who.businessId, 'logo', 'rejected'),
      await insertFile(who.businessId, 'product_image', 'ready'),
      randomUUID(),
    ];
    for (const logoFileId of cases) {
      const response = await patch(who, { logoFileId });
      expect(response.status, logoFileId).toBe(422);
      expect((response.body as ErrorJson).details?.logoFileId).toEqual(['invalid_logo']);
    }
    const [row] = await platformRows<{ logo_file_id: string | null }>(
      'select logo_file_id from businesses where id = $1',
      [who.businessId],
    );
    expect(row?.logo_file_id).toBeNull();
  });

  it('F2.10b-V6: person_data satırı yoksa ilk yazımda yetkili adı zorunlu, sonra satır açılır', async () => {
    const who = await register();
    await platformRows('delete from person_data where business_id = $1', [who.businessId]);
    const missing = await patch(who, { email: 'a@b.az' });
    expect(missing.status).toBe(422);
    expect((missing.body as ErrorJson).details?.contactName).toEqual(['required']);
    const created = await patch(who, { contactName: 'İlk Ad', email: 'a@b.az' });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(await person(who.businessId)).toEqual({
      contact_name: 'İlk Ad',
      personal_phone: null,
      email: 'a@b.az',
    });
  });
});
