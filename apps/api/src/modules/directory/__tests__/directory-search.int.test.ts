// F2.11b: dizin arama ucu (US-019 AC1–AC3, AC5–AC6; US-020 AC1–AC2; US-007 AC2, AC4, AC6;
// Müfettiş 15 L1). İndeks bellek içi sahte porttur (Meilisearch filtre ifadesi ayrıca
// meili-buyer-directory-index.int.test.ts'te). Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import { DIRECTORY_BUYER_KEYS, type DirectoryBuyer } from '@b2b/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { withTenantTx } from '../../../core/db';
import { BuyerDirectoryIndex } from '../../../core/ports/buyer-directory-index';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import { DirectoryIndexer } from '../directory-indexer';
import { DirectoryRebuildTracker } from '../directory-rebuild-tracker';
import { DirectoryRepository } from '../directory.repository';
import { FakeBuyerDirectoryIndex } from './fake-index';
import { platformRows, runSeeds } from './fixtures';
import {
  addMember,
  type BuyerInput,
  newActivityType,
  newBuyer,
  newRegion,
  newSeller,
} from './search-fixtures';

interface SearchJson {
  readonly items: DirectoryBuyer[];
  readonly nextCursor: string | null;
  readonly emptyReason: string | null;
}

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

function randomVoen(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `${digits}2`;
}

