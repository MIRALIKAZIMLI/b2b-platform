// Platform unvan ve rol şablonu kataloğu sorguları (F2.9, US-012). Hepsi çağıranın platform
// işleminde (`withPlatformTx`, yalnız platform-admin açar): G tablolarına yazma ve T tablolarını
// (`roles`, `memberships`, `invitations`) işletmeler arası okuma/yazma platform politikasıyla.
import { Injectable } from '@nestjs/common';
import type { CatalogName } from '@b2b/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { sqlState } from './access.repository';
import { jobTitles, roleTemplatePermissions, roleTemplates } from './access.schema';

export interface CatalogPermission {
  readonly code: string;
  readonly scope: string;
}

export interface CatalogTemplateRow {
  readonly id: string;
  readonly code: string;
  readonly name: unknown;
  readonly capability: string;
  readonly isBusinessAdmin: boolean;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface CatalogJobTitleRow {
  readonly id: string;
  readonly code: string;
  readonly name: unknown;
  readonly capability: string;
  readonly roleTemplateId: string | null;
  readonly isActive: boolean;
}

export interface TemplateRecipient {
  readonly businessId: string;
  readonly userId: string;
}

const templateColumns = {
  id: roleTemplates.id,
  code: roleTemplates.code,
  name: roleTemplates.name,
  capability: roleTemplates.capability,
  isBusinessAdmin: roleTemplates.isBusinessAdmin,
  version: roleTemplates.version,
  updatedAt: roleTemplates.updatedAt,
};

const jobTitleColumns = {
  id: jobTitles.id,
  code: jobTitles.code,
  name: jobTitles.name,
  capability: jobTitles.capability,
  roleTemplateId: jobTitles.roleTemplateId,
  isActive: jobTitles.isActive,
};

@Injectable()
export class RoleCatalogRepository {
  async listTemplates(tx: Tx): Promise<CatalogTemplateRow[]> {
    return await tx
      .select(templateColumns)
      .from(roleTemplates)
      .orderBy(asc(roleTemplates.capability), asc(roleTemplates.code));
  }

  async findTemplate(tx: Tx, id: string): Promise<CatalogTemplateRow | undefined> {
    const rows = await tx
      .select(templateColumns)
      .from(roleTemplates)
      .where(eq(roleTemplates.id, id));
    return rows[0];
  }

  /** Eşzamanlı güncellemede sürüm sırayla artsın diye şablon satırı kilitlenir. */
  async lockTemplate(tx: Tx, id: string): Promise<CatalogTemplateRow | undefined> {
    const rows = await tx
      .select(templateColumns)
      .from(roleTemplates)
      .where(eq(roleTemplates.id, id))
      .for('update');
    return rows[0];
  }

  async templateCodeTaken(tx: Tx, code: string): Promise<boolean> {
    const rows = await tx
      .select({ id: roleTemplates.id })
      .from(roleTemplates)
      .where(eq(roleTemplates.code, code));
    return rows.length > 0;
  }

  /** Şablon kimliği → izinler (kod sırasıyla). */
  async permissionsOf(
    tx: Tx,
    templateIds: readonly string[],
  ): Promise<Map<string, CatalogPermission[]>> {
    const result = new Map<string, CatalogPermission[]>();
    if (templateIds.length === 0) return result;
    const rows = await tx
      .select({
        templateId: roleTemplatePermissions.templateId,
        code: roleTemplatePermissions.permissionCode,
        scope: roleTemplatePermissions.defaultScope,
      })
      .from(roleTemplatePermissions)
      .where(inArray(roleTemplatePermissions.templateId, [...templateIds]))
      .orderBy(asc(roleTemplatePermissions.permissionCode));
    for (const row of rows) {
      const list = result.get(row.templateId) ?? [];
      list.push({ code: row.code, scope: row.scope });
      result.set(row.templateId, list);
    }
    return result;
  }

  async insertTemplate(
    tx: Tx,
    row: {
      id: string;
      code: string;
      name: CatalogName;
      capability: 'seller' | 'buyer';
      now: Date;
    },
  ): Promise<void> {
    await tx.insert(roleTemplates).values({
      id: row.id,
      code: row.code,
      name: row.name,
      capability: row.capability,
      isBusinessAdmin: false,
      version: 1,
      createdAt: row.now,
      updatedAt: row.now,
    });
  }

  async replacePermissions(
    tx: Tx,
    templateId: string,
    items: readonly CatalogPermission[],
  ): Promise<void> {
    await tx
      .delete(roleTemplatePermissions)
      .where(eq(roleTemplatePermissions.templateId, templateId));
    if (items.length === 0) return;
    await tx.insert(roleTemplatePermissions).values(
      items.map((item) => ({
        templateId,
        permissionCode: item.code,
        defaultScope: item.scope,
      })),
    );
  }

  async updateTemplate(
    tx: Tx,
    id: string,
    patch: { name?: CatalogName; version?: number },
    now: Date,
  ): Promise<void> {
    await tx
      .update(roleTemplates)
      .set({ ...patch, updatedAt: now })
      .where(eq(roleTemplates.id, id));
  }

