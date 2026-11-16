import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { productCreateSchema, productsQuerySchema, productUpdateSchema } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { type ProductListView, ProductsService, type ProductView } from './products.service';

const idSchema = z.uuid();

/**
 * Toptancının ürünleri (openapi `catalog`; F3.3a, US-030). Okuma `catalog.view`, yazma
 * `catalog.manage` (ikisi de yetenek `seller`); perakendeci 403. Başka kiracının ürünü 404.
 * Perakendecinin ürün listesi `GET /browse/products` (F3.12a).
 */
@Controller('api/v1/products')
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get()
  @RequirePermission('catalog.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<ProductListView> {
    return await this.products.list(tenant, productsQuerySchema.parse(query));
  }

  /** US-030 AC1: ürün `draft` açılır. `Idempotency-Key` desteklenir (genel önleyici). */
  @Post()
  @HttpCode(201)
  @RequirePermission('catalog.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ): Promise<ProductView> {
    return await this.products.create(tenant, productCreateSchema.parse(body));
  }

  @Get(':id')
  @RequirePermission('catalog.view')
  async get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<ProductView> {
    return await this.products.get(tenant, idSchema.parse(id));
  }

  /** Kısmi düzenleme; `status` ile yayın / arşiv / geri alma (state-machines §14). */
  @Patch(':id')
  @RequirePermission('catalog.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<ProductView> {
    return await this.products.update(
      tenant,
      idSchema.parse(id),
      productUpdateSchema.parse(body),
      requestAuditContext(req),
    );
  }
}
