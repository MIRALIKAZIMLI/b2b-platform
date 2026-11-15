// F2.17 bağlantısız hesap politikası (US-027 AC1–AC5; state-machines §9). Gerçek PostgreSQL + Redis;
// saat sabit (`FixedClock`, zaman yolculuğu). İş worker'daki gibi elle kurulur; giriş/yenileme API
// uygulamasının `SessionService`'iyle aynı saatte yapılır. Sayaç (`dormant_since`) her testte
// test perakendecisi için doğrudan yazılır; diğer dosyaların perakendecileri (sayaç = gerçek saat)
// sabit saatin gerisinde kalmaz, sonuçlar yalnız işletme bazında denetlenir.
import { randomBytes, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SETTING_DEFINITIONS, type SettingKey } from '@b2b/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { AuditService } from '../../../core/audit';
import { Clock, FixedClock } from '../../../core/clock';
import { OpsMetricsWriter, ScheduledJobRunner } from '../../../core/ops-metrics';
import { OutboxWriter } from '../../../core/outbox';
import { REDIS_CLIENT, type RedisLockClient } from '../../../infrastructure/redis';
import {
  type Buyer,
  insertBlock,
  insertCancelledConnection,
  insertRequest,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
  type Seller,
} from './dormant-fixtures';
import { SessionService } from '../../identity';
import type { SettingsService } from '../../settings';
import { DORMANT_ACCOUNTS_JOB, DormantAccountsJob } from '../jobs/dormant-accounts.job';
import { DormantRepository } from '../jobs/dormant.repository';

// Eşzamanlı iki çalışma gerçek paralel işlem ister (setup-env havuzu tek bağlantı yapar).
process.env.DB_POOL_MAX = '6';

const NOW = new Date('2026-11-20T02:00:00Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const noLock: RedisLockClient = {
  set: () => Promise.resolve('OK'),
  eval: () => Promise.resolve(0),
};

function daysAgo(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() - days * DAY);
}

