// F2.9 entegrasyon (US-012): admin unvan ve rol şablonu kataloğu. Uçlar platform-admin modülünde,
// kurallar access RoleCatalogService'te; test HTTP üzerinden. İşletme kurulumları migrator ile.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  addMemberFromTemplate,
  newTestBusiness,
  platformRows,
  runTeamSeeds,
  TeamHttp,
} from './team-fixtures';

interface TemplateJson {
  readonly id: string;
  readonly code: string;
  readonly capability: string;
  readonly isBusinessAdmin: boolean;
  readonly version: number;
  readonly permissions: { code: string; scope: string }[];
}

interface JobTitleJson {
  readonly id: string;
  readonly code: string;
  readonly isActive: boolean;
  readonly inUse: boolean;
  readonly roleTemplateId: string | null;
}

const NAME = { az: 'Test vəzifə', ru: 'Тестовая должность', tr: 'Test unvanı' };

function uniqueCode(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

async function platformStaff(role: 'super_admin' | 'operations' | 'content'): Promise<string> {
  const userId = randomUUID();
  await insertTestUser({ id: userId, phone: randomTestPhone() });
  const client = await connectAsMigrator();
  try {
    await client.query('insert into platform_staff (user_id, role) values ($1, $2)', [
      userId,
      role,
    ]);
  } finally {
    await client.end();
  }
  return userId;
}

describe('F2.9 admin unvan ve rol şablonları (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TeamHttp;
  let content: Record<string, string>;

  beforeAll(async () => {
    await runTeamSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TeamHttp(app);
    content = await h.bearer(await platformStaff('content'));
  });

  // Test şablonları genel katalogdur (G); diğer test dosyaları seed şablon listesini birebir
  // bekler. Bu dosyanın açtığı şablonlar, kopyaları, unvanları ve onlara bağlı üyelik/davetler
  // silinir (audit ve outbox satırları kalır).
  const createdTemplates: string[] = [];

  afterAll(async () => {
    const ids = [createdTemplates];
    const roleIds = 'select id from roles where source_template_id = any($1)';
    const titleIds = 'select id from job_titles where role_template_id = any($1)';
    await platformRows(
      `delete from invitations where role_id in (${roleIds}) or job_title_id in (${titleIds})`,
      ids,
    );
    await platformRows(
      `delete from memberships where role_id in (${roleIds}) or job_title_id in (${titleIds})`,
      ids,
    );
    await platformRows('delete from job_titles where role_template_id = any($1)', ids);
    await platformRows('delete from roles where source_template_id = any($1)', ids);
    await platformRows('delete from role_templates where id = any($1)', ids);
    await redis.cleanup();
    await app.close();
  });

  const http = () => h.http();

  async function tenantAuth(userId: string, businessId: string): Promise<Record<string, string>> {
    return { ...(await h.bearer(userId)), 'X-Business-Id': businessId };
  }

  async function createTemplate(
    overrides: Record<string, unknown> = {},
  ): Promise<{ status: number; body: unknown }> {
    const response = await http()
      .post('/api/v1/admin/catalog/role-templates')
      .set(content)
      .send({
        code: uniqueCode('tpl'),
        name: NAME,
        capability: 'seller',
        permissions: [
          { code: 'catalog.view', scope: 'all' },
          { code: 'orders.view', scope: 'all' },
        ],
        ...overrides,
      });
    if (response.status === 201) createdTemplates.push((response.body as TemplateJson).id);
    return { status: response.status, body: response.body as unknown };
  }

  async function sellerTemplate(): Promise<TemplateJson> {
    const created = await createTemplate();
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return created.body as TemplateJson;
  }

  async function createJobTitle(templateId: string, capability = 'seller') {
    return await http()
      .post('/api/v1/admin/catalog/job-titles')
      .set(content)
      .send({ code: uniqueCode('jt'), name: NAME, capability, roleTemplateId: templateId });
  }

  async function copyOf(businessId: string, templateId: string) {
    return await platformRows<{ id: string; source_template_version: number }>(
      `select id, source_template_version from roles
        where business_id = $1 and source_template_id = $2 and not is_custom`,
      [businessId, templateId],
    );
  }

  describe('US-012 AC1 unvan ve şablon', () => {
    it('US-012-AC1 yeni şablon + unvan var olan işletmenin /team/job-titles listesinde, rolü kopyalanmış ve davet edilebilir', async () => {
      const business = await newTestBusiness('seller');
      const template = await sellerTemplate();
      expect(template).toMatchObject({ version: 1, isBusinessAdmin: false, capability: 'seller' });

      const [copy] = await copyOf(business.businessId, template.id);
      expect(copy?.source_template_version).toBe(1);
      const perms = await platformRows<{ permission_code: string }>(
        'select permission_code from role_permissions where role_id = $1 order by 1',
        [copy?.id],
      );
      expect(perms.map((row) => row.permission_code)).toEqual(['catalog.view', 'orders.view']);

      const title = await createJobTitle(template.id);
      expect(title.status, JSON.stringify(title.body)).toBe(201);
      const titleJson = title.body as JobTitleJson;
      expect(titleJson).toMatchObject({ isActive: true, inUse: false });

      const auth = await tenantAuth(business.adminUserId, business.businessId);
      const list = await http().get('/api/v1/team/job-titles').set(auth);
      expect(list.status).toBe(200);
      const listed = (list.body as { id: string; roleTemplateId: string }[]).find(
        (item) => item.id === titleJson.id,
      );
      expect(listed?.roleTemplateId).toBe(template.id);

      const invited = await http().post('/api/v1/team/invitations').set(auth).send({
        phone: randomTestPhone(),
        fullName: 'Nərmin Quliyeva',
        roleId: copy?.id,
        jobTitleId: titleJson.id,
      });
      expect(invited.status, JSON.stringify(invited.body)).toBe(201);

      const audits = await platformRows<{ action: string; business_id: string | null }>(
        'select action, business_id from audit_logs where target_id = $1 order by id',
        [template.id],
      );
      expect(audits).toEqual([{ action: 'role_template.created', business_id: null }]);
    });

    it('US-012-AC1 şablon izni yeteneğe uymazsa 422, kod ikinci kez kullanılamaz', async () => {
      const wrong = await createTemplate({
        capability: 'buyer',
        permissions: [{ code: 'catalog.manage', scope: 'all' }],
      });
      expect(wrong.status).toBe(422);
      expect(wrong.body).toMatchObject({ details: { permissions: ['capability'] } });

      const badScope = await createTemplate({
        permissions: [{ code: 'catalog.view', scope: 'branch' }],
      });
      expect(badScope.status).toBe(422);

      const first = await sellerTemplate();
      const again = await createTemplate({ code: first.code });
      expect(again.status).toBe(422);
      expect(again.body).toMatchObject({ details: { code: ['taken'] } });
    });

    it('US-012-AC1 unvanın şablonu başka yetenekte 422', async () => {
      const template = await sellerTemplate();
      const response = await createJobTitle(template.id, 'buyer');
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ details: { roleTemplateId: ['capability'] } });
    });
  });

  describe('US-012 AC2 şablon güncelleme', () => {
    it('US-012-AC2 şablon güncellenince sürüm artar, işletme kopyası aynı kalır', async () => {
      const business = await newTestBusiness('seller');
      const template = await sellerTemplate();
      const [copy] = await copyOf(business.businessId, template.id);

      const updated = await http()
        .patch(`/api/v1/admin/catalog/role-templates/${template.id}`)
        .set(content)
        .send({ permissions: [{ code: 'catalog.view', scope: 'all' }] });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body).toMatchObject({
        version: 2,
        permissions: [{ code: 'catalog.view', scope: 'all' }],
      });

      const [after] = await copyOf(business.businessId, template.id);
      expect(after).toEqual(copy);
      const perms = await platformRows<{ permission_code: string }>(
        'select permission_code from role_permissions where role_id = $1 order by 1',
        [copy?.id],
      );
      expect(perms.map((row) => row.permission_code)).toEqual(['catalog.view', 'orders.view']);

      // Yalnız ad değişikliği sürüm artırmaz (V2).
      const renamed = await http()
        .patch(`/api/v1/admin/catalog/role-templates/${template.id}`)
        .set(content)
        .send({ name: { ...NAME, az: 'Yeni ad' } });
      expect(renamed.body).toMatchObject({ version: 2 });
    });

    it('US-012-AC2 kopyası olan işletmenin aktif adminleri için role_template.version_published, admin olmayana yok', async () => {
      const business = await newTestBusiness('seller');
      const other = await newTestBusiness('buyer');
      const template = await sellerTemplate();
      const staff = await addMemberFromTemplate(business.businessId, 'seller_accountant');

      await http()
        .patch(`/api/v1/admin/catalog/role-templates/${template.id}`)
        .set(content)
        .send({ permissions: [{ code: 'orders.view', scope: 'all' }] })
        .expect(200);

      const events = await platformRows<{ payload: Record<string, unknown> }>(
        `select payload from outbox_events
          where type = 'role_template.version_published' and payload->>'templateId' = $1`,
        [template.id],
      );
      const recipients = events.map((event) => event.payload);
      expect(recipients).toContainEqual({
        templateId: template.id,
        version: 2,
        businessId: business.businessId,
        userId: business.adminUserId,
      });
      expect(recipients.some((item) => item.userId === staff)).toBe(false);
      expect(recipients.some((item) => item.businessId === other.businessId)).toBe(false);
    });

    it('US-012-AC2 işletme admin şablonunun izinleri değişmez 422', async () => {
      const [admin] = await platformRows<{ id: string }>(
        `select id from role_templates where code = 'seller_business_admin'`,
      );
      const response = await http()
        .patch(`/api/v1/admin/catalog/role-templates/${admin?.id ?? ''}`)
        .set(content)
        .send({ permissions: [{ code: 'catalog.view', scope: 'all' }] });
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ details: { permissions: ['admin_template_locked'] } });
    });
  });

  describe('US-012 AC3 unvan silme / pasifleştirme', () => {
    it('US-012-AC3 üyelikte kullanılan unvan DELETE 409 JOB_TITLE_IN_USE, PATCH isActive=false olur ve davet listesinden düşer', async () => {
      const business = await newTestBusiness('seller');
      const template = await sellerTemplate();
      const title = (await createJobTitle(template.id)).body as JobTitleJson;
      const [copy] = await copyOf(business.businessId, template.id);
      const memberId = randomUUID();
      await insertTestUser({ id: memberId, phone: randomTestPhone() });
      await platformRows(
        `insert into memberships (id, user_id, business_id, role_id, job_title_id)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), memberId, business.businessId, copy?.id, title.id],
      );

      const deleted = await http()
        .delete(`/api/v1/admin/catalog/job-titles/${title.id}`)
        .set(content);
      expect(deleted.status).toBe(409);
      expect(deleted.body).toMatchObject({ code: 'JOB_TITLE_IN_USE' });

      const deactivated = await http()
        .patch(`/api/v1/admin/catalog/job-titles/${title.id}`)
        .set(content)
        .send({ isActive: false });
      expect(deactivated.status).toBe(200);
      expect(deactivated.body).toMatchObject({ isActive: false, inUse: true });

      const auth = await tenantAuth(business.adminUserId, business.businessId);
      const list = await http().get('/api/v1/team/job-titles').set(auth);
      expect((list.body as { id: string }[]).some((item) => item.id === title.id)).toBe(false);
    });

    it('US-012-AC3 kullanılmayan unvan silinir', async () => {
      const template = await sellerTemplate();
      const title = (await createJobTitle(template.id)).body as JobTitleJson;
      await http().delete(`/api/v1/admin/catalog/job-titles/${title.id}`).set(content).expect(204);
      const rows = await platformRows('select 1 from job_titles where id = $1', [title.id]);
      expect(rows).toEqual([]);
      const listed = await http().get('/api/v1/admin/catalog/job-titles').set(content);
      expect((listed.body as { items: JobTitleJson[] }).items.some((t) => t.id === title.id)).toBe(
        false,
      );
    });
  });

  describe('Yetki', () => {
    it('F2.9 operations ve işletme kullanıcısı katalog uçlarında 403, super_admin 200', async () => {
      const operations = await h.bearer(await platformStaff('operations'));
      await http().get('/api/v1/admin/catalog/role-templates').set(operations).expect(403);
      const business = await newTestBusiness('seller');
      const tenant = await tenantAuth(business.adminUserId, business.businessId);
      await http().get('/api/v1/admin/catalog/job-titles').set(tenant).expect(403);
      const superAdmin = await h.bearer(await platformStaff('super_admin'));
      const list = await http().get('/api/v1/admin/catalog/role-templates').set(superAdmin);
      expect(list.status).toBe(200);
      const codes = (list.body as { items: TemplateJson[] }).items.map((item) => item.code);
      expect(codes).toContain('seller_business_admin');
    });
  });
});
