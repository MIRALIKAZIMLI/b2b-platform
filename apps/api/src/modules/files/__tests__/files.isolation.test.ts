// F1.10-AC4 ★ kiracı izolasyonu: A işletmesi B'nin dosyasını tamamlayamaz ve okuma adresini alamaz
// (404); RLS satırı gizler. Platform dosyası (owner null) hiçbir kiracıya görünmez.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_INSUFFICIENT_PRIVILEGE, pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { insertTestUsers } from '../../../../test/users';
import { withPlatformTx, withTenantTx } from '../../../core/db';
import { FilesService } from '../files.service';
import {
  authHeaders,
  fileRow,
  type FilesTestContext,
  PNG_BYTES,
  putObject,
  requestUpload,
  sellerWithMembers,
  startFilesApp,
  type UploadTicket,
} from './files-fixtures';

describe('F1.10-AC4 files kiracı izolasyonu', () => {
  let ctx: FilesTestContext;

  beforeAll(async () => {
    ctx = await startFilesApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function readyFileOf(purpose: 'delivery_photo' | 'product_image') {
    const seller = await sellerWithMembers(ctx.app);
    const headers = await authHeaders(ctx.app, seller.tenant.userId, seller.tenant.businessId);
    const response = await requestUpload(ctx.app, headers, {
      purpose,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    const ticket = response.body as UploadTicket;
    await putObject(ctx.app, ticket, PNG_BYTES);
    return { ...seller, headers, fileId: ticket.fileId };
  }

  it("F1.10-AC4: A, B'nin fileId'si ile complete çağıramaz → 404; B'nin dosyası değişmez", async () => {
    const a = await readyFileOf('product_image');
    const b = await readyFileOf('product_image');

    const response = await request(ctx.app.getHttpServer())
      .post(`/api/v1/files/${b.fileId}/complete`)
      .set(a.headers);

    expect(response.status).toBe(404);
    expect((response.body as { code: string }).code).toBe('NOT_FOUND');
    expect((await fileRow(b.fileId))?.status).toBe('pending');
  });

  it("F1.10-AC4: A, B'nin private dosyası için okuma adresi alamaz → NOT_FOUND", async () => {
    const a = await readyFileOf('delivery_photo');
    const b = await readyFileOf('delivery_photo');
    const complete = await request(ctx.app.getHttpServer())
      .post(`/api/v1/files/${b.fileId}/complete`)
      .set(b.headers);
    expect(complete.status).toBe(200);

    const service = ctx.app.get(FilesService);
    await expect(service.getReadUrl(a.tenant, b.fileId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.getReadUrl(b.tenant, b.fileId)).resolves.toMatch(/^http/);
  });

  it("F1.10-AC4: RLS — A bağlamında B'nin satırı görünmez, güncellenemez, B adına eklenemez", async () => {
    const a = await readyFileOf('product_image');
    const b = await readyFileOf('product_image');

    await withTenantTx(a.tenant, async (tx) => {
      const seen = await tx.execute(sql`select id from files where id = ${b.fileId}`);
      expect(seen.rows).toHaveLength(0);
      const updated = await tx.execute(
        sql`update files set status = 'ready' where id = ${b.fileId} returning id`,
      );
      expect(updated.rows).toHaveLength(0);
      await expect(
        tx.execute(sql`
          insert into files (id, owner_business_id, purpose, bucket, object_key, content_type,
                             size_bytes, status, created_by)
          values (${randomUUID()}, ${b.tenant.businessId}, 'logo', 'public',
                  ${`${b.tenant.businessId}/logo/${randomUUID()}.png`}, 'image/png', 10,
                  'pending', ${a.tenant.userId})`),
      ).rejects.toThrow();
    });
  });

  it('F1.10-AC4: platform dosyası (owner null) kiracıya görünmez; platform bağlamında görünür', async () => {
    const a = await readyFileOf('product_image');
    const platform = { userId: randomUUID() };
    await insertTestUsers(platform.userId);
    const id = randomUUID();
    await withPlatformTx(platform, (tx) =>
      tx.execute(sql`
        insert into files (id, owner_business_id, purpose, bucket, object_key, content_type,
                           size_bytes, status, created_by)
        values (${id}, null, 'logo', 'public', ${`platform/logo/${id}.png`}, 'image/png', 10,
                'ready', ${platform.userId})`),
    );

    const tenantView = await withTenantTx(a.tenant, (tx) =>
      tx.execute(sql`select id from files where id = ${id}`),
    );
    const platformView = await withPlatformTx(platform, (tx) =>
      tx.execute(sql`select id from files where id = ${id}`),
    );
    expect(tenantView.rows).toHaveLength(0);
    expect(platformView.rows).toHaveLength(1);
  });

  it('F1.10-AC4: logo yalnızca işletmenin kendi dosyası olabilir (bileşik FK)', async () => {
    const a = await readyFileOf('product_image');
    const b = await readyFileOf('product_image');

    await expect(
      withTenantTx(a.tenant, (tx) =>
        tx.execute(
          sql`update businesses set logo_file_id = ${b.fileId} where id = ${a.tenant.businessId}`,
        ),
      ),
    ).rejects.toThrow();
    await withTenantTx(a.tenant, (tx) =>
      tx.execute(
        sql`update businesses set logo_file_id = ${a.fileId} where id = ${a.tenant.businessId}`,
      ),
    );
  });

  // Bekçi (review-guide T6): elle yazılan GRANT ve FK'lar.
  it('app_user files satırını silemez (DELETE izni yok)', async () => {
    const a = await readyFileOf('product_image');
    let code: string | undefined;
    try {
      await withTenantTx(a.tenant, (tx) =>
        tx.execute(sql`delete from files where id = ${a.fileId}`),
      );
    } catch (error) {
      code = pgErrorCode(error);
    }
    expect(code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('elle eklenen FK bağlantıları: owner → businesses, created_by → users, logo bileşik', async () => {
    const rows = await queryAsOwner<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint
        where conname in ('files_owner_business_id_businesses_id_fk',
                          'files_created_by_users_id_fk', 'businesses_logo_file_fk')
        order by conname`,
    );
    expect(rows.map((row) => row.conname)).toEqual([
      'businesses_logo_file_fk',
      'files_created_by_users_id_fk',
      'files_owner_business_id_businesses_id_fk',
    ]);
    expect(rows[0]?.def).toContain('REFERENCES files(owner_business_id, id)');
  });
});
