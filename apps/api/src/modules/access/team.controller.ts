import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ROLE_NAME_MAX, ROLE_PERMISSIONS_MAX } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import type { RoleTemplateView } from './team-roles.repository';
import { TeamRolesService } from './team-roles.service';
import type { JobTitleRow, TeamRoleRow } from './team.repository';
import { type TeamInvitationView, type TeamMemberView, TeamService } from './team.service';

// openapi `/api/v1/team/*` (F2.7a, US-013; F2.8 özel roller, US-014). Hepsi `team.manage` (c4 §5). Davet oluşturma
// (`POST /team/invitations`) onboarding modülünde, kabul `InvitationsController`'da.

const idSchema = z.uuid();

// openapi `RoleName` / `RolePermission` (F2.8). Katalog ve yetenek denetimi serviste (422 ayrıntılı).
const nameText = z.string().trim().min(1).max(ROLE_NAME_MAX).optional();
const roleNameSchema = z
  .strictObject({ az: nameText, ru: nameText, tr: nameText })
  .transform((value) =>
    Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined)),
  )
  .refine((value) => Object.keys(value).length > 0, { message: 'empty_name' });
const rolePermissionsSchema = z
  .array(z.strictObject({ code: z.string().max(64), scope: z.string().max(16) }))
  .min(1)
  .max(ROLE_PERMISSIONS_MAX);
const roleCreateSchema = z.strictObject({
  templateId: z.uuid(),
  name: roleNameSchema,
  permissions: rolePermissionsSchema,
});
const roleUpdateSchema = z
  .strictObject({ name: roleNameSchema, permissions: rolePermissionsSchema })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty_body' });

const memberUpdateSchema = z
  .strictObject({
    roleId: z.uuid(),
    branchId: z.uuid().nullable(),
    warehouseId: z.uuid().nullable(),
    regionIds: z.array(z.uuid()).max(200),
    status: z.literal('removed'),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty_body' });

@Controller('api/v1/team')
export class TeamController {
  constructor(
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(TeamRolesService) private readonly teamRoles: TeamRolesService,
  ) {}

  @Get('members')
  @RequirePermission('team.manage')
  async members(@CurrentTenant() tenant: TenantContext): Promise<TeamMemberView[]> {
    return await this.team.listMembers(tenant);
  }

  /** US-013 AC3 (son admin), AC4 (rol değişikliği audit + sonraki istek). */
  @Patch('members/:id')
  @RequirePermission('team.manage')
  async updateMember(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<TeamMemberView> {
    const input = memberUpdateSchema.parse(body);
    return await this.team.updateMember(
      tenant,
      idSchema.parse(id),
      input,
      requestAuditContext(req),
    );
  }

  @Get('invitations')
  @RequirePermission('team.manage')
  async invitations(@CurrentTenant() tenant: TenantContext): Promise<TeamInvitationView[]> {
    return await this.team.listInvitations(tenant);
  }

  @Post('invitations/:id/revoke')
  @HttpCode(204)
  @RequirePermission('team.manage')
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Req() req: AuditHttpRequest,
  ): Promise<void> {
    await this.team.revokeInvitation(tenant, idSchema.parse(id), requestAuditContext(req));
  }

  @Get('roles')
  @RequirePermission('team.manage')
  async roles(@CurrentTenant() tenant: TenantContext): Promise<TeamRoleRow[]> {
    return await this.team.listRoles(tenant);
  }

  /** US-014 AC1: şablondan özel rol. */
  @Post('roles')
  @HttpCode(201)
  @RequirePermission('team.manage')
  async createRole(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<TeamRoleRow> {
    return await this.teamRoles.create(
      tenant,
      roleCreateSchema.parse(body),
      requestAuditContext(req),
    );
  }

  /** US-014: özel rolü düzenle (izin değişince önbellek temizlenir, R22). */
  @Patch('roles/:id')
  @RequirePermission('team.manage')
  async updateRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<TeamRoleRow> {
    return await this.teamRoles.update(
      tenant,
      idSchema.parse(id),
      roleUpdateSchema.parse(body),
      requestAuditContext(req),
    );
  }

  @Get('role-templates')
  @RequirePermission('team.manage')
  async roleTemplates(@CurrentTenant() tenant: TenantContext): Promise<RoleTemplateView[]> {
    return await this.teamRoles.listTemplates(tenant);
  }

  @Get('job-titles')
  @RequirePermission('team.manage')
  async jobTitles(@CurrentTenant() tenant: TenantContext): Promise<JobTitleRow[]> {
    return await this.team.listJobTitles(tenant);
  }
}
