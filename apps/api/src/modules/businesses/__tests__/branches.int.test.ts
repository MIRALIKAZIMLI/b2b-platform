// F2.5 (US-010): şubeler ve onay kuralı. Perakendeci işletmesi fikstürle açılır (onaylı `buyer`,
// şablondan admin rolü, `buyer_free`). Uygulama bağlantısı RLS'e tabi app_user.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { randomTestPhone } from '../../../../test/users';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import { TokenService } from '../../identity';
import {
  addMemberFromTemplate,
  newRegion,
  newTestBusiness,
  platformRows,
  runSetupSeeds,
} from './seller-fixtures';

interface Who {
  readonly businessId: string;
  readonly auth: Record<string, string>;
}

interface BranchJson {
  readonly id: string;
  readonly name: string;
  readonly regionId: string | null;
  readonly addressLine: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly approvalRule: string;
  readonly approvalThreshold: string | null;
  readonly status: string;
}

interface ErrorJson {
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

describe('F2.5 şubeler ve onay kuralı (US-010)', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let regionId: string;

  beforeAll(async () => {
    await runSetupSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    regionId = await newRegion('F2.5 şube bölgesi');
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function as(userId: string, businessId: string): Promise<Who> {
    const signed = await app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return {
      businessId,
      auth: { Authorization: `Bearer ${signed.token}`, 'X-Business-Id': businessId },
    };
  }

  async function buyer(): Promise<Who> {
    const business = await newTestBusiness({ capability: 'buyer' });
    return await as(business.adminUserId, business.businessId);
  }

  const create = (who: Who, body: object) =>
    http().post('/api/v1/branches').set(who.auth).send(body);
  const patch = (who: Who, id: string, body: object) =>
    http().patch(`/api/v1/branches/${id}`).set(who.auth).send(body);
  const list = (who: Who) => http().get('/api/v1/branches').set(who.auth);

  const valid = () => ({ name: 'Mərkəz', regionId, addressLine: 'Nizami küç. 10' });

  async function created(who: Who, body: object = valid()): Promise<BranchJson> {
    const res = await create(who, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as BranchJson;
  }

  describe('AC1 oluşturma', () => {
    it('US-010-AC1 ad, bölge, adres, konum ve onay kuralıyla şube oluşur ve listede döner', async () => {
      const who = await buyer();
      const branch = await created(who, {
        ...valid(),
        lat: 40.409264,
        lng: 49.867092,
        approvalRule: 'above_amount',
        approvalThreshold: '500.00',
      });
      expect(branch).toMatchObject({
        name: 'Mərkəz',
        regionId,
        addressLine: 'Nizami küç. 10',
        lat: 40.409264,
        lng: 49.867092,
        approvalRule: 'above_amount',
        approvalThreshold: '500.00',
        status: 'active',
      });
      const listed = await list(who);
      expect(listed.status).toBe(200);
      expect((listed.body as BranchJson[]).map((row) => row.id)).toContain(branch.id);
      const one = await http().get(`/api/v1/branches/${branch.id}`).set(who.auth);
      expect(one.body).toEqual(branch);
      const [audit] = await platformRows<{ action: string }>(
        "select action from audit_logs where target_id = $1 and action = 'branch.created'",
        [branch.id],
      );
      expect(audit?.action).toBe('branch.created');
    });

    it('US-010-AC1 above_amount eşiksiz 422; eşik başka kuralda 422; sıfır eşik 422', async () => {
      const who = await buyer();
      const missing = await create(who, { ...valid(), approvalRule: 'above_amount' });
      expect(missing.status).toBe(422);
      expect((missing.body as ErrorJson).details).toMatchObject({
        approvalThreshold: ['required'],
      });
      const extra = await create(who, {
        ...valid(),
        approvalRule: 'none',
        approvalThreshold: '10',
      });
      expect(extra.status).toBe(422);
      const zero = await create(who, {
        ...valid(),
        approvalRule: 'above_amount',
        approvalThreshold: '0.00',
      });
      expect(zero.status).toBe(422);
    });

    it('US-010-AC1 eksik alan, bilinmeyen bölge, tek koordinat ve aralık dışı konum 422', async () => {
      const who = await buyer();
      expect((await create(who, { name: 'X', regionId })).status).toBe(422);
      const region = await create(who, { ...valid(), regionId: randomUUID() });
      expect(region.status).toBe(422);
      expect((region.body as ErrorJson).details).toMatchObject({ regionId: ['not_found'] });
      expect((await create(who, { ...valid(), lat: 40.1 })).status).toBe(422);
      expect((await create(who, { ...valid(), lat: 91, lng: 49 })).status).toBe(422);
      expect((await create(who, { ...valid(), id: randomUUID() })).status).toBe(422);
    });
  });

  describe('AC3 varsayılan kural', () => {
    it('US-010-AC3 kural verilmeden açılan şube every_order; veritabanı varsayılanı every_order', async () => {
      const who = await buyer();
      const branch = await created(who);
      expect(branch.approvalRule).toBe('every_order');
      expect(branch.approvalThreshold).toBeNull();
      const [row] = await platformRows<{ approval_rule: string }>(
        `insert into branches (id, business_id, name) values ($1, $2, 'Kayıt şubesi')
         returning approval_rule`,
        [randomUUID(), who.businessId],
      );
      expect(row?.approval_rule).toBe('every_order');
    });
  });

  describe('düzenleme (PATCH kısmi)', () => {
    it('US-010-AC1 kural above_amount dışına geçince eşik silinir (T4); above_amount eşiksiz 422', async () => {
      const who = await buyer();
      const branch = await created(who, {
        ...valid(),
        approvalRule: 'above_amount',
        approvalThreshold: '250.50',
      });
      const toNone = await patch(who, branch.id, { approvalRule: 'none' });
      expect(toNone.status).toBe(200);
      expect(toNone.body).toMatchObject({ approvalRule: 'none', approvalThreshold: null });
      const back = await patch(who, branch.id, { approvalRule: 'above_amount' });
      expect(back.status).toBe(422);
      expect((back.body as ErrorJson).details).toMatchObject({ approvalThreshold: ['required'] });
      const ok = await patch(who, branch.id, {
        approvalRule: 'above_amount',
        approvalThreshold: '300',
      });
      expect(ok.status).toBe(200);
      const thresholdOnly = await patch(who, branch.id, { approvalThreshold: '400.00' });
      expect(thresholdOnly.body).toMatchObject({ approvalThreshold: '400.00' });
      const thresholdOnNone = await created(who);
      expect((await patch(who, thresholdOnNone.id, { approvalThreshold: '5' })).status).toBe(422);
    });

    it('US-010-AC1 ad, adres, bölge ve konum değişir; konum null ile silinir; boş gövde 422', async () => {
      const who = await buyer();
      const branch = await created(who, { ...valid(), lat: 40, lng: 49 });
      const other = await newRegion('F2.5 ikinci bölge');
      const res = await patch(who, branch.id, {
        name: 'Yeni ad',
        addressLine: 'Yeni ünvan',
        regionId: other,
        lat: null,
        lng: null,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Yeni ad',
        addressLine: 'Yeni ünvan',
        regionId: other,
        lat: null,
        lng: null,
      });
      expect((await patch(who, branch.id, {})).status).toBe(422);
      expect((await patch(who, branch.id, { lat: 40 })).status).toBe(422);
      expect((await patch(who, randomUUID(), { name: 'Yok' })).status).toBe(404);
    });
  });

  describe('AC4 silme yok, pasifleştirme', () => {
    it('US-010-AC4 silme ucu yok; PATCH status inactive ile pasifleşir ve yeniden etkinleşir', async () => {
      const who = await buyer();
      const first = await created(who);
      const second = await created(who, { ...valid(), name: 'İkinci' });
      const deleted = await http().delete(`/api/v1/branches/${second.id}`).set(who.auth);
      expect(deleted.status).toBe(404);
      const off = await patch(who, second.id, { status: 'inactive' });
      expect(off.status).toBe(200);
      expect(off.body).toMatchObject({ status: 'inactive' });
      const on = await patch(who, second.id, { status: 'active' });
      expect(on.body).toMatchObject({ status: 'active' });
      expect(first.status).toBe('active');
    });

    it('US-010-AC4 son aktif şube pasifleşemez 409 (T3)', async () => {
      const who = await buyer();
      const only = await created(who);
      const res = await patch(who, only.id, { status: 'inactive' });
      expect(res.status).toBe(409);
      expect(res.body as ErrorJson).toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        details: { reason: 'last_active_branch' },
      });
    });

    it('US-010-AC4 S3 aktif üyesi olan şube pasifleşemez 409; üye taşınınca pasifleşir', async () => {
      const who = await buyer();
      await created(who, { ...valid(), name: 'Ana' });
      const target = await created(who, { ...valid(), name: 'Üyeli' });
      const userId = await addMemberFromTemplate(who.businessId, 'buyer_branch_staff');
      await platformRows(
        'update memberships set branch_id = $1 where business_id = $2 and user_id = $3',
        [target.id, who.businessId, userId],
      );
      const blocked = await patch(who, target.id, { status: 'inactive' });
      expect(blocked.status).toBe(409);
      expect(blocked.body as ErrorJson).toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        details: { reason: 'branch_in_use', members: 1, invitations: 0 },
      });
      await platformRows(
        "update memberships set status = 'removed' where business_id = $1 and user_id = $2",
        [who.businessId, userId],
      );
      expect((await patch(who, target.id, { status: 'inactive' })).status).toBe(200);
    });

    it('US-010-AC4 S3 açık daveti olan şube pasifleşemez 409; davet geri çekilince pasifleşir', async () => {
      const who = await buyer();
      await created(who, { ...valid(), name: 'Ana' });
      const target = await created(who, { ...valid(), name: 'Davetli' });
      await addMemberFromTemplate(who.businessId, 'buyer_branch_staff');
      const [ids] = await platformRows<{ role_id: string; job_title_id: string }>(
        `select r.id as role_id, j.id as job_title_id
           from roles r join role_templates t on t.id = r.source_template_id
           join job_titles j on j.code = t.code
          where r.business_id = $1 and t.code = 'buyer_branch_staff' and not r.is_custom`,
        [who.businessId],
      );
      const invited = await http().post('/api/v1/team/invitations').set(who.auth).send({
        phone: randomTestPhone(),
        fullName: 'Davetli işçi',
        roleId: ids?.role_id,
        jobTitleId: ids?.job_title_id,
        branchId: target.id,
      });
      expect(invited.status, JSON.stringify(invited.body)).toBe(201);
      const blocked = await patch(who, target.id, { status: 'inactive' });
      expect(blocked.status).toBe(409);
      expect((blocked.body as ErrorJson).details).toMatchObject({
        reason: 'branch_in_use',
        members: 0,
        invitations: 1,
      });
      const invitationId = (invited.body as { invitationId: string }).invitationId;
      const revoked = await http()
        .post(`/api/v1/team/invitations/${invitationId}/revoke`)
        .set(who.auth);
      expect(revoked.status).toBe(204);
      expect((await patch(who, target.id, { status: 'inactive' })).status).toBe(200);
    });

    it('US-010-AC4 eşzamanlı iki pasifleştirme en az bir aktif şube bırakır', async () => {
      const who = await buyer();
      const a = await created(who, { ...valid(), name: 'A' });
      const b = await created(who, { ...valid(), name: 'B' });
      const results = await Promise.all([
        patch(who, a.id, { status: 'inactive' }),
        patch(who, b.id, { status: 'inactive' }),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
      const [row] = await platformRows<{ n: number }>(
        "select count(*)::int as n from branches where business_id = $1 and status = 'active'",
        [who.businessId],
      );
      expect(row?.n).toBe(1);
    });
  });

  describe('yetki', () => {
    it('F2.5 seller işletmesi şube uçlarında 403 CAPABILITY_REQUIRED (T1)', async () => {
      const business = await newTestBusiness();
      const seller = await as(business.adminUserId, business.businessId);
      const res = await list(seller);
      expect(res.status).toBe(403);
      expect((res.body as ErrorJson).code).toBe('CAPABILITY_REQUIRED');
      expect((await create(seller, valid())).status).toBe(403);
    });

    it('F2.5 business.manage izni olmayan üye 403', async () => {
      const who = await buyer();
      const userId = await addMemberFromTemplate(who.businessId, 'buyer_branch_staff');
      const staff = await as(userId, who.businessId);
      expect((await list(staff)).status).toBe(403);
      expect((await create(staff, valid())).status).toBe(403);
    });
  });
});
