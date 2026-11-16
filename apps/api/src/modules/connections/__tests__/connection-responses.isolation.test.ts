// F2.13a kiracı izolasyonu ve veritabanı bekçileri (R19 D okuma, state-machines §1–2, Müfettiş 16
// F2.13 notu). Doğrudan SQL, uygulama rolü app_user (RLS'e tabi): `connection_seller_summaries`
// ve `connection_seller_recipients` çağıran kuralı; durum ve bağlantı bekçi tetikleyicileri.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import {
  type Buyer,
  insertBlock,
  insertConnection,
  insertRequest,
  newBuyer,
  newRegion,
  newSeller,
  runSeeds,
  type Seller,
} from './fixtures';

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

const NOW = new Date();
const TODAY = '2026-11-10';

describe('F2.13a bağlantı yanıtı kiracı izolasyonu ve bekçiler', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let region: string;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyerX: Buyer;
  let buyerY: Buyer;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    region = await newRegion('Bekçi');
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    buyerX = await newBuyer(region);
    buyerY = await newBuyer(region);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  const pendingRequest = (seller: Seller, buyer: Buyer) =>
    insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'pending',
      createdAt: NOW,
      sellerLocalDate: TODAY,
    });

  const summaries = (ids: readonly string[]) => (tx: Tx) =>
    tx.execute(sql`select * from connection_seller_summaries(${`{${ids.join(',')}}`}::uuid[])`);

  it('F2.13a-R19 satıcı özeti yalnız çağıran perakendeciyle ilişkili satıcılar için, yalnız açık alanlar', async () => {
    await pendingRequest(sellerA, buyerX);
    const rows = (await as(buyerX.businessId, summaries([sellerA.businessId, sellerB.businessId])))
      .rows;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      ['categories', 'description', 'id', 'legal_name', 'logo_bucket', 'logo_object_key'].sort(),
    );
    expect(rows[0]?.id).toBe(sellerA.businessId);
    // İlişkisiz perakendeci aynı satıcıyı göremez.
    expect((await as(buyerY.businessId, summaries([sellerA.businessId]))).rows).toHaveLength(0);
    // Engel de ilişkidir (engellenenler listesi).
    await insertBlock(buyerY.businessId, sellerB.businessId, buyerY.admin.userId);
    expect((await as(buyerY.businessId, summaries([sellerB.businessId]))).rows).toHaveLength(1);
  });

  it('F2.13a-R19 satıcı, platform ve bağlamsız çağrı 42501; 50 kimlik sınırı 22023', async () => {
    expect(await errorCode(() => as(sellerA.businessId, summaries([sellerB.businessId])))).toBe(
      '42501',
    );
    expect(
      await errorCode(() =>
        withPlatformTx({ userId: sellerA.admin.userId }, summaries([sellerA.businessId])),
      ),
    ).toBe('42501');
    expect(await errorCode(() => withSystemTx(summaries([sellerA.businessId])))).toBe('42501');
    const many = Array.from({ length: 51 }, () => randomUUID());
    expect(await errorCode(() => as(buyerX.businessId, summaries(many)))).toBe('22023');
  });

  it('F2.13a-R19 bildirim alıcıları yalnız çağıran alıcının yanıtladığı istek için', async () => {
    const id = await pendingRequest(sellerA, buyerY);
    const recipients = (tx: Tx) =>
      tx.execute<{ user_id: string }>(
        sql`select user_id from connection_seller_recipients(${id}::uuid)`,
      );
    // Henüz pending: boş.
    expect((await as(buyerY.businessId, recipients)).rows).toHaveLength(0);
    await as(buyerY.businessId, (tx) =>
      tx.execute(sql`update connection_requests
                        set status = 'rejected', responded_at = now(),
                            responded_by_user_id = ${buyerY.admin.userId}
                      where id = ${id}`),
    );
    expect((await as(buyerY.businessId, recipients)).rows).toEqual([
      { user_id: sellerA.admin.userId },
    ]);
    // Başka perakendeci boş; satıcı bağlamı 42501.
    expect((await as(buyerX.businessId, recipients)).rows).toHaveLength(0);
    expect(await errorCode(() => as(sellerA.businessId, recipients))).toBe('42501');
  });

  it('state-machines §1 bekçi: yanıtı yalnız alıcı, geri çekmeyi yalnız satıcı, yalnız pending → …', async () => {
    const id = await pendingRequest(sellerB, buyerX);
    const setStatus = (businessId: string, status: string, responded: boolean) =>
      as(businessId, (tx) =>
        tx.execute(sql`update connection_requests
                          set status = ${status},
                              responded_at = ${responded ? sql`now()` : sql`null`},
                              responded_by_user_id = ${responded ? buyerX.admin.userId : null}
                        where id = ${id}`),
      );
    expect(await errorCode(() => setStatus(sellerB.businessId, 'accepted', true))).toBe('42501');
    expect(await errorCode(() => setStatus(buyerX.businessId, 'withdrawn', false))).toBe('42501');
    expect(await errorCode(() => setStatus(buyerX.businessId, 'expired', false))).toBe('42501');
    expect(await errorCode(() => setStatus(buyerX.businessId, 'rejected', false))).toBe('23514');
    expect(await errorCode(() => setStatus(sellerB.businessId, 'withdrawn', true))).toBe('23514');
    // Yeni istek pending olmalı.
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into connection_requests
                           (id, seller_id, buyer_id, sent_by_user_id, status, expires_at, seller_local_date)
                         values (${randomUUID()}, ${sellerB.businessId}, ${buyerY.businessId},
                                 ${sellerB.admin.userId}, 'accepted', now(), current_date)`),
        ),
      ),
    ).toBe('23514');

    expect(
      await errorCode(() => setStatus(sellerB.businessId, 'withdrawn', false)),
    ).toBeUndefined();
    // Bitmiş istek bir daha değişmez (yanıt alanı da yazılamaz).
    expect(await errorCode(() => setStatus(buyerX.businessId, 'accepted', true))).toBe('23514');
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`update connection_requests set responded_at = now() where id = ${id}`),
        ),
      ),
    ).toBe('23514');
  });

  it('F2.13a bekçi: bağlantı yalnız aynı çiftin accepted isteğinden, active doğar; iptal geri dönmez', async () => {
    const seller = await newSeller(region);
    const buyer = await newBuyer(region);
    const other = await newSeller(region);
    const accepted = await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'accepted',
      createdAt: NOW,
      sellerLocalDate: TODAY,
    });
    const pendingId = await pendingRequest(seller, buyer);
    const insert = (requestId: string, sellerId: string, status = 'active') =>
      as(buyer.businessId, (tx) =>
        tx.execute(sql`insert into connections (id, seller_id, buyer_id, request_id, status, started_at)
                       values (${randomUUID()}, ${sellerId}, ${buyer.businessId}, ${requestId},
                               ${status},
                               (select responded_at from connection_requests where id = ${requestId}))`),
      );
    // Müfettiş 17 M2: alıcı satıcı koşullarını yazamaz; başlangıç kabul anı, vade önerilen vade.
    const withColumns = (columns: string, values: ReturnType<typeof sql>) =>
      as(buyer.businessId, (tx) =>
        tx.execute(sql`insert into connections (id, seller_id, buyer_id, request_id, ${sql.raw(columns)})
                       values (${randomUUID()}, ${seller.businessId}, ${buyer.businessId}, ${accepted}, ${values})`),
      );
    const respondedAt = sql`(select responded_at from connection_requests where id = ${accepted})`;
    expect(
      await errorCode(() => withColumns('started_at, credit_limit', sql`${respondedAt}, 1000`)),
    ).toBe('23514');
    expect(
      await errorCode(() => withColumns('started_at', sql`${respondedAt} + interval '1 day'`)),
    ).toBe('23514');
    expect(
      await errorCode(() => withColumns('started_at, payment_term_days', sql`${respondedAt}, 30`)),
    ).toBe('23514');
    expect(
      await errorCode(() =>
        withColumns('started_at, branch_pricing_enabled', sql`${respondedAt}, true`),
      ),
    ).toBe('23514');
    expect(
      await errorCode(() =>
        withColumns('started_at, price_list_id', sql`${respondedAt}, ${randomUUID()}`),
      ),
    ).toBe('23514');
    // Bekleyen istekle, başka satıcıyla veya iptal durumunda eklenemez.
    expect(await errorCode(() => insert(pendingId, seller.businessId))).toBe('23514');
    expect(await errorCode(() => insert(accepted, other.businessId))).toBe('23514');
    expect(await errorCode(() => insert(accepted, seller.businessId, 'cancelled'))).toBe('23514');
    // Satıcı bağlantı ekleyemez.
    expect(
      await errorCode(() =>
        as(seller.businessId, (tx) =>
          tx.execute(sql`insert into connections (id, seller_id, buyer_id, request_id, started_at)
                         values (${randomUUID()}, ${seller.businessId}, ${buyer.businessId},
                                 ${accepted}, now())`),
        ),
      ),
    ).toBe('42501');

    const connectionId = await insertConnection({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      requestId: accepted,
      startedAt: NOW,
      cancelled: { at: NOW, by: 'buyer' },
    });
    // Aynı istekten ikinci bağlantı yok (connections_request_uq).
    expect(await errorCode(() => insert(accepted, seller.businessId))).toBe('23505');
    // İptal edilmiş bağlantı yeniden active olmaz.
    expect(
      await errorCode(() =>
        as(buyer.businessId, (tx) =>
          tx.execute(sql`update connections
                            set status = 'active', ended_at = null, ended_by_side = null
                          where id = ${connectionId}`),
        ),
      ),
    ).toBe('23514');
  });

  it('F2.13a T6 seller_profiles_definer_select yalnız migrator; bekçi tetikleyicileri bağlı', async () => {
    const policies = await withSystemTx((tx) =>
      tx.execute<{ policyname: string; roles: string }>(sql`
        select policyname, array_to_string(roles, ',') as roles from pg_policies
         where tablename = 'seller_profiles' and policyname = 'seller_profiles_definer_select'`),
    );
    expect(policies.rows).toEqual([
      { policyname: 'seller_profiles_definer_select', roles: 'migrator' },
    ]);
    const triggers = await withSystemTx((tx) =>
      tx.execute<{ tgname: string }>(sql`
        select tgname from pg_trigger
         where tgname in ('connection_requests_guard', 'connections_guard') and tgenabled = 'O'
         order by tgname`),
    );
    expect(triggers.rows.map((row) => row.tgname)).toEqual([
      'connection_requests_guard',
      'connections_guard',
    ]);
  });
});
