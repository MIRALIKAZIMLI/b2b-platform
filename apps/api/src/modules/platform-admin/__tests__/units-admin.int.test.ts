// F3.1 entegrasyon (US-028): birim kataloğu. Admin uçları platform-admin modülünde, kurallar
// catalog UnitsService'te; test HTTP üzerinden. Seed ve doğrudan SQL denetimleri migrator / app_user ile.
import { randomInt } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectAsAppUser,
  connectAsMigrator,
  connectAsSuperuser,
} from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { SEED_UNIT_CONVERSIONS, SEED_UNITS, seedCatalog } from '../../catalog';
import { addMember, newRegion, newSeller, runSeeds } from './buyer-fixtures';
import { AdminHttp, platformUser } from './fixtures';

interface UnitJson {
  readonly code: string;
  readonly kind: string;
  readonly name: Record<string, string>;
  readonly abbreviation: Record<string, string>;
  readonly allowsDecimal: boolean;
  readonly isActive: boolean;
}

interface ConversionJson {
  readonly fromCode: string;
  readonly toCode: string;
  readonly factor: string;
}

interface CatalogJson {
  readonly items: UnitJson[];
  readonly conversions: ConversionJson[];
}

const NAME = { az: 'Test vahid', ru: 'Тестовая единица', tr: 'Test birimi' };
const ABBR = { az: 'tv', ru: 'тв', tr: 'tb' };
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SEEDED = new Set(SEED_UNITS.map((unit) => unit.code));

