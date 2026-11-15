import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  BUYER_ADMIN_FILTERS,
  type BUYER_ADMIN_READ_ROLES,
  type BUYER_ADMIN_WRITE_ROLES,
  businessStatusActionSchema,
  voenDecisionSchema,
} from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePlatformRole } from '../../core/auth/access-decorators';
import { CurrentSession, type SessionAuth } from '../identity';
import {
  type BusinessStatusResult,
  type BuyerAdminView,
  BuyersAdminService,
} from './buyers-admin.service';

/** `@b2b/shared` BUYER_ADMIN_READ_ROLES / BUYER_ADMIN_WRITE_ROLES ile aynı (bekçi testi). */
export const BUYER_READERS = [
  'super_admin',
  'operations',
  'support',
] as const satisfies typeof BUYER_ADMIN_READ_ROLES;
export const BUYER_WRITERS = [
  'super_admin',
  'operations',
] as const satisfies typeof BUYER_ADMIN_WRITE_ROLES;

const listQuerySchema = z.object({
  filter: z.enum(BUYER_ADMIN_FILTERS).default('all'),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * openapi `/api/v1/admin/buyers*` ve `POST /api/v1/admin/businesses/{id}/status` (F2.18; US-015,
 * US-016). Okuma: süper admin, operasyon, destek; yazma: süper admin, operasyon (productreport
 * "Platform rolleri").
 */
@Controller('api/v1/admin')
export class BuyersAdminController {
  constructor(@Inject(BuyersAdminService) private readonly buyers: BuyersAdminService) {}

  @Get('buyers')
  @RequirePlatformRole(...BUYER_READERS)
  async list(
    @CurrentSession() auth: SessionAuth,
    @Query() query: unknown,
  ): Promise<{ items: BuyerAdminView[]; nextCursor: string | null }> {
    const input = listQuerySchema.parse(query);
    return await this.buyers.list({ userId: auth.userId }, input.filter, input.cursor, input.limit);
  }

  /** US-015 AC1: kayıt ayrıntısı. */
  @Get('buyers/:id')
  @RequirePlatformRole(...BUYER_READERS)
  async get(@CurrentSession() auth: SessionAuth, @Param('id') id: string): Promise<BuyerAdminView> {
    return await this.buyers.get({ userId: auth.userId }, z.uuid().parse(id));
  }

  /** US-015 AC2: VÖEN doğrula / reddet. */
  @Post('buyers/:id/verify')
  @HttpCode(200)
  @RequirePlatformRole(...BUYER_WRITERS)
  async verify(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BuyerAdminView> {
    return await this.buyers.decideVoen(
      { userId: auth.userId },
      z.uuid().parse(id),
      voenDecisionSchema.parse(body),
      requestAuditContext(req),
    );
  }

  /** US-016 AC1–AC3: askıya al / kaldır / sil. */
  @Post('businesses/:id/status')
  @HttpCode(200)
  @RequirePlatformRole(...BUYER_WRITERS)
  async status(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BusinessStatusResult> {
    return await this.buyers.changeStatus(
      { userId: auth.userId },
      z.uuid().parse(id),
      businessStatusActionSchema.parse(body),
      requestAuditContext(req),
    );
  }
}
