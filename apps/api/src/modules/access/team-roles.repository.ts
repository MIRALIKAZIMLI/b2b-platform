// İşletmeye özel rol sorguları (F2.8, US-014). Hepsi çağıranın kiracı işleminde (`withTenantTx`);
// `roles` / `role_permissions` T tablolarıdır (RLS bağlamdaki işletmeyle sınırlar), sorgular ayrıca
// `business_id` koşulu taşır. `role_templates` G tablosudur (herkes okur).
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import {
  invitations,
  memberships,
  rolePermissions,
  roles,
  roleTemplatePermissions,
  roleTemplates,
} from './access.schema';

export interface RoleTemplateView {
  readonly id: string;
  readonly code: string;
  readonly name: unknown;
  readonly capability: string;
  readonly permissions: { code: string; scope: string }[];
}

export interface LockedRole {
  readonly id: string;
  readonly name: unknown;
  readonly capability: string;
  readonly isBusinessAdmin: boolean;
  readonly isCustom: boolean;
  readonly permissionsVersion: number;
}

@Injectable()
export class TeamRolesRepository {
  async listTemplates(tx: Tx, capabilities: readonly string[]): Promise<RoleTemplateView[]> {
    const rows = await tx
      .select({
        id: roleTemplates.id,
        code: roleTemplates.code,
        name: roleTemplates.name,
        capability: roleTemplates.capability,
      })
      .from(roleTemplates)
      .where(inArray(roleTemplates.capability, [...capabilities]))
      .orderBy(asc(roleTemplates.code));
    if (rows.length === 0) return [];
    const perms = await tx
      .select({
        templateId: roleTemplatePermissions.templateId,
        code: roleTemplatePermissions.permissionCode,
        scope: roleTemplatePermissions.defaultScope,
      })
      .from(roleTemplatePermissions)
      .where(
        inArray(
          roleTemplatePermissions.templateId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(roleTemplatePermissions.permissionCode));
    return rows.map((row) => ({
      ...row,
      permissions: perms
        .filter((perm) => perm.templateId === row.id)
        .map((perm) => ({ code: perm.code, scope: perm.scope })),
    }));
  }

  /** Rolü işlem sonuna kadar kilitler (eşzamanlı düzenlemede sürüm sırayla artar). */
  async lockRole(tx: Tx, businessId: string, roleId: string): Promise<LockedRole | undefined> {
    const rows = await tx
      .select({
        id: roles.id,
        name: roles.name,
        capability: roles.capability,
        isBusinessAdmin: roles.isBusinessAdmin,
        isCustom: roles.isCustom,
        permissionsVersion: roles.permissionsVersion,
      })
      .from(roles)
      .where(and(eq(roles.businessId, businessId), eq(roles.id, roleId)))
      .for('update');
    return rows[0];
  }

  async permissionsOf(tx: Tx, roleId: string): Promise<{ code: string; scope: string }[]> {
    return await tx
      .select({ code: rolePermissions.permissionCode, scope: rolePermissions.scope })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(asc(rolePermissions.permissionCode));
  }

  async replacePermissions(
    tx: Tx,
    roleId: string,
    items: readonly { code: string; scope: string }[],
  ): Promise<void> {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (items.length === 0) return;
    await tx
      .insert(rolePermissions)
      .values(items.map((item) => ({ roleId, permissionCode: item.code, scope: item.scope })));
  }

  async updateRole(
    tx: Tx,
    businessId: string,
    roleId: string,
    patch: { name?: unknown; permissionsVersion?: number },
    now: Date,
  ): Promise<void> {
    await tx
      .update(roles)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(roles.businessId, businessId), eq(roles.id, roleId)));
  }

  /** Rolün aktif üyelikleri (izin önbelleği temizliği, outbox). */
  async activeMembershipIds(tx: Tx, businessId: string, roleId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.businessId, businessId),
          eq(memberships.roleId, roleId),
          eq(memberships.status, 'active'),
        ),
      )
      .orderBy(asc(memberships.id));
    return rows.map((row) => row.id);
  }

  /** Rol bir açık davete bağlı mı? (kart V4: kapsam türü değişimi.) */
  async hasOpenInvitation(tx: Tx, businessId: string, roleId: string, now: Date): Promise<boolean> {
    const rows = await tx
      .select({ one: sql<number>`1` })
      .from(invitations)
      .where(
        and(
          eq(invitations.businessId, businessId),
          eq(invitations.roleId, roleId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
