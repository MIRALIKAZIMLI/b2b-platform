// F2.12a kiracı izolasyonu (R18 ilk P tabloları, US-007 AC6, Mimar notu): iki yönlü P politikası,
// T `blocks`, DEFINER fonksiyonlarının çağıran kuralı ve dizin ilişki durumunun yalnız bağlamdaki
// satıcının satırlarından hesaplanması. Uygulama rolü app_user (RLS'e tabi).
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { pgErrorCode } from '../../../../test/isolation';
import { createTestRedis, type TestRedis } from '../../../../test/redis';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import type { TenantContext } from '../../../core/tenant-context';
import { REDIS_CLIENT } from '../../../infrastructure/redis';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConnectionRelationsService } from '../connection-relations.service';
import {
  type Buyer,
  insertBlock,
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

const count = async (tx: Tx, table: string): Promise<number> => {
  const result = await tx.execute<{ n: number }>(
    sql.raw(`select count(*)::int as n from ${table}`),
  );
  return result.rows[0]?.n ?? -1;
};

describe('F2.12a bağlantı tabloları kiracı izolasyonu', () => {
  let app: NestFastifyApplication;
  let redis: TestRedis;
  let sellerA: Seller;
  let sellerB: Seller;
  let buyerX: Buyer;
  let requestId: string;

  beforeAll(async () => {
    await runSeeds();
    redis = createTestRedis();
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: REDIS_CLIENT, useValue: redis.client }],
    });
    const region = await newRegion('İzolyasiya');
    sellerA = await newSeller(region);
    sellerB = await newSeller(region);
    buyerX = await newBuyer(region);
    requestId = await insertRequest({
      sellerId: sellerA.businessId,
      buyerId: buyerX.businessId,
      sentByUserId: sellerA.admin.userId,
      status: 'pending',
      createdAt: new Date(),
      sellerLocalDate: '2026-11-10',
    });
    await insertBlock(buyerX.businessId, sellerA.businessId, buyerX.admin.userId);
  });

  afterAll(async () => {
    await redis.cleanup();
    await app.close();
  });

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  it('F2.12a-R18 istek satırını satıcı ve alıcı görür; üçüncü işletme, bağlamsız işlem görmez', async () => {
    const visible = (tx: Tx) =>
      tx.execute<{ id: string }>(sql`select id from connection_requests where id = ${requestId}`);
    expect((await as(sellerA.businessId, visible)).rows).toHaveLength(1);
    expect((await as(buyerX.businessId, visible)).rows).toHaveLength(1);
    expect((await as(sellerB.businessId, visible)).rows).toHaveLength(0);
    expect((await withSystemTx(visible)).rows).toHaveLength(0);
    expect((await withPlatformTx({ userId: sellerA.admin.userId }, visible)).rows).toHaveLength(1);
  });

  it('F2.12a-R18 istek yalnız satıcı tarafından, kendi adına eklenir; bağlantı yalnız alıcı tarafından', async () => {
    const insertRequestAs = (businessId: string, sellerId: string) =>
      as(businessId, (tx) =>
        tx.execute(sql`
          insert into connection_requests
            (id, seller_id, buyer_id, sent_by_user_id, expires_at, seller_local_date)
          values (${randomUUID()}, ${sellerId}, ${buyerX.businessId}, ${sellerA.admin.userId},
                  now() + interval '14 days', current_date)`),
      );
    // B, A adına istek açamaz; alıcı istek açamaz.
    expect(await errorCode(() => insertRequestAs(sellerB.businessId, sellerA.businessId))).toBe(
      '42501',
    );
    expect(await errorCode(() => insertRequestAs(buyerX.businessId, sellerA.businessId))).toBe(
      '42501',
    );
    // Satıcı bağlantı satırı ekleyemez (kabul alıcının işi, F2.13).
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`
            insert into connections (id, seller_id, buyer_id, request_id, started_at)
            values (${randomUUID()}, ${sellerA.businessId}, ${buyerX.businessId}, ${requestId}, now())`),
        ),
      ),
    ).toBe('42501');
    // B, A'nın isteğini güncelleyemez (0 satır), silme hakkı hiç yok.
    const updated = await as(sellerB.businessId, (tx) =>
      tx.execute(sql`update connection_requests set status = 'withdrawn' where id = ${requestId}`),
    );
    expect(updated.rowCount).toBe(0);
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`delete from connection_requests where id = ${requestId}`),
        ),
      ),
    ).toBe('42501');
  });

  it('F2.12a blocks T: satıcı engel satırını göremez; yalnız alıcı görür ve yazar', async () => {
    expect(await as(sellerA.businessId, (tx) => count(tx, 'blocks'))).toBe(0);
    expect(await as(buyerX.businessId, (tx) => count(tx, 'blocks'))).toBe(1);
    expect(
      await errorCode(() =>
        as(sellerB.businessId, (tx) =>
          tx.execute(sql`insert into blocks (buyer_id, seller_id, created_by_user_id)
                         values (${buyerX.businessId}, ${sellerB.businessId}, ${sellerB.admin.userId})`),
        ),
      ),
    ).toBe('42501');
  });

  it('F2.12a connection_buyer_targets: engel yalnız çağıran satıcı için; alıcı ve bağlamsız çağıramaz', async () => {
    const targets = (businessId: string) =>
      as(businessId, (tx) =>
        tx.execute<{ id: string; blocked: boolean }>(
          sql`select id, blocked from connection_buyer_targets(${`{${buyerX.businessId}}`}::uuid[])`,
        ),
      );
    expect((await targets(sellerA.businessId)).rows).toEqual([
      { id: buyerX.businessId, blocked: true },
    ]);
    expect((await targets(sellerB.businessId)).rows).toEqual([
      { id: buyerX.businessId, blocked: false },
    ]);
    expect(await errorCode(() => targets(buyerX.businessId))).toBe('42501');
    expect(
      await errorCode(() =>
        withSystemTx((tx) =>
          tx.execute(
            sql`select * from connection_buyer_targets(${`{${buyerX.businessId}}`}::uuid[])`,
          ),
        ),
      ),
    ).toBe('42501');
    const tooMany = `{${Array.from({ length: 21 }, () => randomUUID()).join(',')}}`;
    expect(
      await errorCode(() =>
        as(sellerA.businessId, (tx) =>
          tx.execute(sql`select * from connection_buyer_targets(${tooMany}::uuid[])`),
        ),
      ),
    ).toBe('22023');
  });

  it('F2.12a connection_request_recipients: yalnız isteği gönderen satıcıya alıcı adminleri döner', async () => {
    const recipients = (businessId: string) =>
      as(businessId, (tx) =>
        tx.execute<{ user_id: string }>(
          sql`select user_id from connection_request_recipients(${requestId}::uuid)`,
        ),
      );
    expect((await recipients(sellerA.businessId)).rows).toEqual([{ user_id: buyerX.admin.userId }]);
    expect((await recipients(sellerB.businessId)).rows).toEqual([]);
    expect(await errorCode(() => recipients(buyerX.businessId))).toBe('42501');
  });

  it('US-007-AC6 dizin ilişkisi yalnız bağlamdaki satıcının satırlarından: A pending, B none', async () => {
    const relations = app.get(ConnectionRelationsService);
    const tenant = (seller: Seller): TenantContext => ({
      userId: seller.admin.userId,
      businessId: seller.businessId,
      membershipId: seller.admin.membershipId,
      capabilities: ['seller'],
      isBusinessAdmin: true,
      branchId: null,
      warehouseId: null,
      permissions: new Map(),
    });
    const forA = await relations.forSeller(tenant(sellerA), [buyerX.businessId]);
    expect(forA.get(buyerX.businessId)).toEqual({
      status: 'pending',
      cooldownUntil: null,
      canRequest: false,
    });
    const forB = await relations.forSeller(tenant(sellerB), [buyerX.businessId]);
    expect(forB.get(buyerX.businessId)).toEqual({
      status: 'none',
      cooldownUntil: null,
      canRequest: true,
    });
  });
});
