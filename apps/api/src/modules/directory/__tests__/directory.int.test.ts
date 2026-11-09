// F2.11a: perakendeci dizini D fonksiyonları ve indeks besleme (US-007 AC1–AC4, AC6; US-019 AC6;
// US-020 AC1–AC2; Müfettiş 15 L4). Perakendeciler kayıt ucuyla açılır (F2.3a); alanlar profil ve
// görünürlük uçlarıyla değişir. İndeks bellek içi sahte porttur; Meilisearch davranışı
// meili-buyer-directory-index.int.test.ts'te. Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import { DEFAULT_PRIVACY } from '@b2b/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { withSystemTx, withTenantTx } from '../../../core/db';
import { BUYER_DIRECTORY_DOCUMENT_KEYS } from '../../../core/ports/buyer-directory-index';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { platformRows, RegistrationHttp, registerBody, runSeeds, testRefs } from './fixtures';
import { DirectoryIndexer } from '../directory-indexer';
import { DirectoryRepository } from '../directory.repository';
import { FakeBuyerDirectoryIndex } from './fake-index';

interface Buyer {
  readonly businessId: string;
  readonly accessToken: string;
  readonly phone: string;
  readonly legalName: string;
}

/** Benzersiz geçerli VÖEN (son hane 1 veya 2). */
function randomVoen(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `${digits}1`;
}

