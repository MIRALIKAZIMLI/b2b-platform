// F1.10 entegrasyon: yükleme URL'si → yerel depoya PUT → complete (SF-09). Gerçek PostgreSQL
// (app_user, RLS), yerel disk deposu (ADR-0023), FixedClock.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileStorage, stagingKeyOf } from '../../../core/ports/file-storage';
import { FilesService } from '../files.service';
import { XLSX_CONTENT_TYPE } from '../file-signature';
import {
  authHeaders,
  EXE_BYTES,
  fileRow,
  type FilesTestContext,
  PNG_BYTES,
  pathOf,
  putObject,
  requestUpload,
  sellerWithMembers,
  startFilesApp,
  type UploadTicket,
} from './files-fixtures';

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

const MB = 1024 * 1024;

describe('F1.10 dosya yükleme (entegrasyon)', () => {
  let ctx: FilesTestContext;

  beforeAll(async () => {
    ctx = await startFilesApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  async function owner() {
    const seller = await sellerWithMembers(ctx.app);
    const headers = await authHeaders(ctx.app, seller.tenant.userId, seller.tenant.businessId);
    return { ...seller, headers };
  }

  async function ticket(
    headers: Record<string, string>,
    body: { purpose: string; contentType: string; sizeBytes: number },
  ): Promise<UploadTicket> {
    const response = await requestUpload(ctx.app, headers, body);
    expect(response.status).toBe(200);
    return response.body as UploadTicket;
  }

  describe('F1.10-AC1: tür ve boyut sınırları (NFR-49)', () => {
    it("F1.10-AC1: 5 MB'ı aşan görsel → 422 FILE_INVALID; tam 5 MB kabul", async () => {
      const { headers } = await owner();
      const tooBig = await requestUpload(ctx.app, headers, {
        purpose: 'product_image',
        contentType: 'image/jpeg',
        sizeBytes: 5 * MB + 1,
      });
      expect(tooBig.status).toBe(422);
      expect((tooBig.body as ErrorJson).code).toBe('FILE_INVALID');

      const exact = await requestUpload(ctx.app, headers, {
        purpose: 'product_image',
        contentType: 'image/jpeg',
        sizeBytes: 5 * MB,
      });
      expect(exact.status).toBe(200);
    });

    it("F1.10-AC1: 10 MB'ı aşan xlsx → 422; tam 10 MB kabul", async () => {
      const { headers } = await owner();
      const tooBig = await requestUpload(ctx.app, headers, {
        purpose: 'import',
        contentType: XLSX_CONTENT_TYPE,
        sizeBytes: 10 * MB + 1,
      });
      expect(tooBig.status).toBe(422);
      expect((tooBig.body as ErrorJson).code).toBe('FILE_INVALID');

      const exact = await requestUpload(ctx.app, headers, {
        purpose: 'import',
        contentType: XLSX_CONTENT_TYPE,
        sizeBytes: 10 * MB,
      });
      expect(exact.status).toBe(200);
    });

    it('F1.10-AC1: izin verilmeyen tür → 422 (GIF görsel, PNG içe aktarma, xlsx logo)', async () => {
      const { headers } = await owner();
      for (const body of [
        { purpose: 'product_image', contentType: 'image/gif', sizeBytes: 100 },
        { purpose: 'import', contentType: 'image/png', sizeBytes: 100 },
        { purpose: 'logo', contentType: XLSX_CONTENT_TYPE, sizeBytes: 100 },
      ]) {
        const response = await requestUpload(ctx.app, headers, body);
        expect(response.status, body.contentType).toBe(422);
        expect((response.body as ErrorJson).code).toBe('FILE_INVALID');
      }
    });

    it('F1.10-AC1: bildirilenden farklı boyutta yükleme depoya kabul edilmez (403)', async () => {
      const { headers } = await owner();
      const upload = await ticket(headers, {
        purpose: 'product_image',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      const response = await putObject(ctx.app, upload, Buffer.concat([PNG_BYTES, PNG_BYTES]));
      expect(response.status).toBe(403);
    });
  });

  describe('SF-09 akışı', () => {
    it('geçerli PNG: pending → ready; public dosyada okuma adresi döner; anahtar yapısı', async () => {
      const { headers, tenant } = await owner();
      const upload = await ticket(headers, {
        purpose: 'product_image',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      expect((await fileRow(upload.fileId))?.status).toBe('pending');
      expect((await fileRow(upload.fileId))?.object_key).toBe(
        `${tenant.businessId}/product_image/${upload.fileId}.png`,
      );

      expect((await putObject(ctx.app, upload, PNG_BYTES)).status).toBe(204);
      const complete = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);

      expect(complete.status).toBe(200);
      expect(complete.body).toMatchObject({
        fileId: upload.fileId,
        status: 'ready',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      expect(typeof (complete.body as { url?: unknown }).url).toBe('string');
      expect((await fileRow(upload.fileId))?.status).toBe('ready');

      // Tekrar çağrı aynı sonucu döner.
      const again = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);
      expect(again.status).toBe(200);
    });

    it('yüklenmeden complete → 422, satır pending kalır', async () => {
      const { headers } = await owner();
      const upload = await ticket(headers, {
        purpose: 'logo',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      const response = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);

      expect(response.status).toBe(422);
      expect((await fileRow(upload.fileId))?.status).toBe('pending');
    });

    it("izin purpose'a göre: Satış Temsilcisi ürün görseli yükleyemez (403)", async () => {
      const { tenant, repUserId } = await owner();
      const headers = await authHeaders(ctx.app, repUserId, tenant.businessId);
      const response = await requestUpload(ctx.app, headers, {
        purpose: 'product_image',
        contentType: 'image/png',
        sizeBytes: 100,
      });

      expect(response.status).toBe(403);
    });

    it('X-Business-Id yoksa 422, JWT yoksa 401', async () => {
      const { headers } = await owner();
      const body = { purpose: 'logo', contentType: 'image/png', sizeBytes: 100 };
      const noBusiness = await http()
        .post('/api/v1/files/upload-url')
        .set({ Authorization: headers.Authorization ?? '' })
        .send(body);
      const noAuth = await http().post('/api/v1/files/upload-url').send(body);

      expect(noBusiness.status).toBe(422);
      expect(noAuth.status).toBe(401);
    });
  });

  describe('F1.10-AC2: içerik türü yalan söyleyen dosya', () => {
    it('F1.10-AC2: .png diye yüklenen EXE → complete 422 FILE_INVALID, nesne silinir, satır rejected', async () => {
      const { headers } = await owner();
      const upload = await ticket(headers, {
        purpose: 'dispute_photo',
        contentType: 'image/png',
        sizeBytes: EXE_BYTES.length,
      });
      expect((await putObject(ctx.app, upload, EXE_BYTES)).status).toBe(204);
      const row = await fileRow(upload.fileId);
      const storage = ctx.app.get(FileStorage);
      const staging = stagingKeyOf(row?.object_key ?? '');
      expect(await storage.head(staging)).not.toBeNull();

      const response = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);

      expect(response.status).toBe(422);
      expect((response.body as ErrorJson).code).toBe('FILE_INVALID');
      expect(await storage.head(staging)).toBeNull();
      expect(await storage.head(row?.object_key ?? '')).toBeNull();
      expect((await fileRow(upload.fileId))?.status).toBe('rejected');

      // Reddedilen dosya bir daha tamamlanamaz.
      const again = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);
      expect(again.status).toBe(422);
    });
  });

  describe("F1.10-AC2: yükleme URL'si tek yazımlık (PR #28 M1)", () => {
    it("F1.10-AC2: ready dosyanın yükleme URL'si ikinci kez kullanılamaz (içerik değişmez)", async () => {
      const { headers } = await owner();
      const upload = await ticket(headers, {
        purpose: 'product_image',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      expect(upload.headers['If-None-Match']).toBe('*');
      expect((await putObject(ctx.app, upload, PNG_BYTES)).status).toBe(204);
      const complete = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);
      expect(complete.status).toBe(200);

      // Aynı boyutta EXE ile aynı URL: istemci yalnızca private geçici anahtara yazabilir
      // (F1.10b); doğrulanmış kalıcı nesne değişmez.
      const sameSizeExe = Buffer.concat([
        EXE_BYTES,
        Buffer.alloc(PNG_BYTES.length - EXE_BYTES.length),
      ]);
      expect(sameSizeExe.length).toBe(PNG_BYTES.length);
      await putObject(ctx.app, upload, sameSizeExe);

      const row = await fileRow(upload.fileId);
      const head = await ctx.app.get(FileStorage).readRange(row?.object_key ?? '', 8);
      expect(head).toEqual(PNG_BYTES.subarray(0, 8));
    });

    it('F1.10-AC2: complete öncesi de ikinci yazım reddedilir', async () => {
      const { headers } = await owner();
      const upload = await ticket(headers, {
        purpose: 'logo',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      expect((await putObject(ctx.app, upload, PNG_BYTES)).status).toBe(204);
      expect((await putObject(ctx.app, upload, PNG_BYTES)).status).toBe(403);
    });
  });

  describe('F1.10b: yükleme önce private geçici anahtara', () => {
    it("F1.10b: yükleme URL'si private geçici anahtarı gösterir; complete öncesi public nesne yok", async () => {
      const { headers } = await owner();
      const upload = await ticket(headers, {
        purpose: 'product_image',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      const token = new URL(upload.uploadUrl).searchParams.get('token') ?? '';
      const payload = JSON.parse(
        Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'),
      ) as { key: string };
      const row = await fileRow(upload.fileId);
      expect(payload.key).toBe(stagingKeyOf(row?.object_key ?? ''));

      expect((await putObject(ctx.app, upload, PNG_BYTES)).status).toBe(204);
      const storage = ctx.app.get(FileStorage);
      expect(await storage.head(row?.object_key ?? '')).toBeNull();

      const complete = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);
      expect(complete.status).toBe(200);
      expect(await storage.head(row?.object_key ?? '')).toEqual({
        size: PNG_BYTES.length,
        contentType: 'image/png',
      });
      expect(await storage.head(payload.key)).toBeNull();
    });

    it("F1.10b: reddedilen public dosya, URL ile yeniden yüklense de public'e çıkmaz", async () => {
      const { headers } = await owner();
      const upload = await ticket(headers, {
        purpose: 'logo',
        contentType: 'image/png',
        sizeBytes: EXE_BYTES.length,
      });
      await putObject(ctx.app, upload, EXE_BYTES);
      const rejected = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);
      expect(rejected.status).toBe(422);

      // Süre dolmadan aynı URL ile tekrar yükleme: yalnızca private geçici anahtar.
      await putObject(ctx.app, upload, EXE_BYTES);
      const row = await fileRow(upload.fileId);
      expect(row?.status).toBe('rejected');
      expect(await ctx.app.get(FileStorage).head(row?.object_key ?? '')).toBeNull();
    });
  });

  describe('F1.10-AC3: private dosya yalnızca süreli imzalı URL ile okunur', () => {
    it('F1.10-AC3: 5 dk içinde okunur, süre dolunca erişim yok (FixedClock)', async () => {
      const { headers, tenant } = await owner();
      const upload = await ticket(headers, {
        purpose: 'delivery_photo',
        contentType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      await putObject(ctx.app, upload, PNG_BYTES);
      const complete = await http().post(`/api/v1/files/${upload.fileId}/complete`).set(headers);
      expect(complete.status).toBe(200);
      // private dosyada yanıtta okuma adresi yok.
      expect((complete.body as { url?: string }).url).toBeUndefined();

      const url = await ctx.app.get(FilesService).getReadUrl(tenant, upload.fileId);
      const fresh = await http().get(pathOf(url));
      expect(fresh.status).toBe(200);
      expect(Buffer.from(fresh.body as Buffer).subarray(0, 8)).toEqual(PNG_BYTES.subarray(0, 8));

      ctx.clock.advance(5 * 60 * 1000);
      const expired = await http().get(pathOf(url));
      expect(expired.status).toBe(403);
    });

    it('F1.10-AC3: tamamlanmamış dosya için okuma adresi yok (404)', async () => {
      const { headers, tenant } = await owner();
      const upload = await ticket(headers, {
        purpose: 'import',
        contentType: XLSX_CONTENT_TYPE,
        sizeBytes: 100,
      });
      await expect(
        ctx.app.get(FilesService).getReadUrl(tenant, upload.fileId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
