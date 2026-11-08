// Ekip yönetimi sorguları (F2.7a, US-013). Hepsi çağıranın kiracı işleminde (`withTenantTx`);
// RLS bağlamdaki işletmeyle sınırlar, sorgular ayrıca `business_id` koşulu taşır.
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { branches, warehouses } from '../businesses';
import { users } from '../identity';
import { regions } from '../i18n';
import { mapLastAdminError } from './access.repository';
import {
  invitations,
  jobTitles,
  membershipRegions,
  memberships,
  rolePermissions,
  roles,
} from './access.schema';

export interface TeamMemberRow {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string;
  readonly phoneE164: string;
  readonly roleId: string;
  readonly jobTitleId: string;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  readonly isBusinessAdmin: boolean;
  readonly joinedAt: Date | null;
}

export interface TeamInvitationRow {
  readonly id: string;
  readonly phoneE164: string;
  readonly roleId: string;
  readonly jobTitleId: string;
  readonly branchId: string | null;
  readonly warehouseId: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface TeamRoleRow {
  readonly id: string;
  readonly name: unknown;
  readonly capability: string;
  readonly isBusinessAdmin: boolean;
  readonly sourceTemplateId: string | null;
  readonly isCustom: boolean;
  readonly permissions: { code: string; scope: string }[];
}

export interface JobTitleRow {
  readonly id: string;
  readonly code: string;
  readonly name: unknown;
  readonly capability: string;
  readonly roleTemplateId: string | null;
}

export interface MembershipPatch {
  readonly roleId?: string;
  readonly branchId?: string | null;
  readonly warehouseId?: string | null;
  readonly status?: 'removed';
}

@Injectable()
export class TeamRepository {
  async listMembers(tx: Tx, businessId: string): Promise<TeamMemberRow[]> {
    return await tx
      .select({
        id: memberships.id,
        userId: memberships.userId,
        fullName: users.fullName,
        phoneE164: users.phoneE164,
        roleId: memberships.roleId,
        jobTitleId: memberships.jobTitleId,
        branchId: memberships.branchId,
        warehouseId: memberships.warehouseId,
        isBusinessAdmin: roles.isBusinessAdmin,
        joinedAt: memberships.joinedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.businessId, businessId), eq(memberships.status, 'active')))
      .orderBy(asc(memberships.joinedAt), asc(memberships.id));
  }

  async findActiveMember(
    tx: Tx,
    businessId: string,
    membershipId: string,
  ): Promise<TeamMemberRow | undefined> {
    const rows = await this.listMembers(tx, businessId);
    return rows.find((row) => row.id === membershipId);
  }

  /** Üyeliklerin bölgeleri (membershipId → regionId[]). */
  async regionsOf(tx: Tx, membershipIds: readonly string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (membershipIds.length === 0) return result;
    const rows = await tx
      .select({
        membershipId: membershipRegions.membershipId,
        regionId: membershipRegions.regionId,
      })
      .from(membershipRegions)
      .where(inArray(membershipRegions.membershipId, [...membershipIds]))
      .orderBy(asc(membershipRegions.regionId));
    for (const row of rows) {
      const list = result.get(row.membershipId) ?? [];
      list.push(row.regionId);
      result.set(row.membershipId, list);
    }
    return result;
  }

  async updateMembership(
    tx: Tx,
    membershipId: string,
    patch: MembershipPatch,
    now: Date,
  ): Promise<void> {
    await mapLastAdminError(
      tx
        .update(memberships)
        .set({ ...patch, updatedAt: now })
        .where(eq(memberships.id, membershipId)),
    );
  }

  async replaceRegions(tx: Tx, membershipId: string, regionIds: readonly string[]): Promise<void> {
    await tx.delete(membershipRegions).where(eq(membershipRegions.membershipId, membershipId));
    if (regionIds.length === 0) return;
    await tx
      .insert(membershipRegions)
      .values(regionIds.map((regionId) => ({ membershipId, regionId })));
  }

  /** Var olan bölge kimlikleri (G tablosu). */
  async existingRegions(tx: Tx, regionIds: readonly string[]): Promise<Set<string>> {
    if (regionIds.length === 0) return new Set();
    const rows = await tx
      .select({ id: regions.id })
      .from(regions)
      .where(inArray(regions.id, [...regionIds]));
    return new Set(rows.map((row) => row.id));
  }

  /** İşletmenin şubesinin durumu; başka işletmenin veya olmayan şube undefined. */
  async branchStatus(tx: Tx, businessId: string, branchId: string): Promise<string | undefined> {
    const rows = await tx
      .select({ status: branches.status })
      .from(branches)
      .where(and(eq(branches.businessId, businessId), eq(branches.id, branchId)));
    return rows[0]?.status;
  }

  async warehouseStatus(
    tx: Tx,
    businessId: string,
    warehouseId: string,
  ): Promise<string | undefined> {
    const rows = await tx
      .select({ status: warehouses.status })
      .from(warehouses)
      .where(and(eq(warehouses.businessId, businessId), eq(warehouses.id, warehouseId)));
    return rows[0]?.status;
  }

  /** Rolün izin kapsamları (kapsam kuralı, K9). */
  async roleScopes(tx: Tx, roleId: string): Promise<Set<string>> {
    const rows = await tx
      .selectDistinct({ scope: rolePermissions.scope })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return new Set(rows.map((row) => row.scope));
  }

