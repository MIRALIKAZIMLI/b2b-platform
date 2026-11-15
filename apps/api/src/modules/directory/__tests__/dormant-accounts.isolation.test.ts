// F2.17 kiracı izolasyonu ve `0030` bekçileri (US-027; state-machines §9).
// - Gece işi fonksiyonları yalnız bağlamsız sistem işlemi; kiracı, kullanıcı ve platform 42501.
// - `buyer_dormant_touch` yalnız kullanıcı bağlamı ve yalnız kullanıcının üyesi olduğu işletme.
// - Kiracı aşama/sayaç kolonlarını ve `dormant` geçişini kendisi yazamaz.
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx, withUserTx } from '../../../core/db';
import {
  type Buyer,
  newBuyer,
  newRegion,
  newSeller,
  platformRows,
  runSeeds,
  type Seller,
} from './dormant-fixtures';

async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

const SYSTEM_FUNCTIONS = [
  (tx: Tx) => tx.execute(sql`select * from dormant_scan(now(), null, 0, 10)`),
  (tx: Tx, id: string) => tx.execute(sql`select dormant_advance(${id}::uuid, 'reminded_7', now())`),
  (tx: Tx, id: string) => tx.execute(sql`select * from dormant_archive(${id}::uuid, now())`),
  (tx: Tx, id: string) =>
    tx.execute(sql`select * from dormant_recipients(${id}::uuid, 'buyer_admins')`),
];

