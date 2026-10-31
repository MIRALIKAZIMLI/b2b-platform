import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { voenSchema } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePlatformRole } from '../../core/auth/access-decorators';
import { CurrentSession, type SessionAuth } from '../identity';
import {
  type ActivationResult,
  type CreateSellerResult,
  type PlanView,
  type SellerView,
  SellersService,
} from './sellers.service';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/** openapi `POST /api/v1/admin/sellers` gövdesi. */
const createBodySchema = z
  .strictObject({
    legalName: z.string().trim().min(1).max(200),
    voen: voenSchema,
    regionId: z.uuid(),
    addressLine: z.string().trim().min(1).max(300).optional(),
    ownerPhone: z.string().max(20),
    ownerName: z.string().trim().min(1).max(120),
    planId: z.uuid(),
    serviceAreaRegionIds: z.array(z.uuid()).max(200).default([]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    timezone: z.string().max(64).refine(isTimeZone, { message: 'invalid_timezone' }),
    // Başvurudan açma F2.2'de; bu adımda alan reddedilir (Mimar kararı, plan §7 soru 3).
    applicationId: z.uuid().optional(),
  })
  .refine((body) => body.applicationId === undefined, {
    path: ['applicationId'],
    message: 'not_supported',
  });

const listQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** S1 = A (platform sahibi, 2026-10-31): toptancıyı süper admin ve operasyon ekibi açar. */
const SELLER_ADMINS = ['super_admin', 'operations'] as const;

/** openapi `/api/v1/admin/sellers*` ve `GET /api/v1/admin/plans` (F2.1a, US-009). */
@Controller('api/v1/admin')
export class SellersController {
  constructor(@Inject(SellersService) private readonly sellers: SellersService) {}

  @Post('sellers')
  @HttpCode(201)
  @RequirePlatformRole(...SELLER_ADMINS)
  async create(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<CreateSellerResult> {
    const input = createBodySchema.parse(body);
    return await this.sellers.create({ userId: auth.userId }, input, requestAuditContext(req));
  }

  @Get('sellers')
  @RequirePlatformRole(...SELLER_ADMINS)
  async list(
    @CurrentSession() auth: SessionAuth,
    @Query() query: unknown,
  ): Promise<{ items: SellerView[]; nextCursor: string | null }> {
    const input = listQuerySchema.parse(query);
    return await this.sellers.list({ userId: auth.userId }, input.cursor, input.limit);
  }

  /** US-009 AC3: yeni aktivasyon daveti. */
  @Post('sellers/:id/activation')
  @HttpCode(200)
  @RequirePlatformRole(...SELLER_ADMINS)
  async resendActivation(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Req() req: AuditHttpRequest,
  ): Promise<ActivationResult> {
    const businessId = z.uuid().parse(id);
    return await this.sellers.resendActivation(
      { userId: auth.userId },
      businessId,
      requestAuditContext(req),
    );
  }

  /** Yalnız okuma; plan yönetimi F6.3'te (K5). */
  @Get('plans')
  @RequirePlatformRole(...SELLER_ADMINS)
  async plans(@CurrentSession() auth: SessionAuth): Promise<{ items: PlanView[] }> {
    return { items: await this.sellers.listPlans({ userId: auth.userId }) };
  }
}