  /**
   * V4 (F2.7c kuralının devamı): şablonu yeteneğindeki her işletmeye, henüz şablon kopyası yoksa,
   * izinleriyle birlikte rol olarak kopyalar (`business_roles_backfill` ile aynı seçim). İki ifade:
   * `role_permissions` politikası rol satırını görmeyi ister, aynı ifadede eklenen rol görünmez.
   * Açılan rol sayısını döner.
   */
  async copyTemplateToBusinesses(tx: Tx, templateId: string, now: Date): Promise<number> {
    const created = await tx.execute<{ id: string }>(sql`
      insert into roles (id, business_id, name, capability, is_business_admin,
                         source_template_id, source_template_version, created_at, updated_at)
      select gen_random_uuid(), bc.business_id, t.name, t.capability, t.is_business_admin,
             t.id, t.version, ${now}, ${now}
        from business_capabilities bc
        join role_templates t on t.capability = bc.capability
       where t.id = ${templateId}
         and not exists (
               select 1 from roles x
                where x.business_id = bc.business_id and x.source_template_id = t.id
                  and not x.is_custom)
      returning id`);
    const roleIds = created.rows.map((row) => row.id);
    if (roleIds.length === 0) return 0;
    await tx.execute(sql`
      insert into role_permissions (role_id, permission_code, scope)
      select r.id, p.permission_code, p.default_scope
        from unnest(${`{${roleIds.join(',')}}`}::uuid[]) as r(id)
        cross join role_template_permissions p
       where p.template_id = ${templateId}`);
    return roleIds.length;
  }

  /**
   * V3: şablondan rolü (kopya veya ondan açılmış özel rol) olan, arşivlenmemiş işletmelerin aktif
   * admin üyeleri (işletme + kullanıcı başına bir satır).
   */
  async templateRecipients(tx: Tx, templateId: string): Promise<TemplateRecipient[]> {
    const result = await tx.execute<{ business_id: string; user_id: string }>(sql`
      select distinct m.business_id, m.user_id
        from memberships m
        join roles r on r.id = m.role_id and r.business_id = m.business_id
        join businesses b on b.id = m.business_id
       where m.status = 'active'
         and r.is_business_admin
         and b.status <> 'archived'
         and exists (select 1 from roles x
                      where x.business_id = m.business_id and x.source_template_id = ${templateId})
       order by m.business_id, m.user_id`);
    return result.rows.map((row) => ({ businessId: row.business_id, userId: row.user_id }));
  }

  async listJobTitles(tx: Tx): Promise<(CatalogJobTitleRow & { inUse: boolean })[]> {
    return await tx
      .select({ ...jobTitleColumns, inUse: inUseExpression() })
      .from(jobTitles)
      .orderBy(asc(jobTitles.capability), asc(jobTitles.code));
  }

  async findJobTitle(
    tx: Tx,
    id: string,
  ): Promise<(CatalogJobTitleRow & { inUse: boolean }) | undefined> {
    const rows = await tx
      .select({ ...jobTitleColumns, inUse: inUseExpression() })
      .from(jobTitles)
      .where(eq(jobTitles.id, id));
    return rows[0];
  }

  async lockJobTitle(tx: Tx, id: string): Promise<CatalogJobTitleRow | undefined> {
    const rows = await tx
      .select(jobTitleColumns)
      .from(jobTitles)
      .where(eq(jobTitles.id, id))
      .for('update');
    return rows[0];
  }

  async jobTitleCodeTaken(tx: Tx, code: string): Promise<boolean> {
    const rows = await tx
      .select({ id: jobTitles.id })
      .from(jobTitles)
      .where(eq(jobTitles.code, code));
    return rows.length > 0;
  }

  async insertJobTitle(
    tx: Tx,
    row: {
      id: string;
      code: string;
      name: CatalogName;
      capability: 'seller' | 'buyer';
      roleTemplateId: string;
      now: Date;
    },
  ): Promise<void> {
    await tx.insert(jobTitles).values({
      id: row.id,
      code: row.code,
      name: row.name,
      capability: row.capability,
      roleTemplateId: row.roleTemplateId,
      isActive: true,
      createdAt: row.now,
      updatedAt: row.now,
    });
  }

  async updateJobTitle(
    tx: Tx,
    id: string,
    patch: { name?: CatalogName; roleTemplateId?: string; isActive?: boolean },
    now: Date,
  ): Promise<void> {
    await tx
      .update(jobTitles)
      .set({ ...patch, updatedAt: now })
      .where(eq(jobTitles.id, id));
  }

  /** Denetimden sonra eşzamanlı eklenen üyelik / davet FK hatası (23503) da aynı yanıtı verir. */
  async deleteJobTitle(tx: Tx, id: string): Promise<void> {
    try {
      await tx.delete(jobTitles).where(eq(jobTitles.id, id));
    } catch (error) {
      if (sqlState(error) === '23503') throw new DomainError('JOB_TITLE_IN_USE');
      throw error;
    }
  }
}

/** V7: herhangi bir üyelik (`removed` dahil) veya davet unvanı gösteriyor mu? */
function inUseExpression() {
  // Sütun tam adla yazılır: Drizzle tek tablolu seçimde `${jobTitles.id}`'yi niteliksiz `"id"`
  // olarak basar ve alt sorguda `m.id` ile karışır.
  return sql<boolean>`(
    exists (select 1 from memberships m where m.job_title_id = "job_titles"."id")
    or exists (select 1 from invitations i where i.job_title_id = "job_titles"."id"))`.mapWith(
    Boolean,
  );
}
