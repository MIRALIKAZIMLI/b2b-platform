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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  type CustomerPricePage,
  customerPriceRemoveQuerySchema,
  customerPricesQuerySchema,
  customerPricesSetSchema,
  type PriceExplanationView,
  priceExplainQuerySchema,
  priceListCreateSchema,
  type PriceListItemPage,
  priceListItemsQuerySchema,
  priceListItemsSetSchema,
  type PriceListPage,
  priceListUpdateSchema,
  type PriceListView,
  type TierPricePage,
  tierPricesQuerySchema,
  tierPricesSetSchema,
} from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { CustomerPricesService } from './customer-prices.service';
import { PriceListsService } from './price-lists.service';
import { TierPricesService } from './tier-prices.service';

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

/**
 * Müşteriye özel fiyat (F3.7a, US-035; openapi `pricing`). Okuma `pricing.view` (temsilci yalnız
 * atandığı müşteri), yazma ve kaldırma `pricing.manage`; perakendeci 403. Başka satıcının satırı
 * RLS ile görünmez (boş liste / 404).
 */
@Controller('api/v1/customer-prices')
export class CustomerPricesController {
  constructor(
    @Inject(CustomerPricesService) private readonly customerPrices: CustomerPricesService,
  ) {}

  @Get()
  @RequirePermission('pricing.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<CustomerPricePage> {
    return await this.customerPrices.list(tenant, customerPricesQuerySchema.parse(query));
  }

  /** US-035 AC1: yalnız aktif bağlantı; `validFrom` günü toptancının saatinde 00:00. */
  @Put()
  @RequirePermission('pricing.manage')
  async set(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<{ count: number; validFrom: string }> {
    return await this.customerPrices.set(
      tenant,
      customerPricesSetSchema.parse(body),
      requestAuditContext(req),
    );
  }

  /** S1 = A: bir ambalajın bu perakendecideki bütün müşteri fiyatları kaldırılır. */
  @Delete()
  @RequirePermission('pricing.manage')
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<{ count: number }> {
    return await this.customerPrices.remove(
      tenant,
      customerPriceRemoveQuerySchema.parse(query),
      requestAuditContext(req),
    );
  }
}

/**
 * Kademeli indirim (F3.9, US-037; openapi `pricing`). Okuma `pricing.view` (kademe müşteriye bağlı
 * değil; temsilci de okur), yazma `pricing.manage`; perakendeci 403. Başka satıcının ambalajı 404.
 */
@Controller('api/v1/tier-prices')
export class TierPricesController {
  constructor(@Inject(TierPricesService) private readonly tiers: TierPricesService) {}

  @Get()
  @RequirePermission('pricing.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<TierPricePage> {
    return await this.tiers.list(tenant, tierPricesQuerySchema.parse(query));
  }

  /** US-037 AC1: ambalajın bütün kademeleri değişir; boş liste kademeleri kaldırır. */
  @Put()
  @RequirePermission('pricing.manage')
  async set(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<{ packagingId: string; tiers: { minQty: string; discountPercent: string }[] }> {
    return await this.tiers.set(tenant, tierPricesSetSchema.parse(body), requestAuditContext(req));
  }
}
