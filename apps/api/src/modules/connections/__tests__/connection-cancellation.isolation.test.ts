// F2.15a kiracı izolasyonu ve `0026` (connections_guard iptal kuralları + connection_counterpart_admins
// DEFINER). Doğrudan SQL: app_user (RLS'e tabi) ve bağlamsız yol için süper kullanıcı.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAsSuperuser } from '../../../../test/db-clients';
import { pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { type Tx, withPlatformTx, withTenantTx } from '../../../core/db';
import {
  activeConnection,
  addMember,
  type Buyer,
  cancelConnection,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
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

describe('F2.15a bağlantı iptali kiracı izolasyonu ve bekçi', () => {
  let region: string;
  let seller: Seller;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('İptal bekçisi');
    seller = await newSeller(region);
  });

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  const cancelAs = (
    businessId: string,
    id: string,
    fields: { side: string | null; reason: string | null; userId: string | null; at?: Date | null },
  ) =>
    as(businessId, (tx) =>
      tx.execute(sql`update connections
                        set status = 'cancelled', ended_at = ${fields.at === undefined ? NOW : fields.at},
                            ended_by_side = ${fields.side}, end_reason = ${fields.reason},
                            ended_by_user_id = ${fields.userId}
                      where id = ${id}`),
    );

  async function freshPair(): Promise<{ buyer: Buyer; id: string }> {
    const buyer = await newBuyer(region);
    return { buyer, id: await activeConnection(seller, buyer, NOW) };
  }

  it('F2.15a-T5 bekçi: ended_by_side bağlamın tarafı olmalı (42501), dört alan dolu (23514)', async () => {
    const { buyer, id } = await freshPair();
    // Satıcı "alıcı iptal etti" yazamaz; alıcı "satıcı iptal etti" yazamaz.
    expect(
      await errorCode(() =>
        cancelAs(seller.businessId, id, {
          side: 'buyer',
          reason: 'other',
          userId: seller.admin.userId,
        }),
      ),
    ).toBe('42501');
    expect(
      await errorCode(() =>
        cancelAs(buyer.businessId, id, {
          side: 'seller',
          reason: 'other',
          userId: buyer.admin.userId,
        }),
      ),
    ).toBe('42501');
    for (const missing of [
      { side: 'seller', reason: null, userId: seller.admin.userId },
      { side: 'seller', reason: 'other', userId: null },
      { side: 'seller', reason: 'other', userId: seller.admin.userId, at: null },
    ]) {
      expect(
        await errorCode(() => cancelAs(seller.businessId, id, missing)),
        JSON.stringify(missing),
      ).toMatch(/^23(514)$/);
    }
    const ok = await cancelAs(seller.businessId, id, {
      side: 'seller',
      reason: 'other',
      userId: seller.admin.userId,
    });
    expect(ok.rowCount).toBe(1);
  });

  it('F2.15a-T5 bekçi: iptal sonrası ended_* değişmez; aktif satırda ended_* yazılamaz (23514)', async () => {
    const { buyer, id } = await freshPair();
    expect(
      await errorCode(() =>
        as(buyer.businessId, (tx) =>
          tx.execute(sql`update connections set end_reason = 'other' where id = ${id}`),
        ),
      ),
    ).toBe('23514');
    await cancelConnection(buyer.businessId, id, NOW);
    for (const [column, value] of [
      ['end_reason', 'payment_issue'],
      ['ended_by_side', 'seller'],
      ['ended_at', new Date(NOW.getTime() + 1000)],
      [
        'ended_by_user_id',
        buyer.admin.userId === seller.admin.userId ? randomUUID() : seller.admin.userId,
      ],
    ] as const) {
      for (const businessId of [buyer.businessId, seller.businessId]) {
        expect(
          await errorCode(() =>
            as(businessId, (tx) =>
              tx.execute(
                sql`update connections set ${sql.identifier(column)} = ${value} where id = ${id}`,
              ),
            ),
          ),
          `${column} @ ${businessId === seller.businessId ? 'seller' : 'buyer'}`,
        ).toBe('23514');
      }
    }
  });

  it('US-025-AC6 iptal edilmiş bağlantı yeniden active olmaz (23514)', async () => {
    const { buyer, id } = await freshPair();
    await cancelConnection(buyer.businessId, id, NOW);
    for (const businessId of [buyer.businessId, seller.businessId]) {
      expect(
        await errorCode(() =>
          as(businessId, (tx) =>
            tx.execute(sql`update connections set status = 'active' where id = ${id}`),
          ),
        ),
      ).toBe('23514');
    }
  });

  it('F2.15a-T5 bağlamsız veya boş bağlamda iptal reddedilir (42501; platform kaynaklı iptal F2.17/F2.18)', async () => {
    const { id } = await freshPair();
    const client = await connectAsSuperuser();
    try {
      for (const setup of [null, '']) {
        await client.query('begin');
        if (setup !== null) {
          await client.query("select set_config('app.business_id', $1, true)", [setup]);
        }
        const code = await errorCode(() =>
          client.query(
            `update connections set status = 'cancelled', ended_at = now(), ended_by_side = 'seller',
                    end_reason = 'other', ended_by_user_id = $2 where id = $1`,
            [id, seller.admin.userId],
          ),
        );
        await client.query('rollback');
        expect(code, `bağlam: ${String(setup)}`).toBe('42501');
      }
    } finally {
      await client.end();
    }
  });

  it('F2.15a-T4 başka çift bağlantıyı göremez ve iptal edemez (iki yön)', async () => {
    const { buyer, id } = await freshPair();
    const otherSeller = await newSeller(region);
    const otherBuyer = await newBuyer(region);
    for (const outsider of [otherSeller.businessId, otherBuyer.businessId]) {
      const result = await cancelAs(outsider, id, {
        side: 'seller',
        reason: 'other',
        userId: seller.admin.userId,
      });
      expect(result.rowCount).toBe(0);
    }
    const [row] = await platformRows<{ status: string }>(
      'select status from connections where id = $1',
      [id],
    );
    expect(row?.status).toBe('active');
    expect(buyer.businessId).not.toBe(otherBuyer.businessId);
  });

  describe('connection_counterpart_admins (DEFINER)', () => {
    const admins = (businessId: string, id: string) =>
      as(businessId, async (tx) => {
        const result = await tx.execute(
          sql`select * from connection_counterpart_admins(${id}::uuid)`,
        );
        return { rows: result.rows, fields: result.fields.map((field) => field.name) };
      });

    it('F2.15a-T6 iki yön: karşı tarafın yalnız aktif adminleri, yalnız user_id', async () => {
      const { buyer, id } = await freshPair();
      const buyerAdmin2 = await addMember(buyer.businessId, 'buyer_business_admin');
      const removedAdmin = await addMember(buyer.businessId, 'buyer_business_admin');
      await platformRows(`update memberships set status = 'removed' where id = $1`, [
        removedAdmin.membershipId,
      ]);
      await addMember(buyer.businessId, 'buyer_purchaser');
      await addMember(seller.businessId, 'seller_sales_rep');
      await cancelConnection(buyer.businessId, id, NOW);

      const fromSeller = await admins(seller.businessId, id);
      expect(fromSeller.fields).toEqual(['user_id']);
      expect(fromSeller.rows.map((row) => row.user_id).sort()).toEqual(
        [buyer.admin.userId, buyerAdmin2.userId].sort(),
      );
      const fromBuyer = await admins(buyer.businessId, id);
      // Satıcının adminleri (beforeAll'daki tek admin + bu testten önce eklenenler admin değil).
      const sellerAdmins = await platformRows<{ user_id: string }>(
        `select m.user_id from memberships m join roles r on r.id = m.role_id
          where m.business_id = $1 and m.status = 'active' and r.is_business_admin order by m.user_id`,
        [seller.businessId],
      );
      expect(fromBuyer.rows.map((row) => row.user_id)).toEqual(sellerAdmins.map((r) => r.user_id));
      expect(fromBuyer.rows.map((row) => row.user_id)).toContain(seller.admin.userId);
    });

    it('F2.15a-T6 yabancı bağlam ve aktif bağlantı boş döner; platform/bağlamsız 42501', async () => {
      const { buyer, id } = await freshPair();
      // Aktif (iptal edilmemiş) bağlantı: boş.
      expect((await admins(seller.businessId, id)).rows).toEqual([]);
      await cancelConnection(buyer.businessId, id, NOW);
      const outsider = await newSeller(region);
      expect((await admins(outsider.businessId, id)).rows).toEqual([]);
      expect((await admins(buyer.businessId, randomUUID())).rows).toEqual([]);

      expect(
        await errorCode(() =>
          withPlatformTx({ userId: randomUUID() }, (tx) =>
            tx.execute(sql`select * from connection_counterpart_admins(${id}::uuid)`),
          ),
        ),
      ).toBe('42501');
      const client = await connectAsSuperuser();
      try {
        const code = await errorCode(() =>
          client.query('select * from connection_counterpart_admins($1::uuid)', [id]),
        );
        expect(code).toBe('42501');
      } finally {
        await client.end();
      }
    });

    it('F2.15a-T6 onayı kalkmış taraf çağıramaz (42501)', async () => {
      const { buyer, id } = await freshPair();
      await cancelConnection(buyer.businessId, id, NOW);
      await platformRows(
        `update business_capabilities set status = 'suspended' where business_id = $1 and capability = 'buyer'`,
        [buyer.businessId],
      );
      expect(await errorCode(() => admins(buyer.businessId, id))).toBe('42501');
    });

    it('F2.15a-T6 DEFINER sahibi migrator, search_path sabit, PUBLIC yürütemez', async () => {
      const rows = await queryAsOwner<{
        prosecdef: boolean;
        proconfig: string[];
        owner: string;
        public_exec: boolean;
      }>(
        `select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
                has_function_privilege('public', p.oid, 'execute') as public_exec
           from pg_proc p where p.proname = 'connection_counterpart_admins'`,
      );
      expect(rows).toEqual([
        {
          prosecdef: true,
          proconfig: ['search_path=pg_catalog, public, pg_temp'],
          owner: 'migrator',
          public_exec: false,
        },
      ]);
    });
  });
});
