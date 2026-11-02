// F2.7c (Mimar kararı A): işletmede yeteneğin tüm rol şablonları rol olarak bulunur. Açılış akışları
// (F2.1a, F2.3a) bunu kendi testlerinde doğrular; burada var olan işletmeler için
// `business_roles_backfill()` (0018) ve RoleService'in tekrar çağrılabilirliği denenir.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { createTestApp } from '../../../../test/http-app';
import { withPlatformTx } from '../../../core/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { RoleService } from '../role.service';
import { newTestBusiness, platformRows, runTeamSeeds } from './team-fixtures';

const roleCodes = async (businessId: string): Promise<string[]> =>
  (
    await platformRows<{ code: string }>(
      `select t.code from roles r join role_templates t on t.id = r.source_template_id
        where r.business_id = $1 order by t.code`,
      [businessId],
    )
  ).map((row) => row.code);

describe('F2.7c işletme rolleri şablonlardan tamamlanır', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await runTeamSeeds();
    app = await createTestApp({ env: { REDIS_URL: process.env.REDIS_URL ?? '' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('F2.7c backfill: yalnız admin rolü olan işletmeye eksik şablonlar izinleriyle eklenir; ikinci çalıştırma 0', async () => {
    const seller = await newTestBusiness('seller');
    expect(await roleCodes(seller.businessId)).toEqual(['seller_business_admin']);

    const [first] = await platformRows<{ n: number }>(
      'select business_roles_backfill($1::uuid) as n',
      [seller.businessId],
    );
    expect(first?.n).toBe(5);
    expect(await roleCodes(seller.businessId)).toEqual([
      'seller_accountant',
      'seller_business_admin',
      'seller_courier',
      'seller_sales_manager',
      'seller_sales_rep',
      'seller_warehouse',
    ]);
    // İzinler şablonla aynı (ör. satış temsilcisi `assigned` kapsamlı).
    const [mismatch] = await platformRows<{ n: string }>(
      `select count(*)::text as n
         from roles r
         join role_template_permissions tp on tp.template_id = r.source_template_id
         left join role_permissions rp
           on rp.role_id = r.id and rp.permission_code = tp.permission_code
          and rp.scope = tp.default_scope
        where r.business_id = $1 and rp.role_id is null`,
      [seller.businessId],
    );
    expect(mismatch?.n).toBe('0');

    const [second] = await platformRows<{ n: number }>(
      'select business_roles_backfill($1::uuid) as n',
      [seller.businessId],
    );
    expect(second?.n).toBe(0);
    expect(await roleCodes(seller.businessId)).toHaveLength(6);
  });

  it('F2.7c backfill: yalnız işletmenin yeteneği; perakendeciye seller şablonu gelmez', async () => {
    const buyer = await newTestBusiness('buyer');
    await platformRows('select business_roles_backfill($1::uuid)', [buyer.businessId]);
    expect(await roleCodes(buyer.businessId)).toEqual([
      'buyer_accountant',
      'buyer_branch_admin',
      'buyer_branch_staff',
      'buyer_business_admin',
      'buyer_purchaser',
    ]);
  });

  it('F2.7c backfill platform bağlamı ister (42501); app_user çalıştıramaz; search_path sabit', async () => {
    const client = await connectAsAppUser();
    try {
      await expect(client.query('select business_roles_backfill(null)')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.end();
    }
    const [fn] = await platformRows<{
      prosecdef: boolean;
      proconfig: string[];
      public_exec: boolean;
    }>(
      `select p.prosecdef, p.proconfig,
              has_function_privilege('public', p.oid, 'EXECUTE') as public_exec
         from pg_proc p where p.proname = 'business_roles_backfill'`,
    );
    expect(fn).toMatchObject({ prosecdef: false, public_exec: false });
    expect(fn?.proconfig).toContain('search_path=pg_catalog, public, pg_temp');
  });

  it('F2.7c RoleService.copyCapabilityTemplatesTx tekrar çağrılabilir: kopyalanmış şablon atlanır', async () => {
    const seller = await newTestBusiness('seller');
    const service = app.get(RoleService);
    const first = await withPlatformTx({ userId: seller.adminUserId }, (tx) =>
      service.copyCapabilityTemplatesTx(tx, seller.businessId, 'seller'),
    );
    const second = await withPlatformTx({ userId: seller.adminUserId }, (tx) =>
      service.copyCapabilityTemplatesTx(tx, seller.businessId, 'seller'),
    );
    expect([first, second]).toEqual([5, 0]);
    expect(await roleCodes(seller.businessId)).toHaveLength(6);
  });
});
