// F2.16 kiracı izolasyonu ve `0027` (`connection_requests_expire` DEFINER, `ops_metrics` S).
// Süre dolumu yalnız bağlamsız sistem işidir: kiracı (satıcı veya alıcı) ve platform bağlamı
// fonksiyonu çağıramaz, isteği doğrudan `expired` yapamaz; sonuç kişisel veri taşımaz.
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { pgErrorCode, queryAsOwner } from '../../../../test/isolation';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';
import {
  type Buyer,
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

const PAST = new Date(Date.now() - 60_000);

describe('F2.16 süre dolumu izolasyonu ve bekçi', () => {
  let region: string;
  let seller: Seller;

  beforeAll(async () => {
    await runSeeds();
    region = await newRegion('Müddət bekçisi');
    seller = await newSeller(region);
  });

  const as = <T>(businessId: string, fn: (tx: Tx) => Promise<T>) =>
    withTenantTx({ businessId, userId: null }, fn);

  async function duePair(): Promise<{ buyer: Buyer; id: string }> {
    const buyer = await newBuyer(region);
    const id = await insertRequest({
      sellerId: seller.businessId,
      buyerId: buyer.businessId,
      sentByUserId: seller.admin.userId,
      status: 'pending',
      createdAt: new Date(PAST.getTime() - 14 * 86_400_000),
      sellerLocalDate: '2026-11-01',
      expiresAt: PAST,
    });
    return { buyer, id };
  }

  const expire = (tx: Tx) =>
    tx.execute(
      sql`select * from connection_requests_expire(${new Date().toISOString()}::timestamptz, 10)`,
    );

  async function statusOf(id: string): Promise<string | undefined> {
    const [row] = await platformRows<{ status: string }>(
      'select status from connection_requests where id = $1',
      [id],
    );
    return row?.status;
  }

  it('F2.16-T5 satıcı, alıcı ve platform bağlamı fonksiyonu çağıramaz (42501); istek pending kalır', async () => {
    const { buyer, id } = await duePair();
    expect(await errorCode(() => as(seller.businessId, expire))).toBe('42501');
    expect(await errorCode(() => as(buyer.businessId, expire))).toBe('42501');
    expect(await errorCode(() => withPlatformTx({ userId: seller.admin.userId }, expire))).toBe(
      '42501',
    );
    expect(await statusOf(id)).toBe('pending');
  });

  it('F2.16-T5 taraflar isteği doğrudan expired yapamaz (bekçi 42501)', async () => {
    const { buyer, id } = await duePair();
    for (const businessId of [seller.businessId, buyer.businessId]) {
      const code = await errorCode(() =>
        as(businessId, (tx) =>
          tx.execute(sql`update connection_requests set status = 'expired' where id = ${id}`),
        ),
      );
      expect(code).toBe('42501');
    }
    expect(await statusOf(id)).toBe('pending');
  });

  it('F2.16-T5 bağlamsız sistem işlemi: yalnız kimlik kolonları döner, kişisel veri yok', async () => {
    const { buyer, id } = await duePair();
    // Paralel test dosyalarının süresi dolmuş istekleri de sıradadır (en eski önce, parti 10);
    // kendi satırımız dönene ya da sıra boşalana kadar partileri işle.
    const rows: Record<string, unknown>[] = [];
    let fields: string[] = [];
    for (let batch = 0; batch < 100; batch++) {
      const result = await withSystemTx(async (tx) => {
        const res = await expire(tx);
        return { rows: res.rows, fields: res.fields.map((field) => field.name) };
      });
      fields = result.fields;
      rows.push(...result.rows);
      if (result.rows.length === 0 || rows.some((row) => row.request_id === id)) break;
    }
    expect(fields).toEqual(['request_id', 'seller_id', 'buyer_id', 'recipient_user_id']);
    expect(rows).toContainEqual({
      request_id: id,
      seller_id: seller.businessId,
      buyer_id: buyer.businessId,
      recipient_user_id: seller.admin.userId,
    });
    expect(await statusOf(id)).toBe('expired');
  });

  it('F2.16-T5 geçersiz parti boyu 22023', async () => {
    for (const limit of [0, 1001]) {
      const code = await errorCode(() =>
        withSystemTx((tx) =>
          tx.execute(sql`select * from connection_requests_expire(now(), ${limit}::int)`),
        ),
      );
      expect(code).toBe('22023');
    }
  });

  it('F2.16-T5 DEFINER sahibi migrator, search_path sabit, PUBLIC yürütemez', async () => {
    const rows = await queryAsOwner<{
      prosecdef: boolean;
      proconfig: string[];
      owner: string;
      public_exec: boolean;
    }>(
      `select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
              has_function_privilege('public', p.oid, 'execute') as public_exec
         from pg_proc p where p.proname = 'connection_requests_expire'`,
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

  it('F2.16-T5 migrator politikaları yalnız migrator rolüne, güncelleme yalnız pending → expired', async () => {
    const rows = await queryAsOwner<{
      policyname: string;
      cmd: string;
      roles: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `select policyname, cmd, roles::text, qual, with_check from pg_policies
        where tablename = 'connection_requests' and 'migrator' = any(roles) order by policyname`,
    );
    expect(rows).toEqual([
      {
        policyname: 'connection_requests_definer_expire',
        cmd: 'UPDATE',
        roles: '{migrator}',
        qual: "(status = 'pending'::text)",
        with_check: "(status = 'expired'::text)",
      },
      {
        policyname: 'connection_requests_definer_select',
        cmd: 'SELECT',
        roles: '{migrator}',
        qual: 'true',
        with_check: null,
      },
    ]);
  });

  it('F2.16-T6 ops_metrics S tablosu: app_user yalnız INSERT ve dizi USAGE', async () => {
    const [row] = await queryAsOwner<Record<string, boolean>>(`
      select has_table_privilege('app_user', 'ops_metrics', 'INSERT') as can_insert,
             has_any_column_privilege('app_user', 'ops_metrics', 'SELECT') as can_select,
             has_table_privilege('app_user', 'ops_metrics', 'UPDATE') as can_update,
             has_table_privilege('app_user', 'ops_metrics', 'DELETE') as can_delete,
             has_sequence_privilege('app_user', 'ops_metrics_id_seq', 'USAGE') as seq_usage,
             obj_description('ops_metrics'::regclass, 'pg_class') as comment
    `);
    expect(row).toEqual({
      can_insert: true,
      can_select: false,
      can_update: false,
      can_delete: false,
      seq_usage: true,
      comment: 'rls:S',
    });
    const client = await connectAsAppUser();
    try {
      expect(await errorCode(() => client.query('select * from ops_metrics'))).toBe('42501');
    } finally {
      await client.end();
    }
  });
});
