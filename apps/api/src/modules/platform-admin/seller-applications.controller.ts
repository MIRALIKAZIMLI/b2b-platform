import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePlatformRole } from '../../core/auth/access-decorators';
import { SELLER_APPLICATION_STATUSES } from '../businesses';
import { CurrentSession, type SessionAuth } from '../identity';
import {
  SellerApplicationsAdminService,
  type SellerApplicationView,
} from './seller-applications.service';
import { SELLER_ADMINS } from './sellers.controller';

const listQuerySchema = z.object({
  status: z.enum(SELLER_APPLICATION_STATUSES).default('pending'),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** openapi `/api/v1/admin/seller-applications*` (F2.2, US-008). */
@Controller('api/v1/admin/seller-applications')
export class SellerApplicationsAdminController {
  constructor(
    @Inject(SellerApplicationsAdminService)
    private readonly applications: SellerApplicationsAdminService,
  ) {}

  @Get()
  @RequirePlatformRole(...SELLER_ADMINS)
  async list(
    @CurrentSession() auth: SessionAuth,
    @Query() query: unknown,
  ): Promise<{ items: SellerApplicationView[]; nextCursor: string | null }> {
    const input = listQuerySchema.parse(query);
    return await this.applications.list(
      { userId: auth.userId },
      input.status,
      input.cursor,
      input.limit,
    );
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePlatformRole(...SELLER_ADMINS)
  async reject(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Req() req: AuditHttpRequest,
  ): Promise<SellerApplicationView> {
    const applicationId = z.uuid().parse(id);
    return await this.applications.reject(
      { userId: auth.userId },
      applicationId,
      requestAuditContext(req),
    );
  }
}
