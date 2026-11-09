// F2.11b-AC10 kiracı izolasyonu (Müfettiş 16 M2): dizin arama ucu ve kart fonksiyonu. Toptancı A
// ile B'nin kapsamı birbirine karışmaz (hizmet bölgeleri, temsilci bölgeleri); kart fonksiyonu
// yalnız seller bağlamında; perakendeci üyesi uca erişemez; istemciden kimlik alınmaz.
import { randomUUID } from 'node:crypto';
import type { DirectoryBuyer } from '@b2b/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { withTenantTx } from '../../../core/db';
import { BuyerDirectoryIndex } from '../../../core/ports/buyer-directory-index';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { DirectoryIndexer } from '../directory-indexer';
import { DirectoryRebuildTracker } from '../directory-rebuild-tracker';
import { DirectoryRepository } from '../directory.repository';
import { FakeBuyerDirectoryIndex } from './fake-index';
import { platformRows, runSeeds } from './fixtures';
import { addMember, newActivityType, newBuyer, newRegion, newSeller } from './search-fixtures';

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

describe('F2.11b dizin kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const index = new FakeBuyerDirectoryIndex();
  const repository = new DirectoryRepository();
  let indexer: DirectoryIndexer;
  let cityA: string;
  let districtA1: string;
  let cityB: string;
  let grocery: string;
  let sellerA: { businessId: string; adminUserId: string };
  let sellerB: { businessId: string; adminUserId: string };
  const tag = randomUUID().slice(0, 6);
  const name = (label: string) => `${label} ${tag}`;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        { provide: BuyerDirectoryIndex, useValue: index },
      ],
    });
    indexer = new DirectoryIndexer(index, repository, new DirectoryRebuildTracker(redis.client));
    cityA = await newRegion('Şəhər A');
    districtA1 = await newRegion('Rayon A1', cityA);
    cityB = await newRegion('Şəhər B');
    grocery = await newActivityType('Ərzaq');
    sellerA = await newSeller(cityA, [cityA]);
    sellerB = await newSeller(cityB, [cityB]);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function buyer(legalName: string, regionId: string, listed = true): Promise<string> {
    const id = await newBuyer({ legalName, regionId, activityTypeId: grocery, listed });
    await indexer.refresh([id]);
    return id;
  }

  const search = async (
    query: Record<string, string>,
    who: { userId: string; businessId: string },
  ) => {
    const signed = await app
      .get(TokenService)
      .signAccess({ userId: who.userId, sessionId: randomUUID() });
    return request(app.getHttpServer())
      .get('/api/v1/directory/buyers')
      .query(query)
      .set({ Authorization: `Bearer ${signed.token}`, 'X-Business-Id': who.businessId });
  };

  const ids = (body: unknown) => (body as { items: DirectoryBuyer[] }).items.map((item) => item.id);
  const admin = (seller: { businessId: string; adminUserId: string }) => ({
    userId: seller.adminUserId,
    businessId: seller.businessId,
  });

  it("F2.11b-AC10 toptancı A'nın filtresiz araması B'nin hizmet bölgelerini kullanmaz", async () => {
    const inA = await buyer(name('A Market'), districtA1);
    const inB = await buyer(name('B Market'), cityB);

    expect(ids((await search({ q: tag }, admin(sellerA))).body)).toEqual([inA]);
    expect(ids((await search({ q: tag }, admin(sellerB))).body)).toEqual([inB]);
  });

  it('F2.11b-AC10 temsilcinin kapsamı yalnız kendi işletmesindeki membership_regions satırı', async () => {
    const inA = await buyer(`${name('Rep')} A`, districtA1);
    const inB = await buyer(`${name('Rep')} B`, cityB);
    const repA = await addMember(sellerA.businessId, 'seller_sales_rep', {
      regionIds: [districtA1],
    });
    const repB = await addMember(sellerB.businessId, 'seller_sales_rep', { regionIds: [cityB] });

    const asRepA = { userId: repA, businessId: sellerA.businessId };
    expect(ids((await search({ q: name('Rep') }, asRepA)).body)).toEqual([inA]);
    expect(ids((await search({ q: name('Rep'), regionId: cityB }, asRepA)).body)).toEqual([]);
    expect(
      ids(
        (await search({ q: name('Rep') }, { userId: repB, businessId: sellerB.businessId })).body,
      ),
    ).toEqual([inB]);
    // B'nin temsilcisi A'nın başlığıyla gelemez (üye değil).
    expect(
      (await search({ q: tag }, { userId: repB, businessId: sellerA.businessId })).status,
    ).toBe(403);
  });

  it('F2.11b-AC10 kart fonksiyonu yalnız seller bağlamında, ≤20 kimlik; buyer üye 403', async () => {
    const buyerId = await buyer(name('Bağlam'), districtA1);
    const cards = (businessId: string, list: string[]) =>
      withTenantTx({ businessId, userId: null }, (tx) => repository.cardsTx(tx, list));

    expect(await errorCode(() => cards(buyerId, [buyerId]))).toBe('42501');
    const tooMany = Array.from({ length: 21 }, () => randomUUID());
    expect(await errorCode(() => cards(sellerA.businessId, tooMany))).toBe('22023');
    expect((await cards(sellerA.businessId, [buyerId])).map((card) => card.id)).toEqual([buyerId]);

    // T6 bekçisi: `files` için yalnız migrator'a açık okuma politikası ve sınıf `rls:T,D` (0021).
    const policies = await platformRows<{ policyname: string; cmd: string; roles: string }>(
      `select policyname, cmd, array_to_string(roles, ',') as roles from pg_policies
        where tablename = 'files' order by policyname`,
    );
    expect(policies.find((p) => p.policyname === 'files_definer_select')).toEqual({
      policyname: 'files_definer_select',
      cmd: 'SELECT',
      roles: 'migrator',
    });
    const [comment] = await platformRows<{ c: string }>(
      "select obj_description('public.files'::regclass) as c",
    );
    expect(comment?.c).toBe('rls:T,D');

    // Perakendeci üyesi uca erişemez (izin `directory.search`, yetenek seller).
    const buyerAdmin = await addMember(buyerId, 'buyer_business_admin');
    expect((await search({}, { userId: buyerAdmin, businessId: buyerId })).status).toBe(403);

    // Uç istemciden kimlik almaz: `id` parametresi yok sayılır.
    const hidden = await buyer(name('Gizli Kimlik'), districtA1, false);
    const probe = await search({ q: tag, id: hidden }, admin(sellerA));
    expect(ids(probe.body)).not.toContain(hidden);
  });
});
