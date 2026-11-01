import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import type { JobTitleRow, TeamRoleRow } from './team.repository';
import { type TeamInvitationView, type TeamMemberView, TeamService } from './team.service';

// openapi `/api/v1/team/*` (F2.7a, US-013). Hepsi `team.manage` (c4 §5). Davet oluşturma
// (`POST /team/invitations`) onboarding modülünde, kabul `InvitationsController`'da.

const idSchema = z.uuid();

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
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

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

  @Get('job-titles')
  @RequirePermission('team.manage')
  async jobTitles(@CurrentTenant() tenant: TenantContext): Promise<JobTitleRow[]> {
    return await this.team.listJobTitles(tenant);
  }
}