describe('F2.11b perakendeci dizini arama ucu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  const index = new FakeBuyerDirectoryIndex();
  const repository = new DirectoryRepository();
  let indexer: DirectoryIndexer;

  // Bölge ağacı: şehir A (ilçe A1, A2), şehir B. Toptancının hizmet bölgesi A.
  let cityA: string;
  let districtA1: string;
  let districtA2: string;
  let cityB: string;
  let grocery: string;
  let pharmacy: string;
  let seller: { businessId: string; adminUserId: string };
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
    districtA2 = await newRegion('Rayon A2', cityA);
    cityB = await newRegion('Şəhər B');
    grocery = await newActivityType('Ərzaq');
    pharmacy = await newActivityType('Aptek');
    seller = await newSeller(cityA, [cityA]);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  async function buyer(input: Partial<BuyerInput> & { readonly legalName: string }) {
    const id = await newBuyer({ regionId: districtA1, activityTypeId: grocery, ...input });
    await indexer.refresh([id]);
    return id;
  }

  async function auth(userId: string, businessId: string): Promise<Record<string, string>> {
    const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId };
  }

  const search = async (
    query: Record<string, string | string[]>,
    who: { userId: string; businessId: string } = {
      userId: seller.adminUserId,
      businessId: seller.businessId,
    },
  ) =>
    request(app.getHttpServer())
      .get('/api/v1/directory/buyers')
      .query(query)
      .set(await auth(who.userId, who.businessId));

  const ids = (body: unknown) => (body as SearchJson).items.map((item) => item.id);

  it('F2.11b-AC1 bölge, faaliyet, doğrulanmış ve ünvan filtreleri; sayfa ≤20 ve nextCursor', async () => {
    const a = await buyer({ legalName: name('Alma Market'), verified: true });
    const b = await buyer({ legalName: name('Bəhər Aptek'), activityTypeId: pharmacy });
    const c = await buyer({ legalName: name('Cənnət Market'), regionId: districtA2 });

    const byActivity = await search({ activityTypeId: pharmacy, q: tag });
    expect(byActivity.status, JSON.stringify(byActivity.body)).toBe(200);
    expect(ids(byActivity.body)).toEqual([b]);

    expect(ids((await search({ verified: 'true', q: tag })).body)).toEqual([a]);
    expect(ids((await search({ regionId: districtA2, q: tag })).body)).toEqual([c]);
    // Şehir filtresi ilçelerini de kapsar.
    expect(ids((await search({ regionId: cityA, q: tag })).body)).toEqual([a, b, c]);
    expect(ids((await search({ q: `Cənnət Market ${tag}` })).body)).toEqual([c]);

    const first = await search({ q: tag, limit: '2' });
    expect(ids(first.body)).toEqual([a, b]);
    const cursor = (first.body as SearchJson).nextCursor;
    expect(cursor).not.toBeNull();
    const second = await search({ q: tag, limit: '2', cursor: cursor ?? '' });
    expect(ids(second.body)).toEqual([c]);
    expect((second.body as SearchJson).nextCursor).toBeNull();

    expect((await search({ limit: '21' })).status).toBe(422);
  });

  it('F2.11b-AC2 filtre yoksa yalnız hizmet bölgeleri; hizmet bölgesi yoksa boş + neden', async () => {
    const inside = await buyer({ legalName: name('İçəri') });
    const outside = await buyer({ legalName: name('Kənar'), regionId: cityB });

    const result = await search({ q: tag });
    expect(ids(result.body)).toContain(inside);
    expect(ids(result.body)).not.toContain(outside);
    // Açık bölge filtresi hizmet bölgesi dışını da arar.
    expect(ids((await search({ regionId: cityB, q: tag })).body)).toEqual([outside]);

    const bare = await newSeller(cityA);
    const empty = await search({}, { userId: bare.adminUserId, businessId: bare.businessId });
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ items: [], nextCursor: null, emptyReason: 'no_service_areas' });
  });

  it('F2.11b-AC3 temsilci yalnız atandığı bölgeleri görür (tam eşleşme dahil, K3)', async () => {
    const voenA2 = randomVoen();
    const inA1 = await buyer({ legalName: `${name('Rep')} A1` });
    const inA2 = await buyer({
      legalName: `${name('Rep')} A2`,
      regionId: districtA2,
      voen: voenA2,
    });
    const repUser = await addMember(seller.businessId, 'seller_sales_rep', {
      regionIds: [districtA1],
    });
    const rep = { userId: repUser, businessId: seller.businessId };

    const own = await search({ q: name('Rep') }, rep);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(ids(own.body)).toEqual([inA1]);
    expect(ids((await search({ regionId: districtA2, q: tag }, rep)).body)).toEqual([]);
    expect(ids((await search({ regionId: cityA, q: name('Rep') }, rep)).body)).toEqual([inA1]);
    // Bölge dışındaki perakendeci tam VÖEN ile de bulunmaz; admin bulur.
    expect(ids((await search({ voen: voenA2 }, rep)).body)).toEqual([]);
    expect(ids((await search({ voen: voenA2 })).body)).toEqual([inA2]);

    const noRegion = await addMember(seller.businessId, 'seller_sales_rep');
    const empty = await search({}, { userId: noRegion, businessId: seller.businessId });
    expect(empty.body).toEqual({ items: [], nextCursor: null, emptyReason: 'no_assigned_regions' });
  });

  it('F2.11b-AC5 kullanıcı başına dakikada 61. arama 429 + Retry-After', async () => {
    const userId = await addMember(seller.businessId, 'seller_sales_manager');
    const who = { userId, businessId: seller.businessId };
    const headers = await auth(userId, seller.businessId);
    for (let i = 0; i < 60; i += 1) {
      const ok = await request(app.getHttpServer())
        .get('/api/v1/directory/buyers')
        .query({ q: tag })
        .set(headers);
      expect(ok.status).toBe(200);
    }
    const limited = await search({ voen: randomVoen() }, who);
    expect(limited.status).toBe(429);
    expect((limited.body as { code: string }).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // Başka kullanıcı etkilenmez.
    expect((await search({ q: tag })).status).toBe(200);
  });

  it('F2.11b-AC6 askıya alınmış/pasif ya da gizlenmiş perakendeci bayat indekste kalsa da dönmez', async () => {
    const suspended = await buyer({ legalName: name('Askı') });
    const hidden = await buyer({ legalName: name('Gizli') });
    expect(index.docs.has(suspended)).toBe(true);
    // İndeks güncellenmeden DB değişir (olay henüz işlenmedi).
    await platformRows("update businesses set status = 'suspended' where id = $1", [suspended]);
    await platformRows(
      'update buyer_profiles set listed_in_directory = false where business_id = $1',
      [hidden],
    );
    const result = await search({ q: tag });
    expect(ids(result.body)).not.toContain(suspended);
    expect(ids(result.body)).not.toContain(hidden);
  });

  it('F2.11b-AC7 tam telefon (3 numara) ve VÖEN dizinde gizliyi de bulur; kısmi değer bulmaz', async () => {
    const voen = randomVoen();
    const businessPhone = randomTestPhone();
    const personalPhone = randomTestPhone();
    const adminPhone = randomTestPhone();
    const id = await buyer({
      legalName: name('Tam Eşleşmə'),
      listed: false,
      voen,
      businessPhone: `${businessPhone.slice(0, 4)} ${businessPhone.slice(4, 6)} ${businessPhone.slice(6)}`,
      personalPhone,
      adminPhone,
    });
    expect(index.docs.has(id)).toBe(false);

    for (const phone of [businessPhone, personalPhone, adminPhone]) {
      const found = await search({ phone });
      expect(found.status, JSON.stringify(found.body)).toBe(200);
      expect(ids(found.body)).toEqual([id]);
    }
    expect(ids((await search({ voen })).body)).toEqual([id]);
    // Dizinde gizli: filtreli aramada yok.
    expect(ids((await search({ q: tag })).body)).not.toContain(id);

    expect(ids((await search({ phone: personalPhone.slice(0, 10) })).body)).toEqual([]);
    expect((await search({ voen: voen.slice(0, 9) })).status).toBe(422);
    expect((await search({ phone: personalPhone, voen })).status).toBe(422);
    expect((await search({ phone: personalPhone, q: 'x' })).status).toBe(422);
  });

  it('F2.11b-AC8 kişisel telefon/e-posta yalnız showPersonalContact açıkken; logo yalnız showLogo', async () => {
    const contact = { personalPhone: randomTestPhone(), email: 'shop@example.az' };
    const closed = await buyer({ legalName: name('Kapalı'), ...contact, logo: true });
    const open = await buyer({
      legalName: name('Açıq'),
      ...contact,
      logo: true,
      privacy: { show_personal_contact: true, show_logo: true, show_voen: true },
      voen: randomVoen(),
    });
    const result = await search({ q: tag });
    const items = (result.body as SearchJson).items;
    const closedItem = items.find((item) => item.id === closed);
    const openItem = items.find((item) => item.id === open);

    // Negatif: ayar kapalıyken kişisel iletişim, logo, VÖEN, adres, yetkili adı dönmez.
    expect(closedItem).toMatchObject({
      personalPhone: null,
      email: null,
      logoUrl: null,
      voen: null,
      addressLine: null,
      businessPhone: null,
      contactName: null,
    });
    expect(JSON.stringify(closedItem)).not.toContain(contact.personalPhone);
    expect(JSON.stringify(closedItem)).not.toContain(contact.email);

    expect(openItem?.personalPhone).toBe(contact.personalPhone);
    expect(openItem?.email).toBe(contact.email);
    expect(openItem?.logoUrl).toEqual(expect.any(String));
    expect(openItem?.voen).toMatch(/^[0-9]{10}$/);
    expect(openItem?.addressLine).toBeNull();
    expect(openItem?.region).toEqual({ az: 'Rayon A1' });
    expect(openItem?.activityType).toEqual({ az: 'Ərzaq' });

    // Tam eşleşmede de aynı kural.
    const exact = await search({ phone: contact.personalPhone });
    const exactClosed = (exact.body as SearchJson).items.find((item) => item.id === closed);
    expect(exactClosed?.personalPhone).toBeNull();
    expect(exactClosed?.email).toBeNull();
  });

  it('F2.11b-AC9 yanıt anahtarları sabit liste; bağlantı/alım alanı yok', async () => {
    const id = await buyer({ legalName: name('Şema'), privacy: { show_personal_contact: true } });
    const result = await search({ q: name('Şema') });
    expect(Object.keys(result.body as object).sort()).toEqual(
      ['emptyReason', 'items', 'nextCursor'].sort(),
    );
    const item = (result.body as SearchJson).items.find((entry) => entry.id === id);
    expect(Object.keys(item ?? {}).sort()).toEqual([...DIRECTORY_BUYER_KEYS].sort());
    expect(item?.relation).toEqual({ status: 'none', cooldownUntil: null, canRequest: true });
  });

  it('F2.11b-AC10 kart fonksiyonu yalnız seller bağlamında, ≤20 kimlik; buyer üye 403', async () => {
    const buyerId = await buyer({ legalName: name('Bağlam') });
    const cards = (businessId: string, list: string[]) =>
      withTenantTx({ businessId, userId: null }, (tx) => repository.cardsTx(tx, list));

    expect(await errorCode(() => cards(buyerId, [buyerId]))).toBe('42501');
    const tooMany = Array.from({ length: 21 }, () => randomUUID());
    expect(await errorCode(() => cards(seller.businessId, tooMany))).toBe('22023');
    expect((await cards(seller.businessId, [buyerId])).map((card) => card.id)).toEqual([buyerId]);

    // Perakendeci üyesi uca erişemez (izin `directory.search`, yetenek seller).
    const buyerAdmin = await addMember(buyerId, 'buyer_business_admin');
    const denied = await search({}, { userId: buyerAdmin, businessId: buyerId });
    expect(denied.status).toBe(403);

    // Uç istemciden kimlik almaz: `id` parametresi doğrulamada reddedilmez ama yok sayılır.
    const hidden = await buyer({ legalName: name('Gizli Kimlik'), listed: false });
    const probe = await search({ q: tag, id: hidden });
    expect(ids(probe.body)).not.toContain(hidden);
  });

  it('F2.11b-AC1 history: never her sonucu, diğer değerler boş liste (bağlantı tabloları F2.12)', async () => {
    const id = await buyer({ legalName: name('Tarixçə') });
    expect(ids((await search({ q: name('Tarixçə'), history: 'never' })).body)).toEqual([id]);
    expect(ids((await search({ q: name('Tarixçə'), history: 'rejected' })).body)).toEqual([]);
  });
});