describe('F2.17 bağlantısız hesap politikası', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let sessions: SessionService;
  const clock = new FixedClock(NOW);
  let region: string;
  let otherRegion: string;

  const settings = {
    get: (key: SettingKey): Promise<unknown> => Promise.resolve(SETTING_DEFINITIONS[key].default),
  };

  function job(lock: RedisLockClient = redis.client): DormantAccountsJob {
    return new DormantAccountsJob(
      new DormantRepository(),
      new OutboxWriter(),
      new AuditService(clock),
      settings as unknown as SettingsService,
      clock,
      new ScheduledJobRunner(lock, clock, new OpsMetricsWriter()),
    );
  }

  /** Test perakendecisinin sayaç ve aşamasını kurar (platform bağlamı; bekçi izin verir). */
  async function setDormant(
    buyerId: string,
    input: {
      since: Date;
      stage?: string;
      stageAt?: Date | null;
      status?: 'active' | 'dormant';
    },
  ): Promise<void> {
    await platformRows(
      `update buyer_profiles set dormant_since = $2, dormant_stage = $3, dormant_stage_at = $4
        where business_id = $1`,
      [buyerId, input.since, input.stage ?? 'none', input.stageAt ?? null],
    );
    if (input.status === 'dormant') {
      await platformRows(`update businesses set status = 'dormant' where id = $1`, [buyerId]);
    }
  }

  async function profile(buyerId: string) {
    const [row] = await platformRows<{
      status: string;
      stage: string;
      stage_at: Date | null;
      since: Date;
    }>(
      `select b.status, bp.dormant_stage as stage, bp.dormant_stage_at as stage_at,
              bp.dormant_since as since
         from businesses b join buyer_profiles bp on bp.business_id = b.id where b.id = $1`,
      [buyerId],
    );
    return row;
  }

  async function events(type: string, aggregateId: string) {
    return await platformRows<{ payload: Record<string, unknown>; business_ids: string[] }>(
      `select payload, business_ids from outbox_events
        where type = $1 and aggregate_id = $2 order by id`,
      [type, aggregateId],
    );
  }

  async function audits(action: string, targetId: string) {
    return await platformRows<{ actor_type: string; actor_user_id: string | null; after: unknown }>(
      `select actor_type, actor_user_id, after from audit_logs
        where action = $1 and target_id = $2 order by id`,
      [action, targetId],
    );
  }

  async function sellerIn(regionId: string): Promise<Seller> {
    return await newSeller(regionId, [regionId]);
  }

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [
        { provide: REDIS_CLIENT, useValue: redis.client },
        { provide: Clock, useValue: clock },
      ],
    });
    sessions = app.get(SessionService);
    region = await newRegion('Passiv bölgə');
    otherRegion = await newRegion('Başqa bölgə');
  });

  beforeEach(() => {
    clock.set(NOW);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  it('US-027-AC1 7. günde perakendeci adminine hatırlatma, bölgedeki toptancı adminlerine yeni perakendeci', async () => {
    const near = await sellerIn(region);
    const far = await sellerIn(otherRegion);
    const blocked = await sellerIn(region);
    const buyer = await newBuyer(region);
    await insertBlock(buyer, blocked);
    const fresh = await newBuyer(region);
    await setDormant(buyer.businessId, { since: daysAgo(7) });
    await setDormant(fresh.businessId, { since: daysAgo(6) });

    await job().run();

    expect(await profile(buyer.businessId)).toMatchObject({ stage: 'reminded_7', stage_at: NOW });
    expect(await events('buyer.dormant_reminder', buyer.businessId)).toEqual([
      {
        payload: { businessId: buyer.businessId, userId: buyer.admin.userId, stage: 'reminded_7' },
        business_ids: [buyer.businessId],
      },
    ]);
    const sellers = await events('buyer.dormant_new_buyer', buyer.businessId);
    expect(sellers).toEqual([
      {
        payload: {
          buyerId: buyer.businessId,
          businessId: near.businessId,
          userId: near.admin.userId,
        },
        business_ids: [near.businessId],
      },
    ]);
    expect(JSON.stringify(sellers)).not.toContain(far.businessId);
    // 6. günde hiçbir şey yok.
    expect(await profile(fresh.businessId)).toMatchObject({ stage: 'none' });
    expect(await events('buyer.dormant_reminder', fresh.businessId)).toEqual([]);

    // Aynı gece ikinci çalışma: yeni olay yok.
    await job().run();
    expect(await events('buyer.dormant_reminder', buyer.businessId)).toHaveLength(1);
  });

  it('US-027-AC1 30. günde ikinci tur; dizinde gizli perakendeci toptancılara bildirilmez', async () => {
    await sellerIn(region);
    const hidden = await newBuyer(region, false);
    await setDormant(hidden.businessId, {
      since: daysAgo(30),
      stage: 'reminded_7',
      stageAt: daysAgo(23),
    });

    await job().run();

    expect(await profile(hidden.businessId)).toMatchObject({ stage: 'reminded_30' });
    expect(await events('buyer.dormant_reminder', hidden.businessId)).toHaveLength(1);
    expect(await events('buyer.dormant_new_buyer', hidden.businessId)).toEqual([]);
  });

  it('US-027-AC2 90. günde "30 gün sonra pasifleşecek"; kaçırılan gecede hatırlatma atlanır', async () => {
    const buyer = await newBuyer(region);
    await setDormant(buyer.businessId, { since: daysAgo(95) });

    await job().run();

    expect(await profile(buyer.businessId)).toMatchObject({ stage: 'warned', status: 'active' });
    expect(await events('buyer.dormant_reminder', buyer.businessId)).toEqual([]);
    expect(await events('buyer.dormant_warning', buyer.businessId)).toEqual([
      {
        payload: { businessId: buyer.businessId, userId: buyer.admin.userId, days: 30 },
        business_ids: [buyer.businessId],
      },
    ]);
  });

  it('US-027-AC3 120. günde dormant ve dizinden çıkar; uyarıdan 30 gün geçmeden pasifleşmez', async () => {
    const buyer = await newBuyer(region);
    const lateWarned = await newBuyer(region);
    await setDormant(buyer.businessId, {
      since: daysAgo(120),
      stage: 'warned',
      stageAt: daysAgo(30),
    });
    await setDormant(lateWarned.businessId, {
      since: daysAgo(125),
      stage: 'warned',
      stageAt: daysAgo(10),
    });

    await job().run();

    expect(await profile(buyer.businessId)).toMatchObject({
      status: 'dormant',
      stage: 'deactivated',
    });
    expect(await audits('business.dormant_deactivated', buyer.businessId)).toEqual([
      expect.objectContaining({ actor_type: 'system', actor_user_id: null }),
    ]);
    expect(await events('buyer.profile_changed', buyer.businessId)).toHaveLength(1);
    expect(await profile(lateWarned.businessId)).toMatchObject({
      status: 'active',
      stage: 'warned',
    });
  });

  it('US-027-AC3 dormant hesabın üyesi giriş yapınca hesap active olur, aşama none, sayaç sıfır', async () => {
    const buyer = await newBuyer(region);
    await setDormant(buyer.businessId, {
      since: daysAgo(130),
      stage: 'deactivated',
      stageAt: daysAgo(10),
      status: 'dormant',
    });

    await sessions.openSession(buyer.admin.userId);

    expect(await profile(buyer.businessId)).toEqual({
      status: 'active',
      stage: 'none',
      stage_at: null,
      since: NOW,
    });
    expect(await audits('business.reactivated', buyer.businessId)).toEqual([
      expect.objectContaining({ actor_type: 'user', actor_user_id: buyer.admin.userId }),
    ]);
    expect(await events('buyer.profile_changed', buyer.businessId)).toHaveLength(1);
  });

  it('US-027-AC3 oturum yenileme de giriş sayılır; dakika sınırı içindeki yenileme yazmaz', async () => {
    const buyer = await newBuyer(region);
    await setDormant(buyer.businessId, {
      since: daysAgo(40),
      stage: 'reminded_30',
      stageAt: daysAgo(10),
    });
    const opened = await sessions.openSession(buyer.admin.userId);
    if (opened.nextStep !== 'none') throw new Error('oturum açılmadı');
    expect(await profile(buyer.businessId)).toMatchObject({ stage: 'none', since: NOW });

    clock.advance(30 * MINUTE);
    const first = await sessions.refresh(opened.refreshToken);
    expect((await profile(buyer.businessId))?.since).toEqual(NOW);

    clock.advance(31 * MINUTE);
    await sessions.refresh(first.refreshToken);
    expect((await profile(buyer.businessId))?.since).toEqual(clock.now());
  });

  it('US-027-AC3 Mimar notu 1: her gün giren hesap hatırlatma almaz, pasifleşmez', async () => {
    const buyer = await newBuyer(region);
    await setDormant(buyer.businessId, { since: daysAgo(5) });
    for (let day = 1; day <= 130; day += 5) {
      clock.set(new Date(NOW.getTime() + day * DAY));
      await sessions.openSession(buyer.admin.userId);
      // Ara gecelerden yalnız bazıları (diğer dosyaların perakendecileri çok ilerlemesin).
      if (day === 6 || day === 36) await job().run();
    }
    clock.set(new Date(NOW.getTime() + 130 * DAY));
    await job().run();
    expect(await profile(buyer.businessId)).toMatchObject({ status: 'active', stage: 'none' });
    expect(await events('buyer.dormant_reminder', buyer.businessId)).toEqual([]);
  });

  it('US-027-AC4 S1 = B: geçmişsiz pasif hesap 180. günde kalıcı silinir', async () => {
    const buyer = await newBuyer(region);
    await platformRows(
      `insert into person_data (id, business_id, contact_name) values ($1, $2, 'Test Yetkili')`,
      [randomUUID(), buyer.businessId],
    );
    await setDormant(buyer.businessId, {
      since: daysAgo(180),
      stage: 'deactivated',
      stageAt: daysAgo(60),
      status: 'dormant',
    });

    await job().run();

    expect(
      await platformRows('select id from businesses where id = $1', [buyer.businessId]),
    ).toEqual([]);
    expect(
      await platformRows('select id from person_data where business_id = $1', [buyer.businessId]),
    ).toEqual([]);
    expect(await audits('business.dormant_purged', buyer.businessId)).toEqual([
      {
        actor_type: 'system',
        actor_user_id: null,
        after: { status: null, personDataDeleted: true, invitationsClosed: 0, files: 0 },
      },
    ]);
    expect(await events('buyer.profile_changed', buyer.businessId)).toHaveLength(1);
    // Kullanıcı hesabı silinmez (V4).
    expect(
      await platformRows('select id from users where id = $1', [buyer.admin.userId]),
    ).toHaveLength(1);
  });

  it('US-027-AC4 S1 = B: istek geçmişi olan pasif hesap arşivlenir, kişisel veri silinir, davet kapanır', async () => {
    const seller = await sellerIn(region);
    const buyer = await newBuyer(region);
    const request = await insertRequest({
      seller,
      buyer,
      status: 'rejected',
      createdAt: daysAgo(170),
    });
    await platformRows(
      `insert into person_data (id, business_id, contact_name) values ($1, $2, 'Test Yetkili')`,
      [randomUUID(), buyer.businessId],
    );
    const invitation = randomUUID();
    await platformRows(
      `insert into invitations (id, business_id, phone_e164, role_id, job_title_id, token_hash,
                                expires_at, created_by)
       select $1, m.business_id, '+994500000001', m.role_id, m.job_title_id, $3,
              $4::timestamptz + interval '3 days', m.user_id
         from memberships m where m.business_id = $2 limit 1`,
      [invitation, buyer.businessId, randomBytes(32).toString('hex'), NOW],
    );
    await setDormant(buyer.businessId, {
      since: daysAgo(181),
      stage: 'deactivated',
      stageAt: daysAgo(61),
      status: 'dormant',
    });

    await job().run();

    expect(await profile(buyer.businessId)).toMatchObject({ status: 'archived' });
    expect(
      await platformRows('select id from person_data where business_id = $1', [buyer.businessId]),
    ).toEqual([]);
    const [inv] = await platformRows<{ expires_at: Date }>(
      'select expires_at from invitations where id = $1',
      [invitation],
    );
    expect(inv?.expires_at).toEqual(NOW);
    expect(
      await platformRows('select id from connection_requests where id = $1', [request]),
    ).toHaveLength(1);
    expect(await audits('business.dormant_archived', buyer.businessId)).toEqual([
      expect.objectContaining({
        after: { status: 'archived', personDataDeleted: true, invitationsClosed: 1, files: 0 },
      }),
    ]);
  });

  it('US-027-AC4 pasifleşmeden 60 gün geçmeden silinmez', async () => {
    const buyer = await newBuyer(region);
    await setDormant(buyer.businessId, {
      since: daysAgo(200),
      stage: 'deactivated',
      stageAt: daysAgo(30),
      status: 'dormant',
    });
    await job().run();
    expect(await profile(buyer.businessId)).toMatchObject({ status: 'dormant' });
  });

  it('US-027-AC5 bağlantısı olan (iptal edilmiş dahil) hesaba politika uygulanmaz', async () => {
    const seller = await sellerIn(region);
    const buyer: Buyer = await newBuyer(region);
    await insertCancelledConnection(seller, buyer, daysAgo(300));
    await setDormant(buyer.businessId, { since: daysAgo(250) });

    await job().run();

    expect(await profile(buyer.businessId)).toMatchObject({ status: 'active', stage: 'none' });
    expect(await events('buyer.dormant_warning', buyer.businessId)).toEqual([]);
  });

  it('F2.17 tek etki: kilitsiz iki eşzamanlı çalışma her perakendeciyi bir kez ilerletir', async () => {
    const buyers = await Promise.all([newBuyer(region), newBuyer(region), newBuyer(region)]);
    for (const buyer of buyers) await setDormant(buyer.businessId, { since: daysAgo(8) });

    await Promise.all([job(noLock).run(), job(noLock).run()]);

    for (const buyer of buyers) {
      expect(await events('buyer.dormant_reminder', buyer.businessId)).toHaveLength(1);
    }
  });

  it('F2.17 başarılı çalışma ops_metrics kaydı yazar', async () => {
    clock.set(new Date(NOW.getTime() + 3 * MINUTE));
    await job().run();
    const rows = await platformRows<{ measured_at: Date }>(
      `select measured_at from ops_metrics where key = $1 order by id desc limit 1`,
      [`job.${DORMANT_ACCOUNTS_JOB}`],
    );
    expect(rows).toEqual([{ measured_at: clock.now() }]);
  });
});