describe('F2.11a perakendeci dizini (D fonksiyonları + indeks)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let api: RegistrationHttp;
  let index: FakeBuyerDirectoryIndex;
  let indexer: DirectoryIndexer;
  const repository = new DirectoryRepository();
  let sellerId: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    api = new RegistrationHttp(app);
    sellerId = await createSeller('approved');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  beforeEach(() => {
    index = new FakeBuyerDirectoryIndex();
    indexer = new DirectoryIndexer(index, repository);
  });

  async function createSeller(capability: 'approved' | 'pending'): Promise<string> {
    const id = randomUUID();
    const { regionId } = await testRefs();
    await platformRows(
      `insert into businesses (id, legal_name, region_id, timezone, created_via, status)
       values ($1, $2, $3, 'Asia/Baku', 'admin', 'active')`,
      [id, `Toptan ${id.slice(0, 8)}`, regionId],
    );
    await platformRows(
      `insert into business_capabilities (business_id, capability, status, approved_at)
       values ($1, 'seller', $2, case when $2 = 'approved' then now() end)`,
      [id, capability],
    );
    return id;
  }

  async function register(): Promise<Buyer> {
    const limits = (await redis.keys()).filter((key) => key.startsWith('buyer_reg:'));
    if (limits.length > 0) await redis.client.del(...limits);
    const phone = randomTestPhone();
    const body = await registerBody();
    const response = await api.register(await api.pendingToken(phone), body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const json = response.body as { businessId: string; accessToken: string };
    return {
      businessId: json.businessId,
      accessToken: json.accessToken,
      phone,
      legalName: String(body.legalName),
    };
  }

  const patchProfile = (who: Buyer, body: object) =>
    api
      .http()
      .patch('/api/v1/business')
      .set('Authorization', `Bearer ${who.accessToken}`)
      .set('X-Business-Id', who.businessId)
      .send(body);

  const putPrivacy = (who: Buyer, body: object) =>
    api
      .http()
      .put('/api/v1/business/privacy')
      .set('Authorization', `Bearer ${who.accessToken}`)
      .set('X-Business-Id', who.businessId)
      .send({ ...DEFAULT_PRIVACY, ...body });

  const exactMatch = (query: { phone: string } | { voen: string }, businessId = sellerId) =>
    withTenantTx({ businessId, userId: null }, (tx) => repository.exactMatchTx(tx, query));

  async function errorCodeOf(fn: () => Promise<unknown>): Promise<string | undefined> {
    try {
      await fn();
      return undefined;
    } catch (error) {
      return pgErrorCode(error) ?? pgErrorCode((error as { cause?: unknown }).cause);
    }
  }

  it('F2.11a-AC1 (US-007 AC1): yeni kayıtta belgede yalnız ünvan, faaliyet alanı, bölge dolu', async () => {
    const buyer = await register();
    const { regionId, activityTypeId } = await testRefs();
    await indexer.refresh([buyer.businessId]);

    expect(index.docs.get(buyer.businessId)).toEqual({
      id: buyer.businessId,
      legalName: buyer.legalName,
      activityTypeId,
      regionId,
      cityId: regionId,
      verified: false,
      logoFileId: null,
      addressLine: null,
      businessPhone: null,
      voen: null,
      contactName: null,
    });
  });

  it('F2.11a-AC2 (US-007 AC2): alan açılınca belgede görünür, kapatılınca null olur', async () => {
    const buyer = await register();
    const voen = randomVoen();
    const filled = await patchProfile(buyer, {
      addressLine: 'Nizami küç. 10',
      businessPhone: '+994 12 555-10-20',
      voen,
      contactName: 'Leyla Əliyeva',
    });
    expect(filled.status, JSON.stringify(filled.body)).toBe(200);
    await indexer.refresh([buyer.businessId]);
    expect(index.docs.get(buyer.businessId)).toMatchObject({
      addressLine: null,
      businessPhone: null,
      voen: null,
      contactName: null,
    });

    const opened = await putPrivacy(buyer, {
      showAddress: true,
      showBusinessPhone: true,
      showVoen: true,
      showContactName: true,
    });
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    await indexer.refresh([buyer.businessId]);
    expect(index.docs.get(buyer.businessId)).toMatchObject({
      addressLine: 'Nizami küç. 10',
      businessPhone: '+994 12 555-10-20',
      voen,
      contactName: 'Leyla Əliyeva',
    });

    expect((await putPrivacy(buyer, {})).status).toBe(200);
    await indexer.refresh([buyer.businessId]);
    expect(index.docs.get(buyer.businessId)).toMatchObject({
      addressLine: null,
      businessPhone: null,
      voen: null,
      contactName: null,
    });
  });

  it('F2.11a-AC3 (US-007 AC4): dizinde görünme kapalı → indekste yok; tam eşleşme yine bulur', async () => {
    const buyer = await register();
    await indexer.refresh([buyer.businessId]);
    expect(index.docs.has(buyer.businessId)).toBe(true);

    expect((await putPrivacy(buyer, { listedInDirectory: false })).status).toBe(200);
    await indexer.refresh([buyer.businessId]);
    expect(index.docs.has(buyer.businessId)).toBe(false);
    expect(await exactMatch({ phone: buyer.phone })).toEqual([buyer.businessId]);

    // Yeniden indekslemede de görünmez.
    await indexer.rebuild(500);
    expect(index.docs.has(buyer.businessId)).toBe(false);
  });

  it('F2.11a-AC4 (US-019 AC6): askıdaki işletme veya askıdaki yetenek indekste ve eşleşmede yok', async () => {
    const suspended = await register();
    const capability = await register();
    await indexer.refresh([suspended.businessId, capability.businessId]);
    expect(index.docs.size).toBe(2);

    await platformRows(`update businesses set status = 'suspended' where id = $1`, [
      suspended.businessId,
    ]);
    await platformRows(
      `update business_capabilities set status = 'suspended'
        where business_id = $1 and capability = 'buyer'`,
      [capability.businessId],
    );
    await indexer.refresh([suspended.businessId, capability.businessId]);
    expect(index.docs.size).toBe(0);
    expect(await exactMatch({ phone: suspended.phone })).toEqual([]);
    expect(await exactMatch({ phone: capability.phone })).toEqual([]);
  });

  it('F2.11a-AC5 (US-020 AC1): giriş, işletme ve kişisel telefonu ile VÖEN tam eşleşir', async () => {
    const buyer = await register();
    const personal = randomTestPhone();
    const business = randomTestPhone();
    const voen = randomVoen();
    // İşletme telefonu serbest biçimli: yalnız rakamlar karşılaştırılır.
    const spaced = `${business.slice(0, 4)} ${business.slice(4, 6)} ${business.slice(6)}`;
    const patched = await patchProfile(buyer, {
      personalPhone: personal,
      businessPhone: spaced,
      voen,
    });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);

    expect(await exactMatch({ phone: buyer.phone })).toEqual([buyer.businessId]);
    expect(await exactMatch({ phone: personal })).toEqual([buyer.businessId]);
    expect(await exactMatch({ phone: business })).toEqual([buyer.businessId]);
    expect(await exactMatch({ voen })).toEqual([buyer.businessId]);
  });

  it('F2.11a-AC5 (US-020 AC2): kısmi telefon veya VÖEN eşleşmez', async () => {
    const buyer = await register();
    const voen = randomVoen();
    expect((await patchProfile(buyer, { voen })).status).toBe(200);

    expect(await exactMatch({ phone: buyer.phone.slice(0, -2) })).toEqual([]);
    expect(await exactMatch({ phone: buyer.phone.slice(1) })).toEqual([]);
    expect(await exactMatch({ phone: `${buyer.phone.slice(0, 6)}%` })).toEqual([]);
    expect(await exactMatch({ voen: voen.slice(0, 8) })).toEqual([]);
    expect(await exactMatch({ voen: `${voen.slice(0, 5)}%` })).toEqual([]);
  });

  it('F2.11a-AC5: tam eşleşmeyi yalnız onaylı toptancı çağırır (perakendeci, onaysız, sistem 42501)', async () => {
    const buyer = await register();
    const pending = await createSeller('pending');
    expect(await errorCodeOf(() => exactMatch({ phone: buyer.phone }, buyer.businessId))).toBe(
      '42501',
    );
    expect(await errorCodeOf(() => exactMatch({ phone: buyer.phone }, pending))).toBe('42501');
    expect(
      await errorCodeOf(() =>
        withSystemTx((tx) => repository.exactMatchTx(tx, { phone: buyer.phone })),
      ),
    ).toBe('42501');
  });

  it('F2.11a-AC6 (US-007 AC6, TM-10): belge anahtarları sabit liste; bağlantı, alım, kişisel iletişim yok', async () => {
    const buyer = await register();
    expect(
      (
        await patchProfile(buyer, {
          personalPhone: randomTestPhone(),
          email: 'leyla@example.az',
        })
      ).status,
    ).toBe(200);
    expect(
      (await putPrivacy(buyer, { showPersonalContact: true, showContactName: true })).status,
    ).toBe(200);
    await indexer.refresh([buyer.businessId]);

    const document = index.docs.get(buyer.businessId);
    expect(Object.keys(document ?? {}).sort()).toEqual([...BUYER_DIRECTORY_DOCUMENT_KEYS].sort());
    const text = JSON.stringify(document);
    expect(text).not.toContain('leyla@example.az');
    expect(text).not.toContain(buyer.phone);
  });

  it('F2.11a-AC7 (L4): dizine giren profil alanı değişince yalnız kimlikli buyer.profile_changed yazılır', async () => {
    const buyer = await register();
    const events = () =>
      platformRows<{ payload: Record<string, unknown> }>(
        `select payload from outbox_events
          where aggregate_id = $1 and type = 'buyer.profile_changed' order by id`,
        [buyer.businessId],
      );

    expect((await patchProfile(buyer, { email: 'yeni@example.az' })).status).toBe(200);
    expect(await events()).toEqual([]);

    expect((await patchProfile(buyer, { contactName: 'Yeni Yetkili' })).status).toBe(200);
    expect((await patchProfile(buyer, { addressLine: 'Füzuli küç. 3' })).status).toBe(200);
    expect(await events()).toEqual([
      { payload: { businessId: buyer.businessId } },
      { payload: { businessId: buyer.businessId } },
    ]);

    expect((await putPrivacy(buyer, { showContactName: true })).status).toBe(200);
    await indexer.refresh([buyer.businessId]);
    expect(index.docs.get(buyer.businessId)?.contactName).toBe('Yeni Yetkili');
  });

  it('F2.11a-AC8: tüketici idempotent; yeniden indeksleme artımlı sonuçla aynı', async () => {
    const listed = await register();
    const hidden = await register();
    expect((await putPrivacy(hidden, { listedInDirectory: false })).status).toBe(200);

    await indexer.refresh([listed.businessId, hidden.businessId, listed.businessId]);
    await indexer.refresh([listed.businessId, hidden.businessId]);
    const incremental = new Map(index.docs);
    expect([...incremental.keys()]).toEqual([listed.businessId]);

    const rebuilt = new FakeBuyerDirectoryIndex();
    const result = await new DirectoryIndexer(rebuilt, repository).rebuild(50);
    expect(result.indexed).toBe(rebuilt.docs.size);
    expect(rebuilt.docs.get(listed.businessId)).toEqual(incremental.get(listed.businessId));
    expect(rebuilt.docs.has(hidden.businessId)).toBe(false);
    // Toptancı dizinde hiç görünmez.
    expect(rebuilt.docs.has(sellerId)).toBe(false);
  });

  it('F2.11a-AC9: belge fonksiyonu perakendeci bağlamında, sayfa fonksiyonu işletme bağlamında 42501', async () => {
    const buyer = await register();
    const other = await register();
    expect(
      await errorCodeOf(() =>
        withTenantTx({ businessId: buyer.businessId, userId: null }, (tx) =>
          repository.documentsTx(tx, [other.businessId]),
        ),
      ),
    ).toBe('42501');
    expect(
      await errorCodeOf(() =>
        withTenantTx({ businessId: sellerId, userId: null }, (tx) =>
          repository.pageTx(tx, null, 10),
        ),
      ),
    ).toBe('42501');
    // Onaylı toptancı belgeleri okuyabilir (F2.11b ucu bunu kullanır), yalnız açık alanlarla.
    const rows = await withTenantTx({ businessId: sellerId, userId: null }, (tx) =>
      repository.documentsTx(tx, [other.businessId]),
    );
    expect(rows.map((row) => row.document.id)).toEqual([other.businessId]);
    expect(rows[0]?.document.voen).toBeNull();
  });
});
