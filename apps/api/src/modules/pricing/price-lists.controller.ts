import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  type PriceExplanationView,
  priceExplainQuerySchema,
  priceListCreateSchema,
  type PriceListItemPage,
  priceListItemsQuerySchema,
  priceListItemsSetSchema,
  type PriceListPage,
  priceListUpdateSchema,
  type PriceListView,
} from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { PriceListsService } from './price-lists.service';

const idSchema = z.uuid();

/**
 * Toptancının fiyat listeleri (openapi `pricing`; F3.6a, US-034). Okuma `pricing.view`, yazma
 * `pricing.manage` (ikisi de yetenek `seller`); perakendeci 403. Başka satıcının listesi 404.
 */
@Controller('api/v1/price-lists')
export class PriceListsController {
  constructor(@Inject(PriceListsService) private readonly lists: PriceListsService) {}

  @Get()
  @RequirePermission('pricing.view')
  async list(@CurrentTenant() tenant: TenantContext): Promise<PriceListPage> {
    return await this.lists.list(tenant);
  }

  /** US-034 AC1. `Idempotency-Key` desteklenir (genel önleyici). */
  @Post()
  @HttpCode(201)
  @RequirePermission('pricing.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<PriceListView> {
    return await this.lists.create(
      tenant,
      priceListCreateSchema.parse(body),
      requestAuditContext(req),
    );
  }

  @Patch(':id')
  @RequirePermission('pricing.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<PriceListView> {
    return await this.lists.update(
      tenant,
      idSchema.parse(id),
      priceListUpdateSchema.parse(body),
      requestAuditContext(req),
    );
  }

  @Get(':id/items')
  @RequirePermission('pricing.view')
  async items(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<PriceListItemPage> {
    return await this.lists.items(
      tenant,
      idSchema.parse(id),
      priceListItemsQuerySchema.parse(query),
    );
  }

  /** US-034 AC6: toplu fiyat; `validFrom` günü toptancının saatinde 00:00 (K4). */
  @Put(':id/items')
  @RequirePermission('pricing.manage')
  async setItems(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<{ count: number; validFrom: string }> {
    return await this.lists.setItems(
      tenant,
      idSchema.parse(id),
      priceListItemsSetSchema.parse(body),
      requestAuditContext(req),
    );
  }
}

/** `GET /prices/explain` (US-034 AC5): yalnız satıcı bakışı. */
@Controller('api/v1/prices')
export class PricesController {
  constructor(@Inject(PriceListsService) private readonly lists: PriceListsService) {}

  @Get('explain')
  @RequirePermission('pricing.view')
  async explain(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<PriceExplanationView> {
    return await this.lists.explain(tenant, priceExplainQuerySchema.parse(query));
  }
}
