import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { type TeamInvitationResult, TeamInvitationService } from './team-invitation.service';

const inviteSchema = z.strictObject({
  phone: z.string().min(1).max(32),
  fullName: z.string().trim().min(1).max(120),
  jobTitleId: z.uuid(),
  roleId: z.uuid(),
  branchId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
});

/** openapi `POST /api/v1/team/invitations` (F2.7a, US-013 AC1–AC2). Gövde loglanmaz. */
@Controller('api/v1/team/invitations')
export class TeamInvitationsController {
  constructor(@Inject(TeamInvitationService) private readonly service: TeamInvitationService) {}

  @Post()
  @HttpCode(201)
  @RequirePermission('team.manage')
  async invite(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<TeamInvitationResult> {
    const input = inviteSchema.parse(body);
    return await this.service.invite(tenant, input, requestAuditContext(req));
  }
}
