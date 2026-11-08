// Admin unvan ve rol şablonu kataloğu (F2.9, US-012). Platform bağlamı (`withPlatformTx`) yalnız bu
// modülde açılır (c4 §3.7); iş kuralları, audit ve outbox `access` RoleCatalogService'te (aynı işlem).
import { Inject, Injectable } from '@nestjs/common';
import type { AuditRequestContext } from '../../core/audit';
import { withPlatformTx } from '../../core/db';
import {
  type AdminJobTitleView,
  type AdminRoleTemplateView,
  type JobTitlePatch,
  type NewJobTitle,
  type NewRoleTemplate,
  RoleCatalogService,
  type RoleTemplatePatch,
} from '../access';
import type { PlatformActor } from './sellers.service';

@Injectable()
export class RoleCatalogAdminService {
  constructor(@Inject(RoleCatalogService) private readonly catalog: RoleCatalogService) {}

  async listTemplates(actor: PlatformActor): Promise<AdminRoleTemplateView[]> {
    return await withPlatformTx(actor, (tx) => this.catalog.listTemplatesTx(tx));
  }

  async createTemplate(
    actor: PlatformActor,
    input: NewRoleTemplate,
    context: AuditRequestContext,
  ): Promise<AdminRoleTemplateView> {
    return await withPlatformTx(actor, (tx) =>
      this.catalog.createTemplateTx(tx, actor, input, context),
    );
  }

  async updateTemplate(
    actor: PlatformActor,
    id: string,
    input: RoleTemplatePatch,
    context: AuditRequestContext,
  ): Promise<AdminRoleTemplateView> {
    return await withPlatformTx(actor, (tx) =>
      this.catalog.updateTemplateTx(tx, actor, id, input, context),
    );
  }

  async listJobTitles(actor: PlatformActor): Promise<AdminJobTitleView[]> {
    return await withPlatformTx(actor, (tx) => this.catalog.listJobTitlesTx(tx));
  }

  async createJobTitle(
    actor: PlatformActor,
    input: NewJobTitle,
    context: AuditRequestContext,
  ): Promise<AdminJobTitleView> {
    return await withPlatformTx(actor, (tx) =>
      this.catalog.createJobTitleTx(tx, actor, input, context),
    );
  }

  async updateJobTitle(
    actor: PlatformActor,
    id: string,
    input: JobTitlePatch,
    context: AuditRequestContext,
  ): Promise<AdminJobTitleView> {
    return await withPlatformTx(actor, (tx) =>
      this.catalog.updateJobTitleTx(tx, actor, id, input, context),
    );
  }

  async deleteJobTitle(
    actor: PlatformActor,
    id: string,
    context: AuditRequestContext,
  ): Promise<void> {
    await withPlatformTx(actor, (tx) => this.catalog.deleteJobTitleTx(tx, actor, id, context));
  }
}
