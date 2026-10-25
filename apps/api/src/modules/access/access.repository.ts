// access tablolarına erişim (F1.8a). Yalnızca withTenantTx / withPlatformTx üzerinden; işlem
// çağıran servisten gelir. Son admin tetikleyicisinin hatası (SQLSTATE AC001) burada
// `LAST_ADMIN_PROTECTED` DomainError'ına çevrilir.
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import {
  memberships,
  rolePermissions,
  roles,
  roleTemplatePermissions,
  roleTemplates,
} from './access.schema';

/** 0010_access.sql `access_assert_business_has_admin` hata kodu. */
export const LAST_ADMIN_SQLSTATE = 'AC001';

export type RoleTemplateRow = typeof roleTemplates.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;

/** Hata zincirinde (Drizzle `cause` ile sarar) PostgreSQL SQLSTATE kodunu bulur. */
function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && typeof current.code === 'string') return current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

/** Son admin tetikleyicisi hatasını DomainError'a çevirir; diğer hatalar olduğu gibi geçer. */
export async function mapLastAdminError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (sqlState(error) === LAST_ADMIN_SQLSTATE) {
      throw new DomainError('LAST_ADMIN_PROTECTED');
    }
    throw error;
  }
}

export interface TemplatePermission {
  readonly permissionCode: string;
  readonly scope: string;
}

@Injectable()
export class AccessRepository {
  async findTemplate(tx: Tx, templateId: string): Promise<RoleTemplateRow | undefined> {
    const rows = await tx.select().from(roleTemplates).where(eq(roleTemplates.id, templateId));
    return rows[0];
  }

  async templatePermissions(tx: Tx, templateId: string): Promise<TemplatePermission[]> {
    return await tx
      .select({
        permissionCode: roleTemplatePermissions.permissionCode,
        scope: roleTemplatePermissions.defaultScope,
      })
      .from(roleTemplatePermissions)
      .where(eq(roleTemplatePermissions.templateId, templateId));
  }

  async insertRole(tx: Tx, role: typeof roles.$inferInsert): Promise<void> {
    await tx.insert(roles).values(role);
  }

  async insertRolePermissions(
    tx: Tx,
    roleId: string,
    items: readonly TemplatePermission[],
  ): Promise<void> {
    if (items.length === 0) return;
    await tx
      .insert(rolePermissions)
      .values(
        items.map((item) => ({ roleId, permissionCode: item.permissionCode, scope: item.scope })),
      );
  }

  async findRole(tx: Tx, businessId: string, roleId: string): Promise<RoleRow | undefined> {
    const rows = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.businessId, businessId), eq(roles.id, roleId)));
    return rows[0];
  }

  /** Üyeliği işlem sonuna kadar kilitler (eşzamanlı rol değişikliği). */
  async lockMembership(
    tx: Tx,
    businessId: string,
    membershipId: string,
  ): Promise<MembershipRow | undefined> {
    const rows = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.businessId, businessId), eq(memberships.id, membershipId)))
      .for('update');
    return rows[0];
  }

  async updateMembershipRole(
    tx: Tx,
    membershipId: string,
    roleId: string,
    now: Date,
  ): Promise<void> {
    await mapLastAdminError(
      tx
        .update(memberships)
        .set({ roleId, updatedAt: now })
        .where(eq(memberships.id, membershipId)),
    );
  }

  /** Test ve F2 ekip ekranı için: üyeliği kaldırır (status = removed). */
  async removeMembership(tx: Tx, membershipId: string, now: Date): Promise<void> {
    await mapLastAdminError(
      tx
        .update(memberships)
        .set({ status: 'removed', updatedAt: now })
        .where(eq(memberships.id, membershipId)),
    );
  }

  /** Kullanıcının tüm işletmelerdeki aktif üyelikleri (list_my_memberships, Mimar K1). */
  async listMyMemberships(tx: Tx): Promise<MyMembership[]> {
    const result = await tx.execute<{
      membership_id: string;
      business_id: string;
      role_id: string;
      job_title_id: string;
      branch_id: string | null;
      warehouse_id: string | null;
    }>(sql`select * from list_my_memberships()`);
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      businessId: row.business_id,
      roleId: row.role_id,
      jobTitleId: row.job_title_id,
      branchId: row.branch_id,
      warehouseId: row.warehouse_id,
    }));
  }
}

export interface MyMembership {
  readonly membershipId: string;
  readonly businessId: string;
  readonly roleId: string;
  readonly jobTitleId: string;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
}