  /** İşletme rolleri izinleriyle; `roleId` verilirse yalnız o rol (F2.8 yanıtı). */
  async listRoles(
    tx: Tx,
    businessId: string,
    capabilities: readonly string[],
    roleId?: string,
  ): Promise<TeamRoleRow[]> {
    const rows = await tx
      .select({
        id: roles.id,
        name: roles.name,
        capability: roles.capability,
        isBusinessAdmin: roles.isBusinessAdmin,
        sourceTemplateId: roles.sourceTemplateId,
        isCustom: roles.isCustom,
      })
      .from(roles)
      .where(
        and(
          eq(roles.businessId, businessId),
          inArray(roles.capability, [...capabilities]),
          ...(roleId === undefined ? [] : [eq(roles.id, roleId)]),
        ),
      )
      .orderBy(asc(roles.createdAt), asc(roles.id));
    if (rows.length === 0) return [];
    const perms = await tx
      .select({
        roleId: rolePermissions.roleId,
        code: rolePermissions.permissionCode,
        scope: rolePermissions.scope,
      })
      .from(rolePermissions)
      .where(
        inArray(
          rolePermissions.roleId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(rolePermissions.permissionCode));
    return rows.map((row) => ({
      ...row,
      permissions: perms
        .filter((perm) => perm.roleId === row.id)
        .map((perm) => ({ code: perm.code, scope: perm.scope })),
    }));
  }

  async listJobTitles(tx: Tx, capabilities: readonly string[]): Promise<JobTitleRow[]> {
    return await tx
      .select({
        id: jobTitles.id,
        code: jobTitles.code,
        name: jobTitles.name,
        capability: jobTitles.capability,
        roleTemplateId: jobTitles.roleTemplateId,
      })
      .from(jobTitles)
      .where(and(inArray(jobTitles.capability, [...capabilities]), eq(jobTitles.isActive, true)))
      .orderBy(asc(jobTitles.code));
  }

  async findActiveJobTitle(
    tx: Tx,
    jobTitleId: string,
  ): Promise<{ capability: string } | undefined> {
    const rows = await tx
      .select({ capability: jobTitles.capability })
      .from(jobTitles)
      .where(and(eq(jobTitles.id, jobTitleId), eq(jobTitles.isActive, true)));
    return rows[0];
  }

  // --- Davetler ---

  async listOpenInvitations(tx: Tx, businessId: string, now: Date): Promise<TeamInvitationRow[]> {
    return await tx
      .select({
        id: invitations.id,
        phoneE164: invitations.phoneE164,
        roleId: invitations.roleId,
        jobTitleId: invitations.jobTitleId,
        branchId: invitations.branchId,
        warehouseId: invitations.warehouseId,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.businessId, businessId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(asc(invitations.createdAt), asc(invitations.id));
  }

  /** Açık daveti kapatır (`expires_at = now`); kapandıysa true. */
  async expireOpenInvitation(
    tx: Tx,
    businessId: string,
    invitationId: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await tx
      .update(invitations)
      .set({ expiresAt: now })
      .where(
        and(
          eq(invitations.businessId, businessId),
          eq(invitations.id, invitationId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .returning({ id: invitations.id });
    return rows.length === 1;
  }

  /** Aynı telefona açık davetleri kapatır (yeniden gönderim, VARSAYIM K3). */
  async expireOpenInvitationsForPhone(
    tx: Tx,
    businessId: string,
    phoneE164: string,
    now: Date,
  ): Promise<void> {
    await tx
      .update(invitations)
      .set({ expiresAt: now })
      .where(
        and(
          eq(invitations.businessId, businessId),
          eq(invitations.phoneE164, phoneE164),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      );
  }

  /** Telefon bu işletmede aktif üye mi (users_member_select ile görünür). */
  async isActiveMemberPhone(tx: Tx, businessId: string, phoneE164: string): Promise<boolean> {
    const rows = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.businessId, businessId),
          eq(memberships.status, 'active'),
          eq(users.phoneE164, phoneE164),
        ),
      );
    return rows.length > 0;
  }

  /** `users.max` kullanımı: aktif üyelik + açık davet (VARSAYIM K2). */
  async countSeats(tx: Tx, businessId: string, now: Date): Promise<number> {
    // count(*) bigint → pg sürücüsü metin döner.
    const result = await tx.execute<{ seats: string }>(sql`
      select
        (select count(*) from memberships
          where business_id = ${businessId} and status = 'active')
        + (select count(*) from invitations
            where business_id = ${businessId} and accepted_at is null
              and expires_at > ${now.toISOString()}::timestamptz) as seats`);
    return Number(result.rows[0]?.seats ?? 0);
  }

  /** `user_ensure_for_invitation` (0017, SECURITY DEFINER): davet edilenin kullanıcı kimliği. */
  async ensureInvitedUser(
    tx: Tx,
    input: { id: string; phoneE164: string; fullName: string; now: Date },
  ): Promise<string> {
    const result = await tx.execute<{ id: string | null }>(sql`
      select user_ensure_for_invitation(
        ${input.id}::uuid, ${input.phoneE164}, ${input.fullName},
        ${input.now.toISOString()}::timestamptz
      ) as id`);
    const id = result.rows[0]?.id;
    if (id === undefined || id === null) throw new Error('user_ensure_for_invitation boş döndü');
    return id;
  }
}
