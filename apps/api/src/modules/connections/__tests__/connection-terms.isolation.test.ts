// F2.14a kiracı izolasyonu ve `0024` bekçisi (Müfettiş 17 #60 L2; kullanıcı kararı 2026-11-10
// kabulde vade 0). Doğrudan SQL: app_user (RLS'e tabi) ve bağlamsız yol için süper kullanıcı.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAsSuperuser } from '../../../../test/db-clients';
import { pgErrorCode } from '../../../../test/isolation';
import { type Tx, withTenantTx } from '../../../core/db';
import {
  activeConnection,
  addMember,
  type Buyer,
  cancelConnection,
  insertRequest,
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
const TERM_COLUMNS: readonly [string, unknown][] = [
  ['credit_limit', '100.00'],
  ['payment_term_days', 15],
  ['sales_rep_membership_id', null],
  ['branch_pricing_enabled', true],
  ['price_list_id', randomUUID()],
  ['terms_set_at', NOW],
];

describe('F2.14a bağlantı koşulları kiracı izolasyonu ve bekçi', () => {
  let region: string;
  let seller: Seller;
  let buyer: Buyer;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('Şərt bekçisi');
    seller = await newSeller(region);
    buyer = await newBuyer(region);
  });

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  const update = (businessId: string, id: string, column: string, value: unknown) =>
    as(businessId, (tx) =>
      tx.execute(sql`update connections set ${sql.identifier(column)} = ${value} where id = ${id}`),
    );

  it('F2.14a-T1 bekçi: yeni bağlantı vadesi 0 olmalı (önerilen vade yazılmaz)', async () => {
    const requestId = await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'accepted',
      createdAt: NOW,
      sellerLocalDate: NOW.toISOString().slice(0, 10),
      proposedPaymentTermDays: 30,
    });
    const insert = (term: number, extra = sql``) =>
      as(buyer.businessId, (tx) =>
        tx.execute(sql`insert into connections
                         (id, seller_id, buyer_id, request_id, status, started_at, payment_term_days)
                       select ${randomUUID()}, seller_id, buyer_id, id, 'active', responded_at, ${term}
                         from connection_requests where id = ${requestId} ${extra}`),
      );
    expect(await errorCode(() => insert(30))).toBe('23514');
    expect(
      await errorCode(() =>
        as(buyer.businessId, (tx) =>
          tx.execute(sql`insert into connections
                           (id, seller_id, buyer_id, request_id, status, started_at, terms_set_at,
                            terms_set_by_user_id)
                         select ${randomUUID()}, seller_id, buyer_id, id, 'active', responded_at,
                                now(), ${buyer.admin.userId}
                           from connection_requests where id = ${requestId}`),
        ),
      ),
    ).toBe('23514');
    expect(await errorCode(() => insert(0))).toBeUndefined();
  });

  it('F2.14a-T2 alıcı bağlamı hiçbir koşul kolonunu güncelleyemez (42501); satıcı güncelleyebilir', async () => {
    const id = await activeConnection(seller, await newBuyer(region), NOW);
    const [row] = await platformRows<{ buyer_id: string }>(
      'select buyer_id from connections where id = $1',
      [id],
    );
    const buyerId = row?.buyer_id ?? '';
    for (const [column, value] of TERM_COLUMNS) {
      // Alıcıya göre "değişiklik" olsun diye null kolonlar için dolu değer; sales_rep zaten null.
      if (column === 'sales_rep_membership_id') continue;
      expect(await errorCode(() => update(buyerId, id, column, value)), column).toBe('42501');
    }
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    expect(
      await errorCode(() => update(buyerId, id, 'sales_rep_membership_id', rep.membershipId)),
    ).toBe('42501');
    const updated = await as(seller.businessId, (tx) =>
      tx.execute(sql`update connections
                        set credit_limit = 250.50, payment_term_days = 20,
                            sales_rep_membership_id = ${rep.membershipId},
                            terms_set_at = now(), terms_set_by_user_id = ${seller.admin.userId}
                      where id = ${id}`),
    );
    expect(updated.rowCount).toBe(1);
    // Alıcı yalnız durumu (engel/iptal) yazabilir; koşul aynı kalır.
    await cancelConnection(buyerId, id, NOW);
    const [after] = await platformRows<{ status: string; credit_limit: string }>(
      'select status, credit_limit from connections where id = $1',
      [id],
    );
    expect(after).toEqual({ status: 'cancelled', credit_limit: '250.50' });
  });

  it('F2.14a-T2 bağlam yokken (NULL veya boş) koşul güncellemesi reddedilir (42501)', async () => {
    const id = await activeConnection(seller, await newBuyer(region), NOW);
    const client = await connectAsSuperuser();
    try {
      for (const setup of [null, '']) {
        await client.query('begin');
        if (setup !== null) {
          await client.query("select set_config('app.business_id', $1, true)", [setup]);
        }
        const code = await errorCode(() =>
          client.query('update connections set payment_term_days = 5 where id = $1', [id]),
        );
        await client.query('rollback');
        expect(code, `bağlam: ${String(setup)}`).toBe('42501');
      }
      // Koşul dışı kolon (ör. updated_at) bağlamsız güncellenebilir: kural yalnız koşullar için.
      await client.query('begin');
      const plain = await client.query('update connections set updated_at = now() where id = $1', [
        id,
      ]);
      await client.query('rollback');
      expect(plain.rowCount).toBe(1);
    } finally {
      await client.end();
    }
  });

  it('F2.14a-T3 iptal edilmiş bağlantıda satıcı da koşul değiştiremez (23514)', async () => {
    const otherBuyer = await newBuyer(region);
    const id = await activeConnection(seller, otherBuyer, NOW);
    await cancelConnection(otherBuyer.businessId, id, NOW);
    expect(await errorCode(() => update(seller.businessId, id, 'payment_term_days', 9))).toBe(
      '23514',
    );
  });

  it('F2.14a-T4 temsilci yalnız satıcının aktif üyesi; başka satıcının bağlantısı görünmez', async () => {
    const id = await activeConnection(seller, await newBuyer(region), NOW);
    const other = await newSeller(region);
    const outsider = await addMember(other.businessId, 'seller_sales_rep', [region]);
    expect(
      await errorCode(() =>
        update(seller.businessId, id, 'sales_rep_membership_id', outsider.membershipId),
      ),
    ).toBe('23514');
    const removed = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    await platformRows(`update memberships set status = 'removed' where id = $1`, [
      removed.membershipId,
    ]);
    expect(
      await errorCode(() =>
        update(seller.businessId, id, 'sales_rep_membership_id', removed.membershipId),
      ),
    ).toBe('23514');
    // Başka satıcı satırı göremez: güncelleme 0 satır.
    const foreign = await update(other.businessId, id, 'payment_term_days', 7);
    expect(foreign.rowCount).toBe(0);
    const listed = await as(other.businessId, (tx) =>
      tx.execute(sql`select id from connections where id = ${id}`),
    );
    expect(listed.rows).toHaveLength(0);
  });

  it('F2.14a T8 app_user UPDATE izni taraf ve kimlik kolonlarında yok (yalnız iki yeni kolon eklendi)', async () => {
    const rows = await platformRows<{ column_name: string }>(
      `select column_name from information_schema.column_privileges
        where table_name = 'connections' and grantee = 'app_user' and privilege_type = 'UPDATE'
        order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual(
      [
        'branch_pricing_enabled',
        'credit_limit',
        'end_reason',
        'ended_at',
        'ended_by_side',
        'ended_by_user_id',
        'payment_term_days',
        'price_list_id',
        'sales_rep_membership_id',
        'status',
        'terms_set_at',
        'terms_set_by_user_id',
        'updated_at',
      ].sort(),
    );
  });

  it('F2.14-B1 bekçi: temsilci yalnız satış temsilcisi rolündeki aktif üye (23514); mevcut atama korunur', async () => {
    const id = await activeConnection(seller, await newBuyer(region), NOW);
    const manager = await addMember(seller.businessId, 'seller_sales_manager');
    expect(
      await errorCode(() =>
        update(seller.businessId, id, 'sales_rep_membership_id', manager.membershipId),
      ),
    ).toBe('23514');
    const rep = await addMember(seller.businessId, 'seller_sales_rep', [region]);
    expect(
      (await update(seller.businessId, id, 'sales_rep_membership_id', rep.membershipId)).rowCount,
    ).toBe(1);
    await platformRows(
      `update memberships set role_id = (select role_id from memberships where id = $2) where id = $1`,
      [rep.membershipId, manager.membershipId],
    );
    // Temsilci değişmeden diğer koşul güncellenir; atama yerinde kalır.
    expect((await update(seller.businessId, id, 'payment_term_days', 15)).rowCount).toBe(1);
  });
});
