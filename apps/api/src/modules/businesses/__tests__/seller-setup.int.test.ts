// F2.6 (US-011): depolar, satıcı profili, hizmet bölgeleri. Toptancı işletmesi fikstürle açılır
// (onaylı `seller`, şablondan admin rolü, `pilot` aboneliği); depo hakkı işletmeye özel istisnayla
// ayarlanır. Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  addMemberFromTemplate,
  newRegion,
  newTestBusiness,
  platformRows,
  runSetupSeeds,
} from './seller-fixtures';

interface Seller {
  readonly businessId: string;
  readonly auth: Record<string, string>;
}

interface WarehouseJson {
  readonly id: string;
  readonly name: string;
  readonly addressLine: string | null;
  readonly isDefault: boolean;
  readonly status: string;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

describe('F2.6 depolar, satıcı profili, hizmet bölgeleri', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;

  beforeAll(async () => {
    await runSetupSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function as(userId: string, businessId: string): Promise<Seller> {
    const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return {
      businessId,
      auth: { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId },
    };
  }

  async function seller(options: Parameters<typeof newTestBusiness>[0] = {}): Promise<Seller> {
    const business = await newTestBusiness(options);
    return await as(business.adminUserId, business.businessId);
  }

  const createWarehouse = (who: Seller, body: object) =>
    http().post('/api/v1/warehouses').set(who.auth).send(body);
  const patchWarehouse = (who: Seller, id: string, body: object) =>
    http().patch(`/api/v1/warehouses/${id}`).set(who.auth).send(body);
  const listWarehouses = (who: Seller) => http().get('/api/v1/warehouses').set(who.auth);

  async function profileDefault(businessId: string): Promise<string | null | undefined> {
    const [row] = await platformRows<{ default_warehouse_id: string | null }>(
      'select default_warehouse_id from seller_profiles where business_id = $1',
      [businessId],
    );
    return row?.default_warehouse_id;
  }

  describe('depolar', () => {
    it('US-011-AC1: ilk depo oluşur ve varsayılan olur; ikincisi varsayılan olmaz', async () => {
      const who = await seller({ maxWarehouses: null });
      const first = await createWarehouse(who, { name: 'Ana depo', addressLine: 'Bakı, Nizami 1' });
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      const firstBody = first.body as WarehouseJson;
      expect(firstBody).toMatchObject({
        name: 'Ana depo',
        addressLine: 'Bakı, Nizami 1',
        isDefault: true,
        status: 'active',
      });
      expect(await profileDefault(who.businessId)).toBe(firstBody.id);

      const second = await createWarehouse(who, { name: 'Gəncə deposu' });
      expect(second.status).toBe(201);
      expect(second.body).toMatchObject({ isDefault: false, addressLine: null });

      const list = await listWarehouses(who);
      expect(list.status).toBe(200);
      expect((list.body as WarehouseJson[]).map((w) => [w.name, w.isDefault])).toEqual([
        ['Ana depo', true],
        ['Gəncə deposu', false],
      ]);

      const audits = await platformRows<{ action: string }>(
        `select action from audit_logs where business_id = $1 and action = 'warehouse.created'`,
        [who.businessId],
      );
      expect(audits).toHaveLength(2);
    });

    it('US-011-AC2: plan limiti 1 iken ikinci depo reddedilir (403 ENTITLEMENT_LIMIT_REACHED)', async () => {
      const who = await seller({ maxWarehouses: 1 });
      expect((await createWarehouse(who, { name: 'Tək depo' })).status).toBe(201);
      const response = await createWarehouse(who, { name: 'İkinci depo' });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'ENTITLEMENT_LIMIT_REACHED',
        details: { key: 'warehouses.max', limit: 1 },
      });
      expect((await listWarehouses(who)).body).toHaveLength(1);
    });

    it('US-011-AC2: limit 1 iken eşzamanlı iki istekten yalnız biri depo açar', async () => {
      const who = await seller({ maxWarehouses: 1 });
      const results = await Promise.all([
        createWarehouse(who, { name: 'Yarış A' }),
        createWarehouse(who, { name: 'Yarış B' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
      expect((await listWarehouses(who)).body).toHaveLength(1);
    });

    it('US-011-AC2: pasif depo sayılmaz; etkinleştirme de limite tabidir', async () => {
      const who = await seller({ maxWarehouses: 2 });
      await createWarehouse(who, { name: 'D1' });
      const d2 = (await createWarehouse(who, { name: 'D2' })).body as WarehouseJson;
      expect((await patchWarehouse(who, d2.id, { status: 'inactive' })).status).toBe(200);
      expect((await createWarehouse(who, { name: 'D3' })).status).toBe(201);
      const reactivate = await patchWarehouse(who, d2.id, { status: 'active' });
      expect(reactivate.status).toBe(403);
      expect((reactivate.body as ErrorJson).code).toBe('ENTITLEMENT_LIMIT_REACHED');
    });

    it('US-011-AC2: aboneliği/hak değeri olmayan işletme depo açamaz', async () => {
      const who = await seller({ subscription: false });
      const response = await createWarehouse(who, { name: 'Aboneliksiz' });
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('ENTITLEMENT_LIMIT_REACHED');
    });

    it('US-011-AC3: depo silinemez (DELETE ucu yok), yalnız pasifleştirilir', async () => {
      const who = await seller({ maxWarehouses: null });
      await createWarehouse(who, { name: 'Varsayılan' });
      const other = (await createWarehouse(who, { name: 'Stoklu depo' })).body as WarehouseJson;
      const del = await http().delete(`/api/v1/warehouses/${other.id}`).set(who.auth);
      expect(del.status).toBe(404);
      const inactive = await patchWarehouse(who, other.id, { status: 'inactive' });
      expect(inactive.status).toBe(200);
      expect(inactive.body).toMatchObject({ id: other.id, status: 'inactive' });
      expect((await listWarehouses(who)).body).toHaveLength(2);
    });

    it('US-011-AC3: varsayılan depo pasifleştirilemez; pasif depo varsayılan yapılamaz (409)', async () => {
      const who = await seller({ maxWarehouses: null });
      const main = (await createWarehouse(who, { name: 'Ana' })).body as WarehouseJson;
      const other = (await createWarehouse(who, { name: 'Yan' })).body as WarehouseJson;
      const deactivateDefault = await patchWarehouse(who, main.id, { status: 'inactive' });
      expect(deactivateDefault.status).toBe(409);
      expect((deactivateDefault.body as ErrorJson).code).toBe('INVALID_STATE_TRANSITION');

      await patchWarehouse(who, other.id, { status: 'inactive' });
      const defaultInactive = await patchWarehouse(who, other.id, { isDefault: true });
      expect(defaultInactive.status).toBe(409);
    });

    it('F2.6: varsayılan depo değişir; eski varsayılan kalkar, satıcı profili eşitlenir', async () => {
      const who = await seller({ maxWarehouses: null });
      const main = (await createWarehouse(who, { name: 'Ana' })).body as WarehouseJson;
      const other = (await createWarehouse(who, { name: 'Yeni ana' })).body as WarehouseJson;
      const response = await patchWarehouse(who, other.id, {
        isDefault: true,
        name: 'Yeni ana depo',
        addressLine: null,
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject({ isDefault: true, name: 'Yeni ana depo' });
      const list = (await listWarehouses(who)).body as WarehouseJson[];
      expect(list.find((w) => w.id === main.id)?.isDefault).toBe(false);
      expect(await profileDefault(who.businessId)).toBe(other.id);
      // Artık eski varsayılan pasifleştirilebilir.
      expect((await patchWarehouse(who, main.id, { status: 'inactive' })).status).toBe(200);
    });

    it('F2.6: geçersiz gövde 422 (boş ad, bilinmeyen alan, isDefault false)', async () => {
      const who = await seller({ maxWarehouses: null });
      expect((await createWarehouse(who, { name: '  ' })).status).toBe(422);
      expect((await createWarehouse(who, { name: 'A', isDefault: true })).status).toBe(422);
      const w = (await createWarehouse(who, { name: 'A' })).body as WarehouseJson;
      expect((await patchWarehouse(who, w.id, { isDefault: false })).status).toBe(422);
      expect((await patchWarehouse(who, w.id, {})).status).toBe(422);
    });

    it('F2.6: perakendeci (buyer) depo uçlarını kullanamaz (403 CAPABILITY_REQUIRED)', async () => {
      const buyer = await seller({ capability: 'buyer' });
      const response = await createWarehouse(buyer, { name: 'Olmaz' });
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('CAPABILITY_REQUIRED');
      expect((await listWarehouses(buyer)).status).toBe(403);
    });

    it('F2.6: business.manage izni olmayan toptancı personeli depo açamaz (403)', async () => {
      const owner = await seller({ maxWarehouses: null });
      const staffId = await addMemberFromTemplate(owner.businessId, 'seller_sales_rep');
      const staff = await as(staffId, owner.businessId);
      const response = await createWarehouse(staff, { name: 'Personel deposu' });
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('PERMISSION_DENIED');
    });
  });

  describe('satıcı profili', () => {
    const getProfile = (who: Seller) => http().get('/api/v1/business/seller-profile').set(who.auth);
    const patchProfile = (who: Seller, body: object) =>
      http().patch('/api/v1/business/seller-profile').set(who.auth).send(body);

    it('F2.6: profil okunur ve güncellenir (tanıtım metni, minimum tutar, teslim fotoğrafı)', async () => {
      const who = await seller();
      const initial = await getProfile(who);
      expect(initial.status).toBe(200);
      expect(initial.body).toEqual({
        description: null,
        minOrderAmount: null,
        requireDeliveryPhoto: false,
        defaultWarehouseId: null,
      });

      const response = await patchProfile(who, {
        description: { az: 'Topdan ərzaq', tr: 'Toptan gıda', ru: '' },
        minOrderAmount: '150.50',
        requireDeliveryPhoto: true,
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toEqual({
        description: { az: 'Topdan ərzaq', tr: 'Toptan gıda' },
        minOrderAmount: '150.50',
        requireDeliveryPhoto: true,
        defaultWarehouseId: null,
      });

      const cleared = await patchProfile(who, { minOrderAmount: null, description: { az: '' } });
      expect(cleared.body).toMatchObject({
        description: null,
        minOrderAmount: null,
        requireDeliveryPhoto: true,
      });

      const audits = await platformRows<{ action: string }>(
        `select action from audit_logs where business_id = $1 and action = 'seller_profile.updated'`,
        [who.businessId],
      );
      expect(audits).toHaveLength(2);
    });

    it('F2.6: minimum tutar metin para; negatif, 3 ondalık veya sayı reddedilir (422)', async () => {
      const who = await seller();
      for (const minOrderAmount of ['-1', '1.234', 'abc', 10, '1e5', '1234567890123']) {
        const response = await patchProfile(who, { minOrderAmount });
        expect(response.status, String(minOrderAmount)).toBe(422);
      }
      expect((await patchProfile(who, { stockMode: 'none' })).status).toBe(422);
      expect((await patchProfile(who, {})).status).toBe(422);
    });

    it('F2.6: perakendeci satıcı profiline erişemez (403 CAPABILITY_REQUIRED)', async () => {
      const buyer = await seller({ capability: 'buyer' });
      const response = await getProfile(buyer);
      expect(response.status).toBe(403);
      expect((response.body as ErrorJson).code).toBe('CAPABILITY_REQUIRED');
    });
  });

  describe('hizmet bölgeleri', () => {
    const getAreas = (who: Seller) => http().get('/api/v1/business/service-areas').set(who.auth);
    const putAreas = (who: Seller, regionIds: unknown) =>
      http().put('/api/v1/business/service-areas').set(who.auth).send({ regionIds });

    const region = newRegion;

    it('F2.6: hizmet bölgeleri bütünüyle değişir; tekrar eden kimlik bir kez yazılır', async () => {
      const who = await seller();
      const [r1, r2, r3] = [await region('HB 1'), await region('HB 2'), await region('HB 3')];
      expect((await getAreas(who)).body).toEqual({ regionIds: [] });

      const first = await putAreas(who, [r1, r2, r1]);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect([...(first.body as { regionIds: string[] }).regionIds].sort()).toEqual(
        [r1, r2].sort(),
      );

      const second = await putAreas(who, [r3]);
      expect(second.body).toEqual({ regionIds: [r3] });
      expect((await getAreas(who)).body).toEqual({ regionIds: [r3] });

      expect((await putAreas(who, [])).body).toEqual({ regionIds: [] });

      const audits = await platformRows<{ action: string }>(
        `select action from audit_logs where business_id = $1 and action = 'service_areas.updated'`,
        [who.businessId],
      );
      expect(audits).toHaveLength(3);
    });

    it('F2.6: bilinmeyen bölge 422 (regionIds not_found); liste değişmez', async () => {
      const who = await seller();
      const r1 = await region('HB bilinen');
      await putAreas(who, [r1]);
      const response = await putAreas(who, [r1, randomUUID()]);
      expect(response.status).toBe(422);
      expect((response.body as ErrorJson).details).toEqual({ regionIds: ['not_found'] });
      expect((await getAreas(who)).body).toEqual({ regionIds: [r1] });
      expect((await putAreas(who, ['not-a-uuid'])).status).toBe(422);
    });
  });
});
