import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Query } from '@nestjs/common';
import {
  stockMovementCreateSchema,
  stockItemsQuerySchema,
  stockMovementsQuerySchema,
  stockQuerySchema,
} from '@b2b/shared';
import { z } from 'zod';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import type { StockItemView, StockMovementView, StockRowView } from './stock.repository';
import {
  type Page,
  type StockMovementResult,
  StockService,
  type StockWarehouseView,
} from './stock.service';

// openapi: F3.11a (US-039 AC1, AC7) `/api/v1/stock`, `/api/v1/stock/movements`. Kapsam (`all` /
// `warehouse`, R36) serviste denetlenir. Hareket isteğinde `Idempotency-Key` zorunlu: aynı mal
// girişi iki kez yazılmaz (genel önleyici yanıtı saklar, F1.2b).
const idempotencyKeySchema = z.string().min(16).max(64);

@Controller('api/v1/stock')
export class StockController {
  constructor(@Inject(StockService) private readonly stock: StockService) {}

  @Get()
  @RequirePermission('inventory.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<Page<StockRowView>> {
    return await this.stock.list(tenant, stockQuerySchema.parse(query));
  }

  /** F3.11b: depo ekranı seçicisi (`GET /warehouses` `business.manage` ister). */
  @Get('warehouses')
  @RequirePermission('inventory.view')
  async warehouses(@CurrentTenant() tenant: TenantContext): Promise<StockWarehouseView[]> {
    return await this.stock.warehouses(tenant);
  }

  /** F3.11b: depodaki tüm satılabilir varyantlar (sayılmamışlar dahil). */
  @Get('items')
  @RequirePermission('inventory.view')
  async items(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<Page<StockItemView>> {
    return await this.stock.items(tenant, stockItemsQuerySchema.parse(query));
  }

  @Get('movements')
  @RequirePermission('inventory.view')
  async movements(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<Page<StockMovementView>> {
    return await this.stock.movements(tenant, stockMovementsQuerySchema.parse(query));
  }

  /** Mal girişi (`receipt`) veya sayım düzeltmesi (`adjustment`, sayılan toplam; S1 = A). */
  @Post('movements')
  @HttpCode(201)
  @RequirePermission('inventory.manage')
  async record(
    @CurrentTenant() tenant: TenantContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<StockMovementResult> {
    z.object({ 'Idempotency-Key': idempotencyKeySchema }).parse({
      'Idempotency-Key': idempotencyKey,
    });
    return await this.stock.record(tenant, stockMovementCreateSchema.parse(body));
  }
}