describe('F3.1 birim kataloğu (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: AdminHttp;
  let content: Record<string, string>;
  const created: string[] = [];
  let regionId: string;

  async function newSellerAdmin(): Promise<{ businessId: string; userId: string }> {
    const seller = await newSeller(regionId);
    return { businessId: seller.businessId, userId: seller.admin.userId };
  }

  /** Bu dosyaya özgü, seed'de olmayan 3 karakterlik kod (`Z..`). */
  function newCode(): string {
    for (;;) {
      const pick = () => ALPHABET.charAt(randomInt(ALPHABET.length));
      const code = `Z${pick()}${pick()}`;
      if (!SEEDED.has(code) && !created.includes(code)) {
        created.push(code);
        return code;
      }
    }
  }

  async function createUnit(kind: string, overrides: Record<string, unknown> = {}) {
    return await h
      .http()
      .post('/api/v1/admin/catalog/units')
      .set(content)
      .send({
        code: newCode(),
        kind,
        name: NAME,
        abbreviation: ABBR,
        allowsDecimal: true,
        ...overrides,
      });
  }

  async function publicCatalog(userId: string): Promise<CatalogJson> {
    const response = await h
      .http()
      .get('/api/v1/catalog/units')
      .set(await h.bearer(userId));
    expect(response.status).toBe(200);
    return response.body as CatalogJson;
  }

  beforeAll(async () => {
    await runSeeds();
    regionId = await newRegion('F3.1 test');
    const client = await connectAsMigrator();
    try {
      await seedCatalog(client);
    } finally {
      await client.end();
    }
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    h = new AdminHttp(app);
    content = await h.bearer(await platformUser('content'));
  });

  // Birimler G tablosudur ve silinemez (AC3); test satırları RLS'i aşan süper kullanıcıyla silinir.
  afterAll(async () => {
    const client = await connectAsSuperuser();
    try {
      await client.query(
        'delete from unit_conversions where from_code = any($1) or to_code = any($1)',
        [created],
      );
      await client.query('delete from units where code = any($1)', [created]);
    } finally {
      await client.end();
    }
    await redis.cleanup();
    await app.close();
  });

  describe('seed', () => {
    it('F3.1 seed 19 başlangıç birimi ve 5 dönüşüm; tekrar çalıştırmada değişmez', async () => {
      const client = await connectAsMigrator();
      try {
        expect((await seedCatalog(client)).inserted).toBe(0);
        const units = await client.query<{ code: string; kind: string }>(
          'select code, kind from units where code = any($1) order by code',
          [[...SEEDED]],
        );
        expect(units.rows).toHaveLength(19);
        const conversions = await client.query<{
          from_code: string;
          to_code: string;
          factor: string;
        }>(
          `select from_code, to_code, factor::text from unit_conversions
            where from_code = any($1) and to_code = any($1)`,
          [[...SEEDED]],
        );
        expect(conversions.rows).toHaveLength(SEED_UNIT_CONVERSIONS.length);
        expect(conversions.rows).toContainEqual({
          from_code: 'KGM',
          to_code: 'GRM',
          factor: '1000.000000',
        });
      } finally {
        await client.end();
      }
    });
  });

  describe('AC1 birim oluşturma', () => {
    it('F3.1-AC1 admin birim açar; birim giriş yapmış toptancı kullanıcısının listesinde görünür', async () => {
      const response = await createUnit('package', { allowsDecimal: false });
      expect(response.status).toBe(201);
      const unit = response.body as UnitJson;
      expect(unit).toMatchObject({
        kind: 'package',
        name: NAME,
        abbreviation: ABBR,
        allowsDecimal: false,
        isActive: true,
      });

      const seller = await newSellerAdmin();
      const catalog = await publicCatalog(seller.userId);
      expect(catalog.items.map((item) => item.code)).toContain(unit.code);
      expect(catalog.items.map((item) => item.code)).toEqual(
        expect.arrayContaining(['H87', 'KGM', 'XCT']),
      );
      expect(catalog.conversions).toContainEqual({
        fromCode: 'KGM',
        toCode: 'GRM',
        factor: '1000',
      });

      const audit = await connectAsSuperuser();
      try {
        const rows = await audit.query(
          "select 1 from audit_logs where action = 'unit.created' and target_id = $1",
          [unit.code],
        );
        expect(rows.rowCount).toBe(1);
      } finally {
        await audit.end();
      }
    });

    it('F3.1-AC1 kod UN/ECE biçiminde ve benzersiz; kısaltma az/ru/tr zorunlu', async () => {
      const bad = await h
        .http()
        .post('/api/v1/admin/catalog/units')
        .set(content)
        .send({ code: 'kgm', kind: 'weight', name: NAME, abbreviation: ABBR, allowsDecimal: true });
      expect(bad.status).toBe(422);

      const noAbbr = await createUnit('weight', { abbreviation: { az: 'x' } });
      expect(noAbbr.status).toBe(422);

      const taken = await h
        .http()
        .post('/api/v1/admin/catalog/units')
        .set(content)
        .send({ code: 'KGM', kind: 'weight', name: NAME, abbreviation: ABBR, allowsDecimal: true });
      expect(taken.status).toBe(422);
      expect(taken.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { code: ['taken'] } });
    });

    it('F3.1-AC1 admin listesi pasifleri de gösterir; kod ve tür değiştirilemez', async () => {
      const unit = (await createUnit('count')).body as UnitJson;
      const patch = await h
        .http()
        .patch(`/api/v1/admin/catalog/units/${unit.code}`)
        .set(content)
        .send({ kind: 'weight' });
      expect(patch.status).toBe(422);

      const renamed = await h
        .http()
        .patch(`/api/v1/admin/catalog/units/${unit.code}`)
        .set(content)
        .send({ name: { ...NAME, az: 'Yeni ad' }, allowsDecimal: false });
      expect(renamed.status).toBe(200);
      expect(renamed.body).toMatchObject({
        kind: 'count',
        allowsDecimal: false,
        name: { az: 'Yeni ad' },
      });

      const missing = await h
        .http()
        .patch('/api/v1/admin/catalog/units/QQQ')
        .set(content)
        .send({ isActive: false });
      expect(missing.status).toBe(404);
    });
  });

  describe('AC2 dönüşüm oranı', () => {
    it('F3.1-AC2 aynı türdeki iki birim arasında oran kaydedilir ve güncellenir', async () => {
      const big = (await createUnit('weight')).body as UnitJson;
      const small = (await createUnit('weight')).body as UnitJson;
      const saved = await h
        .http()
        .put('/api/v1/admin/catalog/unit-conversions')
        .set(content)
        .send({ fromCode: big.code, toCode: small.code, factor: '1000' });
      expect(saved.status).toBe(200);
      expect(saved.body).toEqual({ fromCode: big.code, toCode: small.code, factor: '1000' });

      const updated = await h
        .http()
        .put('/api/v1/admin/catalog/unit-conversions')
        .set(content)
        .send({ fromCode: big.code, toCode: small.code, factor: '0.5' });
      expect(updated.body).toEqual({ fromCode: big.code, toCode: small.code, factor: '0.5' });

      const list = await h.http().get('/api/v1/admin/catalog/units').set(content);
      expect((list.body as CatalogJson).conversions).toContainEqual({
        fromCode: big.code,
        toCode: small.code,
        factor: '0.5',
      });

      const removed = await h
        .http()
        .delete(`/api/v1/admin/catalog/unit-conversions/${big.code}/${small.code}`)
        .set(content);
      expect(removed.status).toBe(204);
      const again = await h
        .http()
        .delete(`/api/v1/admin/catalog/unit-conversions/${big.code}/${small.code}`)
        .set(content);
      expect(again.status).toBe(404);
    });

    it('F3.1-AC2 farklı tür, aynı birim, ters yön, olmayan birim ve sıfır oran reddedilir', async () => {
      const weight = (await createUnit('weight')).body as UnitJson;
      const other = (await createUnit('weight')).body as UnitJson;
      const volume = (await createUnit('volume')).body as UnitJson;
      const put = (body: Record<string, unknown>) =>
        h.http().put('/api/v1/admin/catalog/unit-conversions').set(content).send(body);

      const mismatch = await put({ fromCode: weight.code, toCode: volume.code, factor: '2' });
      expect(mismatch.body).toMatchObject({ details: { toCode: ['kind_mismatch'] } });
      const same = await put({ fromCode: weight.code, toCode: weight.code, factor: '2' });
      expect(same.body).toMatchObject({ details: { toCode: ['same_unit'] } });
      const unknown = await put({ fromCode: weight.code, toCode: 'QQQ', factor: '2' });
      expect(unknown.body).toMatchObject({ details: { toCode: ['not_found'] } });
      expect((await put({ fromCode: weight.code, toCode: other.code, factor: '0' })).status).toBe(
        422,
      );
      expect((await put({ fromCode: weight.code, toCode: other.code, factor: '-1' })).status).toBe(
        422,
      );

      expect((await put({ fromCode: weight.code, toCode: other.code, factor: '10' })).status).toBe(
        200,
      );
      const reverse = await put({ fromCode: other.code, toCode: weight.code, factor: '0.1' });
      expect(reverse.status).toBe(422);
      expect(reverse.body).toMatchObject({ details: { toCode: ['reverse_exists'] } });
    });
  });

  describe('AC3 silinmez, yalnız pasifleşir', () => {
    it('F3.1-AC3 silme ucu yok; pasif birim ürün formu listesinden çıkar, admin listesinde kalır', async () => {
      const unit = (await createUnit('length')).body as UnitJson;
      const removed = await h
        .http()
        .delete(`/api/v1/admin/catalog/units/${unit.code}`)
        .set(content);
      expect(removed.status).toBe(404);

      const off = await h
        .http()
        .patch(`/api/v1/admin/catalog/units/${unit.code}`)
        .set(content)
        .send({ isActive: false });
      expect(off.status).toBe(200);
      expect(off.body).toMatchObject({ isActive: false });

      const seller = await newSellerAdmin();
      const catalog = await publicCatalog(seller.userId);
      expect(catalog.items.map((item) => item.code)).not.toContain(unit.code);
      const admin = await h.http().get('/api/v1/admin/catalog/units').set(content);
      expect((admin.body as CatalogJson).items).toContainEqual(
        expect.objectContaining({ code: unit.code, isActive: false }),
      );
    });

    it('F3.1-AC3 pasif uçlu dönüşüm ürün formu listesinde görünmez', async () => {
      const a = (await createUnit('area')).body as UnitJson;
      const b = (await createUnit('area')).body as UnitJson;
      await h
        .http()
        .put('/api/v1/admin/catalog/unit-conversions')
        .set(content)
        .send({ fromCode: a.code, toCode: b.code, factor: '4' });
      await h
        .http()
        .patch(`/api/v1/admin/catalog/units/${b.code}`)
        .set(content)
        .send({ isActive: false });
      const seller = await newSellerAdmin();
      const catalog = await publicCatalog(seller.userId);
      expect(catalog.conversions.some((item) => item.fromCode === a.code)).toBe(false);
    });

    it('F3.1-AC3 veritabanı: platform bağlamında bile app_user birim silemez', async () => {
      const client = await connectAsAppUser();
      try {
        await client.query('begin');
        await client.query("select set_config('app.is_platform', 'true', true)");
        await expect(client.query("delete from units where code = 'H87'")).rejects.toMatchObject({
          code: '42501',
        });
      } finally {
        await client.query('rollback');
        await client.end();
      }
    });
  });

  describe('AC4 toptancı birim oluşturamaz', () => {
    it('F3.1-AC4 toptancı admini, satış müdürü ve operasyon ekibi admin uçlarında 403 alır', async () => {
      const seller = await newSellerAdmin();
      const manager = (await addMember(seller.businessId, 'seller_sales_manager')).userId;
      const operations = await platformUser('operations');
      const body = {
        code: newCode(),
        kind: 'count',
        name: NAME,
        abbreviation: ABBR,
        allowsDecimal: false,
      };
      for (const [userId, businessId] of [
        [seller.userId, seller.businessId],
        [manager, seller.businessId],
        [operations, undefined],
      ] as const) {
        const headers: Record<string, string> = { ...(await h.bearer(userId)) };
        if (businessId !== undefined) headers['X-Business-Id'] = businessId;
        const post = await h.http().post('/api/v1/admin/catalog/units').set(headers).send(body);
        expect(post.status).toBe(403);
        const put = await h
          .http()
          .put('/api/v1/admin/catalog/unit-conversions')
          .set(headers)
          .send({ fromCode: 'KGM', toCode: 'GRM', factor: '1' });
        expect(put.status).toBe(403);
      }
      const check = await connectAsMigrator();
      try {
        const rows = await check.query('select 1 from units where code = $1', [body.code]);
        expect(rows.rowCount).toBe(0);
      } finally {
        await check.end();
      }
    });

    it('F3.1-AC4 veritabanı: kiracı bağlamında birim ve dönüşüm yazılamaz', async () => {
      const seller = await newSellerAdmin();
      const client = await connectAsAppUser();
      try {
        await client.query('begin');
        await client.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
        await expect(
          client.query(
            `insert into units (code, kind, name, abbreviation)
             values ('ZZ9', 'count', '{"az":"x"}', '{"az":"x"}')`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
      try {
        await client.query('begin');
        await client.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
        const updated = await client.query("update units set is_active = false where code = 'KGM'");
        expect(updated.rowCount).toBe(0);
        const deleted = await client.query('delete from unit_conversions');
        expect(deleted.rowCount).toBe(0);
      } finally {
        await client.query('rollback');
        await client.end();
      }
    });
  });
});
