import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { quantityActivationSchema, type StockMode } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { InventoryService, type QuantityActivation } from './inventory.service';

// openapi: F3.10 (US-038) `/api/v1/stock-mode`, `/api/v1/variants/{id}/availability`.
// `inventory.manage` kapsamı `warehouse` olan depo sorumlusu da işaretler: işaret depoya değil
// varyanta aittir (c4 §5 "Mal girişi, sayım, var/yok").

const availabilitySchema = z.strictObject({ isAvailable: z.boolean() });
const idSchema = z.uuid();

@Controller('api/v1')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get('stock-mode')
  @RequirePermission('inventory.view')
  async stockMode(@CurrentTenant() tenant: TenantContext): Promise<{ stockMode: StockMode }> {
    return await this.inventory.stockMode(tenant);
  }

  /**
   * F3.11a (S5 = B ikinci adım): miktarlı stoğu açar. Mod ayarı olduğu için `business.manage`
   * (satıcı profili PATCH'iyle aynı izin); sayılmamış varyant varsa onay ister (S2 = A).
   */
  @Post('stock-mode/quantity')
  @HttpCode(200)
  @RequirePermission('business.manage')
  async activateQuantity(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<QuantityActivation> {
    const input = quantityActivationSchema.parse(body ?? {});
    return await this.inventory.activateQuantity(
      tenant,
      input.confirmUncounted ?? false,
      requestAuditContext(req),
    );
  }

  /** US-038 AC2: yalnız `availability` modunda; başka modda 409 STOCK_MODE_MISMATCH. */
  @Put('variants/:id/availability')
  @RequirePermission('inventory.manage')
  async setAvailability(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<{ variantId: string; isAvailable: boolean }> {
    const input = availabilitySchema.parse(body);
    return await this.inventory.setAvailability(
      tenant,
      idSchema.parse(id),
      input.isAvailable,
      requestAuditContext(req),
    );
  }
}