describe('F2.17 bağlantısız hesap izolasyonu ve bekçiler', () => {
  let region: string;
  let seller: Seller;
  let buyer: Buyer;
  let other: Buyer;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('Passiv bekçisi');
    seller = await newSeller(region);
    buyer = await newBuyer(region);
    other = await newBuyer(region);
  });

  async function stageOf(id: string) {
    const [row] = await platformRows<{ stage: string; status: string }>(
      `select bp.dormant_stage as stage, b.status from buyer_profiles bp
         join businesses b on b.id = bp.business_id where b.id = $1`,
      [id],
    );
    return row;
  }

  it('F2.17-T1 gece işi fonksiyonları kiracı, kullanıcı ve platform bağlamında 42501', async () => {
    for (const fn of SYSTEM_FUNCTIONS) {
      const call = (tx: Tx) => fn(tx, buyer.businessId);
      expect(
        await errorCode(() => withTenantTx({ businessId: buyer.businessId, userId: null }, call)),
      ).toBe('42501');
      expect(
        await errorCode(() => withTenantTx({ businessId: seller.businessId, userId: null }, call)),
      ).toBe('42501');
      expect(await errorCode(() => withUserTx({ userId: buyer.admin.userId }, call))).toBe('42501');
      expect(await errorCode(() => withPlatformTx({ userId: seller.admin.userId }, call))).toBe(
        '42501',
      );
    }
    expect(await stageOf(buyer.businessId)).toEqual({ stage: 'none', status: 'active' });
  });

  it('F2.17-T2 buyer_dormant_touch yalnız kullanıcı bağlamı; yalnız kendi işletmesine dokunur', async () => {
    const touch = (tx: Tx) => tx.execute(sql`select * from buyer_dormant_touch(now(), 60)`);
    expect(await errorCode(() => withSystemTx(touch))).toBe('42501');
    expect(
      await errorCode(() =>
        withTenantTx({ businessId: buyer.businessId, userId: buyer.admin.userId }, touch),
      ),
    ).toBe('42501');
    expect(await errorCode(() => withPlatformTx({ userId: buyer.admin.userId }, touch))).toBe(
      '42501',
    );

    await platformRows(
      `update buyer_profiles set dormant_stage = 'warned', dormant_stage_at = now()
        where business_id = any($1::uuid[])`,
      [[buyer.businessId, other.businessId]],
    );
    const rows = await withUserTx({ userId: buyer.admin.userId }, async (tx) => {
      const result = await touch(tx);
      return result.rows;
    });
    expect(rows).toEqual([{ business_id: buyer.businessId, reactivated: false }]);
    expect(await stageOf(buyer.businessId)).toEqual({ stage: 'none', status: 'active' });
    expect(await stageOf(other.businessId)).toEqual({ stage: 'warned', status: 'active' });
  });

  it('F2.17-T3 kiracı aşama/sayaç kolonlarını ve dormant durumunu yazamaz (42501)', async () => {
    const as = (sqlText: ReturnType<typeof sql>) =>
      withTenantTx({ businessId: buyer.businessId, userId: buyer.admin.userId }, (tx) =>
        tx.execute(sqlText),
      );
    for (const statement of [
      sql`update buyer_profiles set dormant_stage = 'reminded_7' where business_id = ${buyer.businessId}`,
      sql`update buyer_profiles set dormant_since = now() + interval '1 year' where business_id = ${buyer.businessId}`,
      sql`update buyer_profiles set dormant_stage_at = now() where business_id = ${buyer.businessId}`,
      sql`update businesses set status = 'dormant' where id = ${buyer.businessId}`,
    ]) {
      expect(await errorCode(() => as(statement))).toBe('42501');
    }
    // Diğer kolonlar (dizinde görünme) yazılabilir.
    await as(
      sql`update buyer_profiles set listed_in_directory = true where business_id = ${buyer.businessId}`,
    );
  });

  it('F2.17-T4 bağlamsız sistem: yalnız kimlik/kod/zaman kolonları, kişisel veri yok', async () => {
    const fields = await withSystemTx(async (tx) => {
      const scan = await tx.execute(sql`select * from dormant_scan(now(), null, 0, 1)`);
      const recipients = await tx.execute(
        sql`select * from dormant_recipients(${buyer.businessId}::uuid, 'buyer_admins')`,
      );
      return {
        scan: scan.fields.map((f) => f.name),
        recipients: recipients.fields.map((f) => f.name),
        admins: recipients.rows,
      };
    });
    expect(fields.scan).toEqual(['business_id', 'status', 'stage', 'stage_at', 'since']);
    expect(fields.recipients).toEqual(['user_id', 'business_id']);
    expect(fields.admins).toEqual([{ user_id: buyer.admin.userId, business_id: buyer.businessId }]);
  });

  it('F2.17-T5 dormant_advance uygun olmayan sırayı reddeder (false), geçersiz aşama 22023', async () => {
    const result = await withSystemTx(async (tx) => {
      const res = await tx.execute<{ ok: boolean }>(
        sql`select dormant_advance(${seller.businessId}::uuid, 'warned', now()) as ok`,
      );
      return res.rows[0]?.ok;
    });
    expect(result).toBe(false);
    expect(
      await errorCode(() =>
        withSystemTx((tx) =>
          tx.execute(sql`select dormant_advance(${buyer.businessId}::uuid, 'archived', now())`),
        ),
      ),
    ).toBe('22023');
  });

  it('F2.17-T6 yeni migrator politikaları yalnız migrator rolüne', async () => {
    const rows = await queryAsOwner<{ policyname: string; roles: string; cmd: string }>(
      `select policyname, roles::text, cmd from pg_policies
        where policyname in ('connections_definer_select', 'service_areas_definer_select',
                             'buyer_profiles_definer_update', 'businesses_definer_dormant_update',
                             'person_data_definer_delete')
        order by policyname`,
    );
    expect(rows).toEqual([
      { policyname: 'businesses_definer_dormant_update', roles: '{migrator}', cmd: 'UPDATE' },
      { policyname: 'buyer_profiles_definer_update', roles: '{migrator}', cmd: 'UPDATE' },
      { policyname: 'connections_definer_select', roles: '{migrator}', cmd: 'SELECT' },
      { policyname: 'person_data_definer_delete', roles: '{migrator}', cmd: 'DELETE' },
      { policyname: 'service_areas_definer_select', roles: '{migrator}', cmd: 'SELECT' },
    ]);
    const helpers = await queryAsOwner<{
      proname: string;
      prosecdef: boolean;
      public_exec: boolean;
    }>(
      `select p.proname, p.prosecdef, has_function_privilege('public', p.oid, 'execute') as public_exec
         from pg_proc p
        where p.proname in ('dormant_assert_system', 'dormant_eligible', 'business_has_history',
                            'business_purge_rows')
        order by p.proname`,
    );
    expect(helpers).toEqual([
      { proname: 'business_has_history', prosecdef: false, public_exec: false },
      { proname: 'business_purge_rows', prosecdef: false, public_exec: false },
      { proname: 'dormant_assert_system', prosecdef: false, public_exec: false },
      { proname: 'dormant_eligible', prosecdef: false, public_exec: false },
    ]);
  });
});
