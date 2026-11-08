import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  CATALOG_ADMIN_ROLES,
  catalogCodeSchema,
  catalogNameSchema,
  ROLE_PERMISSIONS_MAX,
} from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePlatformRole } from '../../core/auth/access-decorators';
import type { AdminJobTitleView, AdminRoleTemplateView } from '../access';
import { CurrentSession, type SessionAuth } from '../identity';
import { RoleCatalogAdminService } from './role-catalog.service';

const capabilitySchema = z.enum(['seller', 'buyer']);
const permissionsSchema = z
  .array(z.strictObject({ code: z.string().max(80), scope: z.string().max(20) }))
  .min(1)
  .max(ROLE_PERMISSIONS_MAX);

/** openapi `POST /admin/catalog/role-templates`. */
const createTemplateSchema = z.strictObject({
  code: catalogCodeSchema,
  name: catalogNameSchema,
  capability: capabilitySchema,
  permissions: permissionsSchema,
});

/** openapi `PATCH /admin/catalog/role-templates/{id}`; `code` ve `capability` değişmez. */
const updateTemplateSchema = z
  .strictObject({ name: catalogNameSchema.optional(), permissions: permissionsSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, { message: 'empty' });

/** openapi `POST /admin/catalog/job-titles`. */
const createJobTitleSchema = z.strictObject({
  code: catalogCodeSchema,
  name: catalogNameSchema,
  capability: capabilitySchema,
  roleTemplateId: z.uuid(),
});

/** openapi `PATCH /admin/catalog/job-titles/{id}`. */
const updateJobTitleSchema = z
  .strictObject({
    name: catalogNameSchema.optional(),
    roleTemplateId: z.uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'empty' });

/** Kart F2.9 V1: süper admin ve içerik ekibi (`@b2b/shared` CATALOG_ADMIN_ROLES). */
export const CATALOG_ADMINS = [
  'super_admin',
  'content',
] as const satisfies typeof CATALOG_ADMIN_ROLES;

/** openapi `/api/v1/admin/catalog/role-templates*` ve `/job-titles*` (F2.9, US-012). */
@Controller('api/v1/admin/catalog')
export class RoleCatalogController {
  constructor(@Inject(RoleCatalogAdminService) private readonly catalog: RoleCatalogAdminService) {}

  @Get('role-templates')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async listTemplates(
    @CurrentSession() auth: SessionAuth,
  ): Promise<{ items: AdminRoleTemplateView[] }> {
    return { items: await this.catalog.listTemplates({ userId: auth.userId }) };
  }

  @Post('role-templates')
  @HttpCode(201)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async createTemplate(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<AdminRoleTemplateView> {
    const input = createTemplateSchema.parse(body);
    return await this.catalog.createTemplate(
      { userId: auth.userId },
      input,
      requestAuditContext(req),
    );
  }

  @Patch('role-templates/:id')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async updateTemplate(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<AdminRoleTemplateView> {
    const templateId = z.uuid().parse(id);
    const input = updateTemplateSchema.parse(body);
    return await this.catalog.updateTemplate(
      { userId: auth.userId },
      templateId,
      input,
      requestAuditContext(req),
    );
  }

  @Get('job-titles')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async listJobTitles(
    @CurrentSession() auth: SessionAuth,
  ): Promise<{ items: AdminJobTitleView[] }> {
    return { items: await this.catalog.listJobTitles({ userId: auth.userId }) };
  }

  @Post('job-titles')
  @HttpCode(201)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async createJobTitle(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<AdminJobTitleView> {
    const input = createJobTitleSchema.parse(body);
    return await this.catalog.createJobTitle(
      { userId: auth.userId },
      input,
      requestAuditContext(req),
    );
  }

  @Patch('job-titles/:id')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async updateJobTitle(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<AdminJobTitleView> {
    const jobTitleId = z.uuid().parse(id);
    const input = updateJobTitleSchema.parse(body);
    return await this.catalog.updateJobTitle(
      { userId: auth.userId },
      jobTitleId,
      input,
      requestAuditContext(req),
    );
  }

  /** US-012 AC3: kullanımdaki unvan 409 JOB_TITLE_IN_USE. */
  @Delete('job-titles/:id')
  @HttpCode(204)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async deleteJobTitle(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Req() req: AuditHttpRequest,
  ): Promise<void> {
    const jobTitleId = z.uuid().parse(id);
    await this.catalog.deleteJobTitle(
      { userId: auth.userId },
      jobTitleId,
      requestAuditContext(req),
    );
  }
}
