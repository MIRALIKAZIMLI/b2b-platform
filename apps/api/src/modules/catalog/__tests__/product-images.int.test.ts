// F3.4a entegrasyon (US-030 AC3; kart K1–K12, R34): görsel uçları HTTP üzerinden (app_user, RLS);
// küçültme işi worker'daki sınıfla doğrudan çalıştırılır (yerel disk deposu, ADR-0023).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { SystemClock } from '../../../core/clock';
import { FileStorage } from '../../../core/ports/file-storage';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { SettingsService } from '../../settings';
import { ResizeImageJob } from '../jobs/resize-image.job';
import { renditionKey } from '../product-image-keys';
import { ProductImagesRepository } from '../product-images.repository';
import {
  newRegion,
  newSeller,
  platformRows,
  productBody,
  runSeeds,
  type SeedCategories,
  type Seller,
  seedCategories,
  TestHttp,
} from './product-fixtures';

interface ImageJson {
  id: string;
  sortOrder: number;
  status: string;
  urls: { thumb: string; medium: string; large: string } | null;
}

interface ProductJson {
  id: string;
  status: string;
  images: ImageJson[];
}

const silentLog = { warn: () => undefined };

describe('F3.4a ürün görselleri (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let cats: SeedCategories;
  let seller: Seller;
  let other: Seller;
  let storage: FileStorage;
  let job: ResizeImageJob;
  let png: Buffer;

  async function headers(who: Seller = seller) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  async function newProduct(who: Seller = seller): Promise<ProductJson> {
    const response = await h
      .http()
      .post('/api/v1/products')
      .set(await headers(who))
      .send(productBody(cats.child));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as ProductJson;
  }

  async function getProduct(id: string): Promise<ProductJson> {
    const response = await h
      .http()
      .get(`/api/v1/products/${id}`)
      .set(await headers());
    expect(response.status).toBe(200);
    return response.body as ProductJson;
  }

  /** F1.10 akışının sonucu: `ready` dosya satırı + depoda orijinal nesne. */
  async function readyFile(
    options: {
      who?: Seller;
      body?: Buffer;
      purpose?: string;
      status?: string;
    } = {},
  ): Promise<{ fileId: string; objectKey: string }> {
    const who = options.who ?? seller;
    const body = options.body ?? png;
    const purpose = options.purpose ?? 'product_image';
    const fileId = randomUUID();
    const objectKey = `${who.businessId}/${purpose}/${fileId}.png`;
    await platformRows(
      `insert into files (id, owner_business_id, purpose, bucket, object_key, content_type,
                          size_bytes, status, created_by)
       values ($1, $2, $3, 'public', $4, 'image/png', $5, $6, $7)`,
      [
        fileId,
        who.businessId,
        purpose,
        objectKey,
        body.length,
        options.status ?? 'ready',
        who.admin.userId,
      ],
    );
    await storage.put(objectKey, body, 'image/png');
    return { fileId, objectKey };
  }

  async function addImage(productId: string, fileId: string, who: Seller = seller) {
    return await h
      .http()
      .post(`/api/v1/products/${productId}/images`)
      .set(await headers(who))
      .send({ fileId });
  }

  async function addOk(productId: string, body?: Buffer): Promise<ImageJson & { key: string }> {
    const file = await readyFile(body === undefined ? {} : { body });
    const response = await addImage(productId, file.fileId);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return { ...(response.body as ImageJson), key: file.objectKey };
  }

  /** Yerel depo adresi (`/api/v1/dev/storage?token=`) uygulama üzerinden okunur. */
  async function fetchImage(url: string): Promise<Buffer> {
    const parsed = new URL(url);
    const response = await h
      .http()
      .get(`${parsed.pathname}${parsed.search}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      });
    expect(response.status).toBe(200);
    return response.body as Buffer;
  }

  function details(response: { body: unknown }): Record<string, string[]> {
    return (response.body as { details?: Record<string, string[]> }).details ?? {};
  }

  beforeAll(async () => {
    await runSeeds();
    const regionId = await newRegion('F3.4a görsel');
    cats = await seedCategories();
    seller = await newSeller(regionId);
    other = await newSeller(regionId);
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    storage = app.get(FileStorage);
    job = new ResizeImageJob(
      new ProductImagesRepository(),
      storage,
      app.get(SettingsService),
      new SystemClock(),
    );
    png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#10b981' } })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F3.4a-AC3 ready dosya ürüne eklenir (processing + outbox); iş üç boyutu üretir, yanıtta üç adres', async () => {
    const product = await newProduct();
    expect(product.images).toEqual([]);
    const image = await addOk(product.id);
    expect(image).toMatchObject({ sortOrder: 0, status: 'processing', urls: null });

    const owner = await connectAsMigrator();
    try {
      const events = await owner.query<{ payload: Record<string, string>; business_ids: string[] }>(
        `select payload, business_ids from outbox_events
          where type = 'product_image.added' and aggregate_id = $1`,
        [product.id],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0]?.payload).toEqual({ imageId: image.id, productId: product.id });
      expect(events.rows[0]?.business_ids).toEqual([seller.businessId]);
    } finally {
      await owner.end();
    }

    const before = await getProduct(product.id);
    expect(before.images.map((item) => [item.id, item.status, item.urls])).toEqual([
      [image.id, 'processing', null],
    ]);

    expect(await job.run({ businessId: seller.businessId, imageId: image.id }, silentLog)).toBe(
      'ready',
    );
    // Tekrar gelen olay etkisiz (K11).
    expect(await job.run({ businessId: seller.businessId, imageId: image.id }, silentLog)).toBe(
      'skipped',
    );
    for (const [name, width] of [
      ['thumb', 200],
      ['medium', 800],
      ['large', 1600],
    ] as const) {
      const key = renditionKey(image.key, name);
      const stored = await storage.readRange(key, 10_000_000);
      expect((await sharp(stored).metadata()).width, name).toBe(width);
    }

    const after = await getProduct(product.id);
    const [ready] = after.images;
    expect(ready?.status).toBe('ready');
    // Adresler okunabilir: her boyut kendi genişliğinde WebP döner.
    for (const [name, width] of [
      ['thumb', 200],
      ['medium', 800],
      ['large', 1600],
    ] as const) {
      const body = await fetchImage(ready?.urls?.[name] ?? '');
      expect(await sharp(body).metadata(), name).toMatchObject({ format: 'webp', width });
    }
    expect(JSON.stringify(after.images)).not.toContain(
      Buffer.from(image.key).toString('base64url'),
    );

    const list = await h
      .http()
      .get('/api/v1/products')
      .set(await headers());
    const item = (list.body as { items: { id: string; thumbUrl: string | null }[] }).items.find(
      (row) => row.id === product.id,
    );
    const thumb = await fetchImage(item?.thumbUrl ?? '');
    expect((await sharp(thumb).metadata()).width).toBe(200);
  });

  it('F3.4a-MAX ürün başına 8 görsel; 9. görsel 422 limit; eşzamanlı eklemede sınır aşılmaz', async () => {
    const product = await newProduct();
    for (let index = 0; index < 6; index++) await addOk(product.id);
    const files = await Promise.all([readyFile(), readyFile(), readyFile()]);
    const responses = await Promise.all(files.map((file) => addImage(product.id, file.fileId)));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 201, 422]);
    const rejected = responses.find((response) => response.status === 422);
    expect(rejected === undefined ? {} : details(rejected)).toEqual({ fileId: ['limit'] });
    const images = (await getProduct(product.id)).images;
    expect(images).toHaveLength(8);
    expect(images.map((image) => image.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('F3.4a-FILE başka amaçlı, ready olmayan, kullanımda dosya 422; başka işletmenin dosyası ve ürünü 404', async () => {
    const product = await newProduct();
    const logo = await readyFile({ purpose: 'logo' });
    const logoResponse = await addImage(product.id, logo.fileId);
    expect(logoResponse.status).toBe(422);
    expect(details(logoResponse)).toEqual({ fileId: ['invalid'] });

    const pending = await readyFile({ status: 'pending' });
    expect(details(await addImage(product.id, pending.fileId))).toEqual({ fileId: ['invalid'] });

    const used = await addOk(product.id);
    const second = await newProduct();
    const usedFile = await platformRows<{ file_id: string }>(
      'select file_id from product_images where id = $1',
      [used.id],
    );
    const inUse = await addImage(second.id, usedFile[0]?.file_id ?? '');
    expect(inUse.status).toBe(422);
    expect(details(inUse)).toEqual({ fileId: ['in_use'] });

    const foreign = await readyFile({ who: other });
    expect((await addImage(product.id, foreign.fileId)).status).toBe(404);
    expect((await addImage(randomUUID(), (await readyFile()).fileId)).status).toBe(404);
    const otherProduct = await newProduct(other);
    expect((await addImage(otherProduct.id, (await readyFile()).fileId)).status).toBe(404);
    const invalidBody = await h
      .http()
      .post(`/api/v1/products/${product.id}/images`)
      .set(await headers())
      .send({ fileId: 'x', extra: true });
    expect(invalidBody.status).toBe(422);
  });

  it('F3.4a-R34 bozuk veya piksel sınırını aşan görsel failed olur; ürün okunur ve düzenlenir', async () => {
    const product = await newProduct();
    const broken = await addOk(product.id, Buffer.concat([png.subarray(0, 64), Buffer.alloc(512)]));
    expect(await job.run({ businessId: seller.businessId, imageId: broken.id }, silentLog)).toBe(
      'failed',
    );

    const big = await addOk(product.id);
    const strict = new ResizeImageJob(
      new ProductImagesRepository(),
      storage,
      { get: () => Promise.resolve(1) } as unknown as SettingsService,
      new SystemClock(),
    );
    expect(await strict.run({ businessId: seller.businessId, imageId: big.id }, silentLog)).toBe(
      'failed',
    );

    const view = await getProduct(product.id);
    expect(view.images.map((image) => [image.status, image.urls])).toEqual([
      ['failed', null],
      ['failed', null],
    ]);
    const patch = await h
      .http()
      .patch(`/api/v1/products/${product.id}`)
      .set(await headers())
      .send({ name: { az: 'Yeni ad' } });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
  });

  it('F3.4a-ORD sıra tam listeyle değişir; eksik/fazla 422; silme 204; arşivdeki ürün 409', async () => {
    const product = await newProduct();
    const a = await addOk(product.id);
    const b = await addOk(product.id);
    const c = await addOk(product.id);
    const order = async (imageIds: string[]) =>
      await h
        .http()
        .put(`/api/v1/products/${product.id}/images/order`)
        .set(await headers())
        .send({ imageIds });

    expect((await order([c.id, a.id, b.id])).status).toBe(204);
    expect((await getProduct(product.id)).images.map((image) => image.id)).toEqual([
      c.id,
      a.id,
      b.id,
    ]);
    for (const wrong of [
      [c.id, a.id],
      [c.id, a.id, b.id, randomUUID()],
      [c.id, a.id, a.id],
    ]) {
      const response = await order(wrong);
      expect(response.status).toBe(422);
      expect(details(response)).toEqual({ imageIds: ['mismatch'] });
    }

    const remove = async (imageId: string) =>
      await h
        .http()
        .delete(`/api/v1/products/${product.id}/images/${imageId}`)
        .set(await headers());
    expect((await remove(a.id)).status).toBe(204);
    expect((await remove(a.id)).status).toBe(404);
    expect((await getProduct(product.id)).images.map((image) => image.id)).toEqual([c.id, b.id]);
    // Silinen görselin işi gelirse atlanır (K11).
    expect(await job.run({ businessId: seller.businessId, imageId: a.id }, silentLog)).toBe(
      'skipped',
    );

    const archive = await h
      .http()
      .patch(`/api/v1/products/${product.id}`)
      .set(await headers())
      .send({ status: 'archived' });
    expect(archive.status).toBe(200);
    expect((await addImage(product.id, (await readyFile()).fileId)).status).toBe(409);
    expect((await remove(b.id)).status).toBe(409);
    expect((await order([b.id, c.id])).status).toBe(409);
  });

  it('F3.4a-N2 products_definer_* politikaları yalnız migrator rolüne', async () => {
    const owner = await connectAsMigrator();
    try {
      const policies = await owner.query<{ policyname: string; roles: string[] }>(
        `select policyname, roles::text[] as roles from pg_policies
          where tablename = 'products' and policyname like 'products_definer_%'
          order by policyname`,
      );
      expect(policies.rows.map((row) => row.policyname)).toEqual([
        'products_definer_brand_clear',
        'products_definer_select',
      ]);
      for (const row of policies.rows) expect(row.roles, row.policyname).toEqual(['migrator']);
      const trigger = await owner.query<{ tgenabled: string }>(
        `select tgenabled from pg_trigger where tgname = 'brands_rejected_clear_products'`,
      );
      expect(trigger.rows).toEqual([{ tgenabled: 'O' }]);
    } finally {
      await owner.end();
    }
  });
});
