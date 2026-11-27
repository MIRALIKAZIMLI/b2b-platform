// F3.5a kiracı izolasyonu (kart F3.5a-ISO; R32 "hata raporunda başka kiracının verisi olmaz").
// Uçlar HTTP üzerinden; veritabanı kuralları doğrudan SQL ile, uygulama rolü app_user (RLS'e tabi).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { FileStorage } from '../../../core/ports/file-storage';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  type Buyer,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  readyImportFile,
  runSeeds,
  type Seller,
  TestHttp,
  xlsx,
} from './imports-fixtures';

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

describe('F3.5a içe aktarma kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: TestHttp;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyer: Buyer;
  let jobA: string;
  let fileA: string;

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function headers(who: { admin: { userId: string }; businessId: string }) {
    return { ...(await h.bearer(who.admin.userId)), 'X-Business-Id': who.businessId };
  }

  beforeAll(async () => {
    await runSeeds();
    const region = await newRegion('F3.5a izolasyon');
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    buyer = await newBuyer(region);
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new TestHttp(app);
    fileA = await readyImportFile(app.get(FileStorage), sellerA, await xlsx(['sku'], []));
    const created = await h
      .http()
      .post('/api/v1/imports')
      .set(await headers(sellerA))
      .send({ type: 'products', fileId: fileA });
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    jobA = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('F3.5a-ISO başka satıcının işi 404, dosyası 404; perakendeci uçlarda 403', async () => {
    const b = await headers(sellerB);
    expect((await h.http().get(`/api/v1/imports/${jobA}`).set(b)).status).toBe(404);
    expect(
      (await h.http().post('/api/v1/imports').set(b).send({ type: 'products', fileId: fileA }))
        .status,
    ).toBe(404);
    const buyerSet = await headers(buyer);
    expect(
      (await h.http().get('/api/v1/imports/template?type=products').set(buyerSet)).status,
    ).toBe(403);
    expect((await h.http().get(`/api/v1/imports/${jobA}`).set(buyerSet)).status).toBe(403);
    expect(
      (
        await h
          .http()
          .post('/api/v1/imports')
          .set(buyerSet)
          .send({ type: 'products', fileId: fileA })
      ).status,
    ).toBe(403);
  });

  it('F3.5a-ISO veritabanı: B ve perakendeci A işini görmez, yazamaz; bileşik FK başka işletmenin dosyasını reddeder', async () => {
    const count = (tx: Tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from import_jobs where id = ${jobA}`);
    expect((await as(sellerB.businessId, count)).rows[0]?.n).toBe(0);
    expect((await as(buyer.businessId, count)).rows[0]?.n).toBe(0);
    expect((await as(sellerA.businessId, count)).rows[0]?.n).toBe(1);
    const update = await as(sellerB.businessId, (tx) =>
      tx.execute(sql`update import_jobs set status = 'validating' where id = ${jobA}`),
    );
    expect(update.rowCount).toBe(0);
    // B bağlamında A adına satır: RLS WITH CHECK (42501).
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into import_jobs (id, seller_id, type, file_id, can_write_prices,
                                                  locale, created_by)
                         values (${randomUUID()}, ${sellerA.businessId}, 'products', ${fileA}, false,
                                 '', ${sellerA.admin.userId})`),
        ),
      ),
    ).toBe('42501');
    // B kendi adına A'nın (işe bağlı olmayan) dosyasıyla: bileşik FK (23503).
    const freeA = await readyImportFile(app.get(FileStorage), sellerA, await xlsx(['sku'], []));
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into import_jobs (id, seller_id, type, file_id, can_write_prices,
                                                  locale, created_by)
                         values (${randomUUID()}, ${sellerB.businessId}, 'products', ${freeA}, false,
                                 '', ${sellerB.admin.userId})`),
        ),
      ),
    ).toBe('23503');
    // Silme izni yok (süre dolumu yalnız DEFINER fonksiyonuyla).
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) => tx.execute(sql`delete from import_jobs where id = ${jobA}`)),
      ),
    ).toBe('42501');
  });

  it('F3.5a-ISO platform yalnız okur; süre dolumu fonksiyonu kiracı ve platform bağlamında reddedilir', async () => {
    const platform = <T>(fn: (tx: Tx) => Promise<T>) =>
      withPlatformTx({ userId: randomUUID() }, fn);
    const seen = await platform((tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from import_jobs where id = ${jobA}`),
    );
    expect(seen.rows[0]?.n).toBe(1);
    const update = await platform((tx) =>
      tx.execute(sql`update import_jobs set status = 'failed' where id = ${jobA}`),
    );
    expect(update.rowCount).toBe(0);
    const expire = (tx: Tx) =>
      tx.execute(sql`select * from import_jobs_expire(now() + interval '1 year', 10)`);
    expect(await errorCode(() => as(sellerA.businessId, expire))).toBe('42501');
    expect(await errorCode(() => platform(expire))).toBe('42501');
    // Bağlamsız sistem işi çalışır; `uploaded` iş silinmez (yalnız `preview_ready`).
    await withSystemTx(expire);
    expect(
      (
        await as(sellerA.businessId, (tx) =>
          tx.execute<{ n: number }>(
            sql`select count(*)::int as n from import_jobs where id = ${jobA}`,
          ),
        )
      ).rows[0]?.n,
    ).toBe(1);
  });

  it('F3.5a-ISO bekçi: import_jobs ve files üzerindeki migrator politikaları sabit ve dar (Müfettiş 29 D1)', async () => {
    const policies = await platformRows<{
      tablename: string;
      policyname: string;
      cmd: string;
      roles: string[];
      qual: string | null;
      with_check: string | null;
    }>(
      `select tablename, policyname, cmd, roles::text[] as roles, qual, with_check from pg_policies
        where schemaname = 'public' and tablename in ('import_jobs', 'files')
          and 'migrator' = any(roles)
        order by tablename, policyname`,
    );
    expect(policies).toEqual([
      {
        tablename: 'files',
        policyname: 'files_definer_import_delete',
        cmd: 'DELETE',
        roles: ['migrator'],
        qual: "(purpose = 'import'::text)",
        with_check: null,
      },
      // 0021 (dizin kartları): migrator dosya okuması; 0037 yeni okuma politikası eklemez.
      {
        tablename: 'files',
        policyname: 'files_definer_select',
        cmd: 'SELECT',
        roles: ['migrator'],
        qual: 'true',
        with_check: null,
      },
      {
        tablename: 'import_jobs',
        policyname: 'import_jobs_definer_expire',
        cmd: 'DELETE',
        roles: ['migrator'],
        qual: "(status = 'preview_ready'::text)",
        with_check: null,
      },
      {
        tablename: 'import_jobs',
        policyname: 'import_jobs_definer_select',
        cmd: 'SELECT',
        roles: ['migrator'],
        qual: "(status = 'preview_ready'::text)",
        with_check: null,
      },
    ]);
  });
});
