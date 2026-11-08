// access tablolarına erişim (F1.8a). Yalnızca withTenantTx / withPlatformTx üzerinden; işlem
// çağıran servisten gelir. Son admin tetikleyicisinin hatası (SQLSTATE AC001) burada
// `LAST_ADMIN_PROTECTED` DomainError'ına çevrilir.
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import {
  invitations,
  jobTitles,
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
export function sqlState(error: unknown): string | undefined {
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

  /** Yeteneğin tüm rol şablonları (F2.7c: işletme açılışında hepsi kopyalanır). */
  async templatesForCapability(tx: Tx, capability: 'seller' | 'buyer'): Promise<RoleTemplateRow[]> {
    return await tx
      .select()
      .from(roleTemplates)
      .where(eq(roleTemplates.capability, capability))
      .orderBy(asc(roleTemplates.code));
  }

  /** İşletmede zaten kopyalanmış şablonlar (`roles.source_template_id`). */
  async copiedTemplateIds(tx: Tx, businessId: string): Promise<Set<string>> {
    const rows = await tx
      .select({ id: roles.sourceTemplateId })
      .from(roles)
      .where(and(eq(roles.businessId, businessId), isNotNull(roles.sourceTemplateId)));
    return new Set(rows.flatMap((row) => (row.id === null ? [] : [row.id])));
  }

  async findTemplateByCode(tx: Tx, code: string): Promise<RoleTemplateRow | undefined> {
    const rows = await tx.select().from(roleTemplates).where(eq(roleTemplates.code, code));
    return rows[0];
  }

  /** Şablona bağlı, aynı kodlu aktif unvan (seed: her şablon için bir unvan, c4 §5). */
  async findTemplateJobTitle(
    tx: Tx,
    templateId: string,
    code: string,
  ): Promise<string | undefined> {
    const rows = await tx
      .select({ id: jobTitles.id })
      .from(jobTitles)
      .where(
        and(
          eq(jobTitles.roleTemplateId, templateId),
          eq(jobTitles.code, code),
          eq(jobTitles.isActive, true),
        ),
      );
    return rows[0]?.id;
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

  async insertMembership(tx: Tx, row: typeof memberships.$inferInsert): Promise<void> {
    await tx.insert(memberships).values(row);
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

  /** İşletmede bu yetenek kaydı var mı (durumdan bağımsız; onay okumada denetlenir). */
  async businessHasCapability(
    tx: Tx,
    businessId: string,
    capability: 'seller' | 'buyer',
  ): Promise<boolean> {
    const result = await tx.execute(sql`
      select 1 from business_capabilities
       where business_id = ${businessId} and capability = ${capability}`);
    return (result.rowCount ?? 0) > 0;
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

  // --- Davetler (F2.1a). Platform işleminde çağrılır (platform-admin, R15). ---

  async insertInvitation(tx: Tx, row: typeof invitations.$inferInsert): Promise<void> {
    await tx.insert(invitations).values(row);
  }

  /** İşletmenin açık (kabul edilmemiş, süresi dolmamış) admin davetlerini `now` ile kapatır. */
  async expireOpenAdminInvitations(tx: Tx, businessId: string, now: Date): Promise<void> {
    await tx
      .update(invitations)
      .set({ expiresAt: now })
      .where(
        and(
          eq(invitations.businessId, businessId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
          inArray(
            invitations.roleId,
            tx
              .select({ id: roles.id })
              .from(roles)
              .where(and(eq(roles.businessId, businessId), eq(roles.isBusinessAdmin, true))),
          ),
        ),
      );
  }

  /** İşletmelerin aktif admin üyeliği olanları. */
  async businessesWithActiveAdmin(tx: Tx, businessIds: readonly string[]): Promise<Set<string>> {
    if (businessIds.length === 0) return new Set();
    const rows = await tx
      .selectDistinct({ businessId: memberships.businessId })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          inArray(memberships.businessId, [...businessIds]),
          eq(memberships.status, 'active'),
          eq(roles.isBusinessAdmin, true),
        ),
      );
    return new Set(rows.map((row) => row.businessId));
  }

  /** İşletmelerin açık (kabul edilmemiş, süresi dolmamış) admin daveti olanları. */
  async businessesWithOpenAdminInvitation(
    tx: Tx,
    businessIds: readonly string[],
    now: Date,
  ): Promise<Set<string>> {
    if (businessIds.length === 0) return new Set();
    const rows = await tx
      .selectDistinct({ businessId: invitations.businessId })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .where(
        and(
          inArray(invitations.businessId, [...businessIds]),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
          eq(roles.isBusinessAdmin, true),
        ),
      );
    return new Set(rows.map((row) => row.businessId));
  }

  /** İşletme admininin rolü ve unvanı (açık davet yenilenirken; en eski admin rolü). */
  async adminRoleOf(
    tx: Tx,
    businessId: string,
  ): Promise<{ roleId: string; jobTitleId: string } | undefined> {
    const rows = await tx
      .select({ roleId: invitations.roleId, jobTitleId: invitations.jobTitleId })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .where(and(eq(invitations.businessId, businessId), eq(roles.isBusinessAdmin, true)))
      .orderBy(invitations.createdAt)
      .limit(1);
    return rows[0];
  }

  /** Son admin davetinin telefonu (yeniden gönderim aynı yetkiliye gider). */
  async lastAdminInvitationPhone(tx: Tx, businessId: string): Promise<string | undefined> {
    const rows = await tx
      .select({ phone: invitations.phoneE164 })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .where(and(eq(invitations.businessId, businessId), eq(roles.isBusinessAdmin, true)))
      .orderBy(sql`${invitations.createdAt} desc`, sql`${invitations.id} desc`)
      .limit(1);
    return rows[0]?.phone;
  }

  /** `invitation_accept` (0013, SECURITY DEFINER): kullanıcı app.user_id'den; boşsa undefined. */
  async acceptInvitation(
    tx: Tx,
    tokenHash: string,
    membershipId: string,
    now: Date,
  ): Promise<{ businessId: string; invitationId: string; membershipId: string } | undefined> {
    const result = await tx.execute<{
      business_id: string;
      invitation_id: string;
      membership_id: string;
    }>(sql`select * from invitation_accept(${tokenHash}, ${membershipId}::uuid,
                                             ${now.toISOString()}::timestamptz)`);
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          businessId: row.business_id,
          invitationId: row.invitation_id,
          membershipId: row.membership_id,
        };
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
