// Kiracı bağlamı için okuma (F1.8b). Her sorgu `withTenantTx({ businessId: X-Business-Id, userId })`
// içinde çalışır: RLS yalnızca o işletmenin satırlarını gösterir, sorgu ayrıca `user_id`'ye süzer.
// Kullanıcı o işletmenin üyesi değilse 0 satır döner (403). İstemcinin verdiği işletme kimliği
// yalnızca RLS bağlamı olarak kullanılır; yetki kararı bu okumanın sonucundan çıkar.
import { Injectable } from '@nestjs/common';
import {
  isPermissionCode,
  isPermissionScope,
  type PermissionCode,
  type PermissionScope,
} from '@b2b/shared';
import { sql } from 'drizzle-orm';
import { type TenantTxContext, withTenantTx } from '../../core/db';

export interface MembershipAccessRow {
  readonly membershipId: string;
  readonly roleId: string;
  readonly roleCapability: 'seller' | 'buyer';
  /** `roles.permissions_version` (F2.8): izin önbelleğinin doğrulama anahtarı. */
  readonly rolePermissionsVersion: number;
  readonly isBusinessAdmin: boolean;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  readonly businessStatus: string;
  readonly approvedCapabilities: readonly ('seller' | 'buyer')[];
  readonly businessTimezone: string;
  readonly businessCurrency: string | null;
}

export interface MembershipSummaryRow {
  readonly businessName: string;
  readonly businessStatus: string;
  readonly roleCapability: 'seller' | 'buyer';
  readonly roleName: unknown;
}

function asCapability(value: string): 'seller' | 'buyer' {
  return value === 'buyer' ? 'buyer' : 'seller';
}

@Injectable()
export class TenantContextRepository {
  /** Kullanıcının bu işletmedeki aktif üyeliği; yoksa undefined. Önbelleklenmez (US-004 AC3). */
  async findActiveMembership(
    ctx: TenantTxContext & { userId: string },
  ): Promise<MembershipAccessRow | undefined> {
    const result = await withTenantTx(ctx, (tx) =>
      tx.execute<{
        membership_id: string;
        role_id: string;
        role_capability: string;
        permissions_version: number;
        is_business_admin: boolean;
        branch_id: string | null;
        warehouse_id: string | null;
        business_status: string;
        approved: string[] | null;
        timezone: string;
        currency_code: string | null;
      }>(sql`
        select m.id as membership_id, m.role_id, r.capability as role_capability,
               r.permissions_version, r.is_business_admin, m.branch_id, m.warehouse_id,
               b.status as business_status, b.timezone, b.currency_code,
               array(select bc.capability from business_capabilities bc
                      where bc.business_id = b.id and bc.status = 'approved'
                      order by bc.capability) as approved
          from memberships m
          join roles r on r.id = m.role_id
          join businesses b on b.id = m.business_id
         where m.business_id = ${ctx.businessId}
           and m.user_id = ${ctx.userId}
           and m.status = 'active'`),
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      membershipId: row.membership_id,
      roleId: row.role_id,
      roleCapability: asCapability(row.role_capability),
      rolePermissionsVersion: row.permissions_version,
      isBusinessAdmin: row.is_business_admin,
      branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      businessStatus: row.business_status,
      approvedCapabilities: (row.approved ?? []).map(asCapability),
      businessTimezone: row.timezone,
      businessCurrency: row.currency_code === null ? null : row.currency_code.trim(),
    };
  }

  /** Rolün izinleri (önbelleğe alınır). Katalog dışı kod veya kapsam yok sayılır. */
  async rolePermissions(
    ctx: TenantTxContext,
    roleId: string,
  ): Promise<[PermissionCode, PermissionScope][]> {
    const result = await withTenantTx(ctx, (tx) =>
      tx.execute<{ permission_code: string; scope: string }>(sql`
        select permission_code, scope from role_permissions where role_id = ${roleId}
        order by permission_code`),
    );
    const items: [PermissionCode, PermissionScope][] = [];
    for (const row of result.rows) {
      if (isPermissionCode(row.permission_code) && isPermissionScope(row.scope)) {
        items.push([row.permission_code, row.scope]);
      }
    }
    return items;
  }

  /** `/me` üyelik listesi için işletme ve rol adı (üyeliğin kendi işletme bağlamında). */
  async membershipSummary(
    ctx: TenantTxContext & { userId: string },
    membershipId: string,
  ): Promise<MembershipSummaryRow | undefined> {
    const result = await withTenantTx(ctx, (tx) =>
      tx.execute<{
        legal_name: string;
        status: string;
        capability: string;
        role_name: unknown;
      }>(sql`
        select b.legal_name, b.status, r.capability, r.name as role_name
          from memberships m
          join roles r on r.id = m.role_id
          join businesses b on b.id = m.business_id
         where m.id = ${membershipId} and m.user_id = ${ctx.userId} and m.status = 'active'`),
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      businessName: row.legal_name,
      businessStatus: row.status,
      roleCapability: asCapability(row.capability),
      roleName: row.role_name,
    };
  }
}
