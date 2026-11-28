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
  Req,
} from '@nestjs/common';
import {
  MIN_ORDER_AMOUNT_PATTERN,
  LOW_STOCK_THRESHOLD_PATTERN,
  SELECTABLE_STOCK_MODES,
  SELLER_DESCRIPTION_MAX,
} from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import type { WarehouseRow } from './seller-setup.repository';
import { SellerSetupService, type SellerProfileView } from './seller-setup.service';

// openapi: F2.6 (US-011) depolar, satıcı profili, hizmet bölgeleri. İzin `business.manage`
// (c4 §5: "Profil, depolar, şubeler…"); `seller` yeteneği serviste denetlenir.

const warehouseCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  addressLine: z.string().trim().min(1).max(300).optional(),
});

const warehouseUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    addressLine: z.string().trim().min(1).max(300).nullable(),
    isDefault: z.literal(true),
    status: z.enum(['active', 'inactive']),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty_body' });

const localizedDescriptionSchema = z
  .strictObject({
    az: z.string().trim().max(SELLER_DESCRIPTION_MAX),
    ru: z.string().trim().max(SELLER_DESCRIPTION_MAX),
    tr: z.string().trim().max(SELLER_DESCRIPTION_MAX),
    en: z.string().trim().max(SELLER_DESCRIPTION_MAX),
  })
  .partial()
  .transform((value) => {
    const out: Record<string, string> = {};
    for (const [key, text] of Object.entries(value)) {
      if (text !== undefined && text !== '') out[key] = text;
    }
    return out;
  });

const sellerProfileUpdateSchema = z
  .strictObject({
    // Boş dillerden arınmış metin hiç dil içermiyorsa silme sayılır (null).
    description: localizedDescriptionSchema
      .nullable()
      .transform((value) => (value === null || Object.keys(value).length === 0 ? null : value)),
    minOrderAmount: z.string().regex(MIN_ORDER_AMOUNT_PATTERN, 'invalid_amount').nullable(),
    requireDeliveryPhoto: z.boolean(),
    // F3.10 (US-038 AC1): `quantity` iki adımlı geçişle F3.11a'da (S5 = B); bugün 422.
    stockMode: z.enum(SELECTABLE_STOCK_MODES),
    // F3.11b (US-039 AC6, kullanıcı kararı S1 = A): "Son X koli" / "az qalan" eşiği, satış biriminde.
    lowStockDisplayThreshold: z.string().regex(LOW_STOCK_THRESHOLD_PATTERN, 'invalid'),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty_body' });

const serviceAreasSchema = z.strictObject({
  regionIds: z.array(z.uuid()).max(200),
});

/** openapi `Warehouse`. */
export interface WarehouseView {
  readonly id: string;
  readonly name: string;
  readonly addressLine: string | null;
  readonly isDefault: boolean;
  readonly status: string;
}

function toWarehouse(row: WarehouseRow): WarehouseView {
  return {
    id: row.id,
    name: row.name,
    addressLine: row.addressLine,
    isDefault: row.isDefault,
    status: row.status,
  };
}

const idSchema = z.uuid();

@Controller('api/v1/warehouses')
export class WarehousesController {
  constructor(@Inject(SellerSetupService) private readonly setup: SellerSetupService) {}

  @Get()
  @RequirePermission('business.manage')
  async list(@CurrentTenant() tenant: TenantContext): Promise<WarehouseView[]> {
    return (await this.setup.listWarehouses(tenant)).map(toWarehouse);
  }

  /** US-011 AC1, AC2. */
  @Post()
  @HttpCode(201)
  @RequirePermission('business.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<WarehouseView> {
    const input = warehouseCreateSchema.parse(body);
    return toWarehouse(await this.setup.createWarehouse(tenant, input, requestAuditContext(req)));
  }

  /** US-011 AC3: pasifleştirme; ad / adres; varsayılan yapma. */
  @Patch(':id')
  @RequirePermission('business.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<WarehouseView> {
    const input = warehouseUpdateSchema.parse(body);
    const row = await this.setup.updateWarehouse(
      tenant,
      idSchema.parse(id),
      input,
      requestAuditContext(req),
    );
    return toWarehouse(row);
  }
}

@Controller('api/v1/business')
export class SellerProfileController {
  constructor(@Inject(SellerSetupService) private readonly setup: SellerSetupService) {}

  @Get('seller-profile')
  @RequirePermission('business.manage')
  async getProfile(@CurrentTenant() tenant: TenantContext): Promise<SellerProfileView> {
    return await this.setup.getProfile(tenant);
  }

  @Patch('seller-profile')
  @RequirePermission('business.manage')
  async updateProfile(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<SellerProfileView> {
    const input = sellerProfileUpdateSchema.parse(body);
    return await this.setup.updateProfile(tenant, input, requestAuditContext(req));
  }

  @Get('service-areas')
  @RequirePermission('business.manage')
  async getServiceAreas(@CurrentTenant() tenant: TenantContext): Promise<{ regionIds: string[] }> {
    return { regionIds: await this.setup.listServiceAreas(tenant) };
  }

  @Put('service-areas')
  @RequirePermission('business.manage')
  async replaceServiceAreas(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<{ regionIds: string[] }> {
    const input = serviceAreasSchema.parse(body);
    const regionIds = await this.setup.replaceServiceAreas(
      tenant,
      input.regionIds,
      requestAuditContext(req),
    );
    return { regionIds };
  }
}
