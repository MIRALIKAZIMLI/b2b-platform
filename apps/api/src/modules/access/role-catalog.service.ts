// Platform unvan ve rol şablonu kataloğu (F2.9, US-012). Her yöntem çağıranın platform işleminde
// çalışır (`withPlatformTx` yalnız platform-admin modülünde açılır, c4 §3.7).
// - AC1: şablon izinleri şablonun yeteneğine ait ve kapsam izinli olmalı (422). Yeni şablon aynı
//   işlemde yeteneğin var olan işletmelerine rol olarak kopyalanır (V4); unvan aynı yetenekteki bir
//   şablona bağlanır ve aktifse davet ekranında hemen görünür.
// - AC2: izin listesi değişince sürüm 1 artar; işletme kopyaları değişmez (yalnız şablon satırı
//   yazılır). Şablondan rolü olan işletmelerin aktif adminleri için alıcı başına
//   `role_template.version_published` outbox olayı → bildirim (V2, V3). İşletme admin şablonunun
//   izinleri değişmez (V6).
// - AC3: kullanımdaki unvan silinemez (409 JOB_TITLE_IN_USE), yalnız pasifleştirilir (V7).
import { Inject, Injectable } from '@nestjs/common';
import { type CatalogName, rolePermissionError } from '@b2b/shared';
import { type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { OutboxWriter } from '../../core/outbox';
import {
  type CatalogJobTitleRow,
  type CatalogPermission,
  type CatalogTemplateRow,
  RoleCatalogRepository,
} from './role-catalog.repository';

export type CatalogCapability = 'seller' | 'buyer';

export interface CatalogActor {
  readonly userId: string;
}

export interface AdminRoleTemplateView {
  readonly id: string;
  readonly code: string;
  readonly name: unknown;
  readonly capability: string;
  readonly isBusinessAdmin: boolean;
  readonly version: number;
  readonly permissions: CatalogPermission[];
  readonly updatedAt: string;
}

export interface AdminJobTitleView extends CatalogJobTitleRow {
  readonly inUse: boolean;
}

export interface NewRoleTemplate {
  readonly code: string;
  readonly name: CatalogName;
  readonly capability: CatalogCapability;
  readonly permissions: readonly CatalogPermission[];
}

export interface RoleTemplatePatch {
  readonly name?: CatalogName | undefined;
  readonly permissions?: readonly CatalogPermission[] | undefined;
}

export interface NewJobTitle {
  readonly code: string;
  readonly name: CatalogName;
  readonly capability: CatalogCapability;
  readonly roleTemplateId: string;
}

export interface JobTitlePatch {
  readonly name?: CatalogName | undefined;
  readonly roleTemplateId?: string | undefined;
  readonly isActive?: boolean | undefined;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

function assertPermissions(
  capability: CatalogCapability,
  items: readonly CatalogPermission[],
): void {
  const error = rolePermissionError(capability, items);
  if (error !== undefined) {
    throw new DomainError('VALIDATION_FAILED', { permissions: [error.reason], code: error.code });
  }
}

function sortedPermissions(items: readonly CatalogPermission[]): CatalogPermission[] {
  return [...items]
    .map((item) => ({ code: item.code, scope: item.scope }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function samePermissions(
  a: readonly CatalogPermission[],
  b: readonly CatalogPermission[],
): boolean {
  return JSON.stringify(sortedPermissions(a)) === JSON.stringify(sortedPermissions(b));
}

function sameName(a: unknown, b: CatalogName): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const left = Object.entries(a).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b).sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(left) === JSON.stringify(right);
}

@Injectable()
export class RoleCatalogService {
  constructor(
    @Inject(RoleCatalogRepository) private readonly repository: RoleCatalogRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async listTemplatesTx(tx: Tx): Promise<AdminRoleTemplateView[]> {
    const rows = await this.repository.listTemplates(tx);
    const permissions = await this.repository.permissionsOf(
      tx,
      rows.map((row) => row.id),
    );
    return rows.map((row) => templateView(row, permissions.get(row.id) ?? []));
  }

  /** US-012 AC1: şablon + izinler; yeteneğin var olan işletmelerine kopya (V4). */
  async createTemplateTx(
    tx: Tx,
    actor: CatalogActor,
    input: NewRoleTemplate,
    context: AuditRequestContext,
  ): Promise<AdminRoleTemplateView> {
    assertPermissions(input.capability, input.permissions);
    if (await this.repository.templateCodeTaken(tx, input.code)) throw invalid('code', 'taken');
    const id = this.ids.next();
    const now = this.clock.now();
    await this.repository.insertTemplate(tx, { id, ...input, now });
    await this.repository.replacePermissions(tx, id, input.permissions);
    const copied = await this.repository.copyTemplateToBusinesses(tx, id, now);
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'role_template.created',
      targetType: 'role_template',
      targetId: id,
      after: {
        code: input.code,
        name: input.name,
        capability: input.capability,
        permissions: sortedPermissions(input.permissions),
        copiedToBusinesses: copied,
      },
      context,
    });
    return await this.templateViewTx(tx, id);
  }

  /** US-012 AC2: kopyalar değişmez; izin değişince sürüm + adminlere bildirim olayı. */
  async updateTemplateTx(
    tx: Tx,
    actor: CatalogActor,
    id: string,
    input: RoleTemplatePatch,
    context: AuditRequestContext,
  ): Promise<AdminRoleTemplateView> {
    const template = await this.repository.lockTemplate(tx, id);
    if (template === undefined) throw new DomainError('NOT_FOUND');
    const capability: CatalogCapability = template.capability === 'buyer' ? 'buyer' : 'seller';
    const current = (await this.repository.permissionsOf(tx, [id])).get(id) ?? [];
    const now = this.clock.now();

    if (input.permissions !== undefined) assertPermissions(capability, input.permissions);
    const nextPermissions =
      input.permissions !== undefined && !samePermissions(current, input.permissions)
        ? input.permissions
        : undefined;
    if (nextPermissions !== undefined && template.isBusinessAdmin) {
      throw invalid('permissions', 'admin_template_locked');
    }
    const nextName =
      input.name !== undefined && !sameName(template.name, input.name) ? input.name : undefined;
    if (nextPermissions === undefined && nextName === undefined) {
      return templateView(template, current);
    }

    const version = nextPermissions === undefined ? template.version : template.version + 1;
    if (nextPermissions !== undefined) {
      await this.repository.replacePermissions(tx, id, nextPermissions);
    }
    await this.repository.updateTemplate(
      tx,
      id,
      {
        ...(nextName === undefined ? {} : { name: nextName }),
        ...(nextPermissions === undefined ? {} : { version }),
      },
      now,
    );

    let notified = 0;
    if (nextPermissions !== undefined) {
      for (const recipient of await this.repository.templateRecipients(tx, id)) {
        await this.outbox.write(tx, {
          type: 'role_template.version_published',
          aggregateType: 'role_template',
          aggregateId: id,
          businessIds: [recipient.businessId],
          payload: {
            templateId: id,
            version,
            businessId: recipient.businessId,
            userId: recipient.userId,
          },
        });
        notified++;
      }
    }
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'role_template.updated',
      targetType: 'role_template',
      targetId: id,
      before: {
        ...(nextName === undefined ? {} : { name: template.name }),
        ...(nextPermissions === undefined
          ? {}
          : { permissions: sortedPermissions(current), version: template.version }),
      },
      after: {
        ...(nextName === undefined ? {} : { name: nextName }),
        ...(nextPermissions === undefined
          ? {}
          : { permissions: sortedPermissions(nextPermissions), version, notified }),
      },
      context,
    });
    return await this.templateViewTx(tx, id);
  }

  async listJobTitlesTx(tx: Tx): Promise<AdminJobTitleView[]> {
    return await this.repository.listJobTitles(tx);
  }

  /** US-012 AC1: aynı yetenekteki şablona bağlı unvan; aktif açılır. */
  async createJobTitleTx(
    tx: Tx,
    actor: CatalogActor,
    input: NewJobTitle,
    context: AuditRequestContext,
  ): Promise<AdminJobTitleView> {
    await this.assertTemplateFor(tx, input.capability, input.roleTemplateId);
    if (await this.repository.jobTitleCodeTaken(tx, input.code)) throw invalid('code', 'taken');
    const id = this.ids.next();
    await this.repository.insertJobTitle(tx, { id, ...input, now: this.clock.now() });
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'job_title.created',
      targetType: 'job_title',
      targetId: id,
      after: { ...input },
      context,
    });
    return await this.jobTitleViewTx(tx, id);
  }

  /** US-012 AC3: ad, şablon, aktiflik; pasif unvan davet ekranında görünmez. */
  async updateJobTitleTx(
    tx: Tx,
    actor: CatalogActor,
    id: string,
    input: JobTitlePatch,
    context: AuditRequestContext,
  ): Promise<AdminJobTitleView> {
    const title = await this.repository.lockJobTitle(tx, id);
    if (title === undefined) throw new DomainError('NOT_FOUND');
    const capability: CatalogCapability = title.capability === 'buyer' ? 'buyer' : 'seller';
    if (input.roleTemplateId !== undefined) {
      await this.assertTemplateFor(tx, capability, input.roleTemplateId);
    }
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: { name?: CatalogName; roleTemplateId?: string; isActive?: boolean } = {};
    if (input.name !== undefined && !sameName(title.name, input.name)) {
      before.name = title.name;
      after.name = input.name;
      patch.name = input.name;
    }
    if (input.roleTemplateId !== undefined && input.roleTemplateId !== title.roleTemplateId) {
      before.roleTemplateId = title.roleTemplateId;
      after.roleTemplateId = input.roleTemplateId;
      patch.roleTemplateId = input.roleTemplateId;
    }
    if (input.isActive !== undefined && input.isActive !== title.isActive) {
      before.isActive = title.isActive;
      after.isActive = input.isActive;
      patch.isActive = input.isActive;
    }
    if (Object.keys(patch).length > 0) {
      await this.repository.updateJobTitle(tx, id, patch, this.clock.now());
      await this.audit.record(tx, {
        actor: { type: 'platform', userId: actor.userId },
        businessId: null,
        action: 'job_title.updated',
        targetType: 'job_title',
        targetId: id,
        before,
        after,
        context,
      });
    }
    return await this.jobTitleViewTx(tx, id);
  }

  /** US-012 AC3: kullanımdaki unvan silinemez (V7). */
  async deleteJobTitleTx(
    tx: Tx,
    actor: CatalogActor,
    id: string,
    context: AuditRequestContext,
  ): Promise<void> {
    if ((await this.repository.lockJobTitle(tx, id)) === undefined) {
      throw new DomainError('NOT_FOUND');
    }
    const title = await this.repository.findJobTitle(tx, id);
    if (title === undefined) throw new DomainError('NOT_FOUND');
    if (title.inUse) throw new DomainError('JOB_TITLE_IN_USE');
    await this.repository.deleteJobTitle(tx, id);
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'job_title.deleted',
      targetType: 'job_title',
      targetId: id,
      before: {
        code: title.code,
        name: title.name,
        capability: title.capability,
        roleTemplateId: title.roleTemplateId,
      },
      context,
    });
  }

  private async assertTemplateFor(
    tx: Tx,
    capability: CatalogCapability,
    templateId: string,
  ): Promise<void> {
    const template = await this.repository.findTemplate(tx, templateId);
    if (template === undefined) throw invalid('roleTemplateId', 'not_found');
    if (template.capability !== capability) throw invalid('roleTemplateId', 'capability');
  }

  private async templateViewTx(tx: Tx, id: string): Promise<AdminRoleTemplateView> {
    const row = await this.repository.findTemplate(tx, id);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    const permissions = (await this.repository.permissionsOf(tx, [id])).get(id) ?? [];
    return templateView(row, permissions);
  }

  private async jobTitleViewTx(tx: Tx, id: string): Promise<AdminJobTitleView> {
    const row = await this.repository.findJobTitle(tx, id);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return row;
  }
}

function templateView(
  row: CatalogTemplateRow,
  permissions: CatalogPermission[],
): AdminRoleTemplateView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    capability: row.capability,
    isBusinessAdmin: row.isBusinessAdmin,
    version: row.version,
    permissions,
    updatedAt: row.updatedAt.toISOString(),
  };
}
