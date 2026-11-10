import { type BlockedSeller, type BlockedSellerList, blockCreateSchema } from '@b2b/shared';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { ConnectionResponsesService } from './connection-responses.service';

/**
 * Perakendecinin engel listesi (F2.13a; US-023 AC4–AC5, openapi `connections`). İzin
 * `connections.block` (yalnız `buyer`). Engel tekrar edilirse aynı satır döner (`201`).
 */
@Controller('api/v1/blocks')
export class BlocksController {
  constructor(
    @Inject(ConnectionResponsesService) private readonly responses: ConnectionResponsesService,
  ) {}

  @Get()
  @RequirePermission('connections.block')
  async list(@CurrentTenant() tenant: TenantContext): Promise<BlockedSellerList> {
    return await this.responses.blocks(tenant);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('connections.block')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BlockedSeller> {
    const input = blockCreateSchema.parse(body);
    return await this.responses.block(tenant, input.sellerId, requestAuditContext(req));
  }

  @Delete(':sellerId')
  @HttpCode(204)
  @RequirePermission('connections.block')
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('sellerId') sellerId: string,
    @Req() req: AuditHttpRequest,
  ): Promise<void> {
    await this.responses.unblock(tenant, z.uuid().parse(sellerId), requestAuditContext(req));
  }
}
