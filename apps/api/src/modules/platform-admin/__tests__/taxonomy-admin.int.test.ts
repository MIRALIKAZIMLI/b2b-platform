// F3.2a entegrasyon (US-029): kategori, marka, faaliyet alanı admin uçları, genel listeler, seed ve
// veritabanı korumaları (derinlik tetikleyicisi, silme yok). Marka talebi akışı
// catalog/__tests__/brand-requests.int.test.ts'te.
import { randomUUID } from 'node:crypto';
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
import { SEED_CATEGORIES, seedCatalog } from '../../catalog';
import { addMember, newBuyer, newRegion, newSeller, runSeeds } from './buyer-fixtures';
import { AdminHttp, auditRows, platformUser } from './fixtures';

interface CategoryJson {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: Record<string, string>;
  readonly depth: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

interface BrandJson {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly isActive: boolean;
  readonly requestedBy: { businessId: string; legalName: string | null } | null;
}

interface ActivityTypeJson {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

/** Bu dosyaya özgü, çakışmayan 4 dilli ad. */
function uniqueName(prefix: string): { az: string; ru: string; tr: string; en: string } {
  const tag = randomUUID().slice(0, 8);
  return {
    az: `${prefix} az ${tag}`,
    ru: `${prefix} ru ${tag}`,
    tr: `${prefix} tr ${tag}`,
    en: `${prefix} en ${tag}`,
  };
}

describe('F3.2a kategori, marka, faaliyet alanı (entegrasyon)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let h: AdminHttp;
  let content: Record<string, string>;
  let regionId: string;
  const categoryIds: string[] = [];
  const brandIds: string[] = [];
  const activityTypeIds: string[] = [];

  async function createCategory(body: Record<string, unknown>) {
    const response = await h
      .http()
      .post('/api/v1/admin/catalog/categories')
      .set(content)
      .send(body);
    if (response.status === 201) categoryIds.push((response.body as CategoryJson).id);
    return response;
  }

  async function publicCategories(userId: string): Promise<CategoryJson[]> {
    const response = await h
      .http()
      .get('/api/v1/catalog/categories')
      .set(await h.bearer(userId));
    expect(response.status).toBe(200);
    return response.body as CategoryJson[];
  }

  beforeAll(async () => {
    await runSeeds();
    regionId = await newRegion('F3.2a test');
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

  // G tabloları silinmez (R38); test satırları RLS'i aşan süper kullanıcıyla temizlenir. Test faaliyet
  // alanları `sortOrder: 9000` ile açılır: fikstürler (newBuyer) ilk sıradaki türü seçer.
  afterAll(async () => {
    const client = await connectAsSuperuser();
    try {
      // Üst ve altlar tek ifadede silinir (FK ifade sonunda denetlenir).
      await client.query('delete from categories where id = any($1)', [categoryIds]);
      await client.query('delete from brands where id = any($1)', [brandIds]);
      await client.query('delete from activity_types where id = any($1)', [activityTypeIds]);
    } finally {
      await client.end();
    }
    await redis.cleanup();
    await app.close();
  });

  describe('seed', () => {
    it('F3.2a seed 8 üst ve 43 alt kategori; tekrar çalıştırmada değişmez', async () => {
      const client = await connectAsMigrator();
      try {
        expect((await seedCatalog(client)).inserted).toBe(0);
        const roots = await client.query<{ id: string; az: string }>(
          `select id, name->>'az' as az from categories
            where parent_id is null and name->>'az' = any($1)`,
          [SEED_CATEGORIES.map((top) => top.name.az)],
        );
        expect(roots.rows).toHaveLength(8);
        const children = await client.query<{ n: number }>(
          'select count(*)::int as n from categories where parent_id = any($1)',
          [roots.rows.map((row) => row.id)],
        );
        expect(children.rows[0]?.n).toBe(43);
      } finally {
        await client.end();
      }
      expect(SEED_CATEGORIES.reduce((sum, top) => sum + top.children.length, 0)).toBe(43);
    });

    it('F3.2a seed admin düzenlemesini ezmez (bir dilde ad değişse de yeniden eklemez)', async () => {
      const first = SEED_CATEGORIES[0];
      if (first === undefined) throw new Error('seed boş');
      const client = await connectAsMigrator();
      try {
        const [root] = (
          await client.query<{ id: string; name: Record<string, string> }>(
            `select id, name from categories where parent_id is null and name->>'ru' = $1`,
            [first.name.ru],
          )
        ).rows;
        if (root === undefined) throw new Error('kök yok');
        const tr = `${first.name.tr} (düzenlendi)`;
        await h
          .http()
          .patch(`/api/v1/admin/catalog/categories/${root.id}`)
          .set(content)
          .send({ name: { ...root.name, tr } })
          .expect(200);
        expect((await seedCatalog(client)).inserted).toBe(0);
        const after = await client.query<{ tr: string }>(
          `select name->>'tr' as tr from categories where id = $1`,
          [root.id],
        );
        expect(after.rows[0]?.tr).toBe(tr);
        await h
          .http()
          .patch(`/api/v1/admin/catalog/categories/${root.id}`)
          .set(content)
          .send({ name: root.name })
          .expect(200);
      } finally {
        await client.end();
      }
    });
  });

  describe('AC1 admin kayıt açar; kayıt genel listede görünür', () => {
    it('F3.2a-AC1 kategori: üst + alt açılır, toptancı ürün formu listesinde görünür', async () => {
      const top = await createCategory({ name: uniqueName('Kök'), sortOrder: 5 });
      expect(top.status).toBe(201);
      const topBody = top.body as CategoryJson;
      expect(topBody).toMatchObject({ parentId: null, depth: 1, sortOrder: 5, isActive: true });
      const child = await createCategory({ parentId: topBody.id, name: uniqueName('Alt') });
      expect(child.status).toBe(201);
      expect((child.body as CategoryJson).depth).toBe(2);

      const seller = await newSeller(regionId);
      const list = await publicCategories(seller.admin.userId);
      expect(list.map((item) => item.id)).toEqual(
        expect.arrayContaining([topBody.id, (child.body as CategoryJson).id]),
      );
      const audit = await auditRows(topBody.id);
      expect(audit.map((row) => row.action)).toEqual(['category.created']);
      expect(audit[0]?.actor_type).toBe('platform');
    });

    it('F3.2a-AC1 kategori: ad az/ru/tr zorunlu; aynı üst altında aynı ad 422 taken; olmayan üst 422', async () => {
      const noRu = await createCategory({ name: { az: 'x', tr: 'y' } });
      expect(noRu.status).toBe(422);
      const name = uniqueName('Kardeş');
      const top = (await createCategory({ name: uniqueName('Üst') })).body as CategoryJson;
      expect((await createCategory({ parentId: top.id, name })).status).toBe(201);
      const clash = await createCategory({
        parentId: top.id,
        name: { az: name.az.toUpperCase(), ru: 'farklı', tr: 'farklı' },
      });
      expect(clash.status).toBe(422);
      expect(clash.body).toMatchObject({ details: { name: ['taken'] } });
      // Başka üst altında aynı ad serbest (K3 yalnız kardeşler).
      const other = (await createCategory({ name: uniqueName('Üst2') })).body as CategoryJson;
      expect((await createCategory({ parentId: other.id, name })).status).toBe(201);
      const missing = await createCategory({ parentId: randomUUID(), name: uniqueName('Yetim') });
      expect(missing.status).toBe(422);
      expect(missing.body).toMatchObject({ details: { parentId: ['not_found'] } });
    });

    it('F3.2a-AC1 marka: admin açar (active), ürün formu listesinde görünür; aynı ad 422', async () => {
      const name = `Marka ${randomUUID().slice(0, 8)}`;
      const created = await h
        .http()
        .post('/api/v1/admin/catalog/brands')
        .set(content)
        .send({ name: `  ${name}  ` });
      expect(created.status).toBe(201);
      const brand = created.body as BrandJson;
      brandIds.push(brand.id);
      expect(brand).toMatchObject({ name, status: 'active', isActive: true, requestedBy: null });

      const seller = await newSeller(regionId);
      const options = await h
        .http()
        .get('/api/v1/catalog/brands')
        .query({ q: name.slice(-8).toUpperCase() })
        .set(await h.bearer(seller.admin.userId));
      expect(options.status).toBe(200);
      expect(options.body).toEqual([{ id: brand.id, name }]);

      const duplicate = await h
        .http()
        .post('/api/v1/admin/catalog/brands')
        .set(content)
        .send({ name: name.toLowerCase() });
      expect(duplicate.status).toBe(422);
      expect(duplicate.body).toMatchObject({ details: { name: ['taken'] } });
    });

    it('F3.2a-AC1 faaliyet alanı: admin açar, kayıt formu listesinde (kimliksiz) görünür', async () => {
      const name = uniqueName('Faaliyet');
      const created = await h
        .http()
        .post('/api/v1/admin/catalog/activity-types')
        .set(content)
        .send({ name, sortOrder: 9000 });
      expect(created.status).toBe(201);
      const item = created.body as ActivityTypeJson;
      activityTypeIds.push(item.id);
      expect(item).toMatchObject({ sortOrder: 9000, isActive: true });

      const open = await h.http().get('/api/v1/catalog/activity-types');
      expect(open.status).toBe(200);
      expect((open.body as ActivityTypeJson[]).some((row) => row.id === item.id)).toBe(true);

      const clash = await h
        .http()
        .post('/api/v1/admin/catalog/activity-types')
        .set(content)
        .send({ name: { az: name.az, ru: 'başka', tr: 'başka' }, sortOrder: 9000 });
      expect(clash.status).toBe(422);
    });
  });

  describe('AC3 kategori derinliği ≤ 3', () => {
    it('F3.2a-AC3 dördüncü seviye API ile 422 max_depth', async () => {
      const l1 = (await createCategory({ name: uniqueName('L1') })).body as CategoryJson;
      const l2 = (await createCategory({ parentId: l1.id, name: uniqueName('L2') }))
        .body as CategoryJson;
      const l3 = await createCategory({ parentId: l2.id, name: uniqueName('L3') });
      expect(l3.status).toBe(201);
      expect((l3.body as CategoryJson).depth).toBe(3);
      const l4 = await createCategory({
        parentId: (l3.body as CategoryJson).id,
        name: uniqueName('L4'),
      });
      expect(l4.status).toBe(422);
      expect(l4.body).toMatchObject({ details: { parentId: ['max_depth'] } });
    });

    it('F3.2a-AC3 veritabanı: tetikleyici derinliği üstten hesaplar, 4. seviye ve üst değişikliği 23514', async () => {
      const l1 = (await createCategory({ name: uniqueName('D1') })).body as CategoryJson;
      const l2 = (await createCategory({ parentId: l1.id, name: uniqueName('D2') }))
        .body as CategoryJson;
      const l3 = (await createCategory({ parentId: l2.id, name: uniqueName('D3') }))
        .body as CategoryJson;
      const other = (await createCategory({ name: uniqueName('D9') })).body as CategoryJson;
      const client = await connectAsAppUser();
      try {
        await client.query('begin');
        await client.query("select set_config('app.is_platform', 'true', true)");
        // İstemci derinliği yok sayılır: kök altına `depth = 3` yazılsa da 2 olur.
        const fixed = await client.query<{ depth: number }>(
          `insert into categories (parent_id, name, depth) values ($1, $2::jsonb, 3) returning depth`,
          [l1.id, JSON.stringify(uniqueName('Elle'))],
        );
        expect(fixed.rows[0]?.depth).toBe(2);
        await client.query('savepoint s1');
        await expect(
          client.query(
            `insert into categories (parent_id, name, depth) values ($1, $2::jsonb, 1)`,
            [l3.id, JSON.stringify(uniqueName('Dördüncü'))],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await client.query('rollback to savepoint s1');
        await expect(
          client.query('update categories set parent_id = $1 where id = $2', [other.id, l2.id]),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await client.query('rollback');
        await client.end();
      }
    });
  });

  describe('AC4 silme yok; pasifleştirme', () => {
    it('F3.2a-AC4 pasif kategori ve pasif üstün altı genel listede görünmez, admin listesinde kalır', async () => {
      const top = (await createCategory({ name: uniqueName('Pasif') })).body as CategoryJson;
      const child = (await createCategory({ parentId: top.id, name: uniqueName('PasifAlt') }))
        .body as CategoryJson;
      const off = await h
        .http()
        .patch(`/api/v1/admin/catalog/categories/${top.id}`)
        .set(content)
        .send({ isActive: false });
      expect(off.status).toBe(200);
      expect((off.body as CategoryJson).isActive).toBe(false);

      const seller = await newSeller(regionId);
      const visible = (await publicCategories(seller.admin.userId)).map((item) => item.id);
      expect(visible).not.toContain(top.id);
      expect(visible).not.toContain(child.id);

      const admin = await h.http().get('/api/v1/admin/catalog/categories').set(content);
      const ids = (admin.body as CategoryJson[]).map((item) => item.id);
      expect(ids).toEqual(expect.arrayContaining([top.id, child.id]));

      const under = await createCategory({ parentId: top.id, name: uniqueName('PasifAltı') });
      expect(under.status).toBe(422);
      expect(under.body).toMatchObject({ details: { parentId: ['inactive'] } });
    });

    it('F3.2a-AC4 pasif marka ve pasif faaliyet alanı genel listelerden çıkar', async () => {
      const name = `Pasif marka ${randomUUID().slice(0, 8)}`;
      const brand = (
        await h.http().post('/api/v1/admin/catalog/brands').set(content).send({ name })
      ).body as BrandJson;
      brandIds.push(brand.id);
      await h
        .http()
        .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
        .set(content)
        .send({ isActive: false })
        .expect(200);
      const seller = await newSeller(regionId);
      const options = await h
        .http()
        .get('/api/v1/catalog/brands')
        .query({ q: name })
        .set(await h.bearer(seller.admin.userId));
      expect(options.body).toEqual([]);
      // Aktif marka onay/red geçişine giremez (state-machines §13).
      const reject = await h
        .http()
        .patch(`/api/v1/admin/catalog/brands/${brand.id}`)
        .set(content)
        .send({ status: 'rejected' });
      expect(reject.status).toBe(409);

      const type = (
        await h
          .http()
          .post('/api/v1/admin/catalog/activity-types')
          .set(content)
          .send({ name: uniqueName('PasifTür'), sortOrder: 9000 })
      ).body as ActivityTypeJson;
      activityTypeIds.push(type.id);
      await h
        .http()
        .patch(`/api/v1/admin/catalog/activity-types/${type.id}`)
        .set(content)
        .send({ isActive: false })
        .expect(200);
      const open = await h.http().get('/api/v1/catalog/activity-types');
      expect((open.body as ActivityTypeJson[]).some((row) => row.id === type.id)).toBe(false);
      const admin = await h.http().get('/api/v1/admin/catalog/activity-types').set(content);
      expect((admin.body as ActivityTypeJson[]).some((row) => row.id === type.id)).toBe(true);
    });

    it('F3.2a-AC4 veritabanı: platform bağlamında bile app_user kategori, marka, faaliyet alanı silemez', async () => {
      const category = (await createCategory({ name: uniqueName('Silinmez') }))
        .body as CategoryJson;
      const client = await connectAsAppUser();
      try {
        await client.query('begin');
        await client.query("select set_config('app.is_platform', 'true', true)");
        await client.query('savepoint s1');
        await expect(
          client.query('delete from categories where id = $1', [category.id]),
        ).rejects.toMatchObject({ code: '42501' });
        await client.query('rollback to savepoint s1');
        await expect(client.query('delete from brands')).rejects.toMatchObject({ code: '42501' });
        await client.query('rollback to savepoint s1');
        // activity_types: DELETE izni F1.7 testi için duruyor, politika yok → 0 satır.
        const deleted = await client.query('delete from activity_types');
        expect(deleted.rowCount).toBe(0);
      } finally {
        await client.query('rollback');
        await client.end();
      }
    });
  });

  describe('AC5 platform dışı kullanıcı katalog yazamaz', () => {
    it('F3.2a-AC5 toptancı admini, satış müdürü, perakendeci ve operasyon admin uçlarında 403', async () => {
      const seller = await newSeller(regionId);
      const manager = (await addMember(seller.businessId, 'seller_sales_manager')).userId;
      const buyer = await newBuyer(regionId);
      const operations = await platformUser('operations');
      const target = (await createCategory({ name: uniqueName('Hedef') })).body as CategoryJson;
      for (const [userId, businessId] of [
        [seller.admin.userId, seller.businessId],
        [manager, seller.businessId],
        [buyer.admin.userId, buyer.businessId],
        [operations, undefined],
      ] as const) {
        const headers: Record<string, string> = { ...(await h.bearer(userId)) };
        if (businessId !== undefined) headers['X-Business-Id'] = businessId;
        const attempts = [
          () =>
            h
              .http()
              .post('/api/v1/admin/catalog/categories')
              .set(headers)
              .send({ name: uniqueName('X') }),
          () =>
            h
              .http()
              .patch(`/api/v1/admin/catalog/categories/${target.id}`)
              .set(headers)
              .send({ isActive: false }),
          () => h.http().post('/api/v1/admin/catalog/brands').set(headers).send({ name: 'X' }),
          () => h.http().get('/api/v1/admin/catalog/brands').set(headers),
          () =>
            h
              .http()
              .post('/api/v1/admin/catalog/activity-types')
              .set(headers)
              .send({ name: uniqueName('Y'), sortOrder: 9000 }),
        ];
        for (const attempt of attempts) {
          expect((await attempt()).status).toBe(403);
        }
      }
    });

    it('F3.2a-AC5 veritabanı: kiracı bağlamında kategori ve faaliyet alanı yazılamaz', async () => {
      const seller = await newSeller(regionId);
      const client = await connectAsAppUser();
      try {
        await client.query('begin');
        await client.query("select set_config('app.business_id', $1, true)", [seller.businessId]);
        await client.query('savepoint s1');
        await expect(
          client.query(`insert into categories (name, depth) values ('{"az":"x"}', 1)`),
        ).rejects.toMatchObject({ code: '42501' });
        await client.query('rollback to savepoint s1');
        const updated = await client.query('update categories set is_active = false');
        expect(updated.rowCount).toBe(0);
        const types = await client.query('update activity_types set is_active = false');
        expect(types.rowCount).toBe(0);
      } finally {
        await client.query('rollback');
        await client.end();
      }
    });
  });
});
