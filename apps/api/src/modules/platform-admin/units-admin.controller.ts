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
  Req,
} from '@nestjs/common';
import {
  catalogNameSchema,
  unitAbbreviationSchema,
  unitCodeSchema,
  unitFactorSchema,
  unitKindSchema,
} from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePlatformRole } from '../../core/auth/access-decorators';
import type { UnitCatalogView, UnitConversionView, UnitView } from '../catalog';
import { CurrentSession, type SessionAuth } from '../identity';
import { CATALOG_ADMINS } from './role-catalog.controller';
import { UnitsAdminService } from './units-admin.service';

/** openapi `POST /admin/catalog/units`. */
const createUnitSchema = z.strictObject({
  code: unitCodeSchema,
  kind: unitKindSchema,
  name: catalogNameSchema,
  abbreviation: unitAbbreviationSchema,
  allowsDecimal: z.boolean(),
});

/** openapi `PATCH /admin/catalog/units/{code}`; `code` ve `kind` değişmez (K1). */
const updateUnitSchema = z
  .strictObject({
    name: catalogNameSchema.optional(),
    abbreviation: unitAbbreviationSchema.optional(),
    allowsDecimal: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'empty' });

/** openapi `PUT /admin/catalog/unit-conversions`. */
const conversionSchema = z.strictObject({
  fromCode: unitCodeSchema,
  toCode: unitCodeSchema,
  factor: unitFactorSchema,
});

/**
 * openapi `/api/v1/admin/catalog/units*` ve `/unit-conversions*` (F3.1, US-028). Erişim F2.9 V1 ile
 * aynı (süper admin + içerik). Birim silme ucu yoktur (AC3): yalnız `isActive: false`.
 */
@Controller('api/v1/admin/catalog')
export class UnitsAdminController {
  constructor(@Inject(UnitsAdminService) private readonly units: UnitsAdminService) {}

  @Get('units')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async list(@CurrentSession() auth: SessionAuth): Promise<UnitCatalogView> {
    return await this.units.list({ userId: auth.userId });
  }

  @Post('units')
  @HttpCode(201)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async create(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<UnitView> {
    const input = createUnitSchema.parse(body);
    return await this.units.create({ userId: auth.userId }, input, requestAuditContext(req));
  }

  @Patch('units/:code')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async update(
    @CurrentSession() auth: SessionAuth,
    @Param('code') code: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<UnitView> {
    const unitCode = unitCodeSchema.parse(code);
    const input = updateUnitSchema.parse(body);
    return await this.units.update(
      { userId: auth.userId },
      unitCode,
      input,
      requestAuditContext(req),
    );
  }

  @Put('unit-conversions')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async saveConversion(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<UnitConversionView> {
    const input = conversionSchema.parse(body);
    return await this.units.saveConversion(
      { userId: auth.userId },
      input,
      requestAuditContext(req),
    );
  }

  @Delete('unit-conversions/:fromCode/:toCode')
  @HttpCode(204)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async deleteConversion(
    @CurrentSession() auth: SessionAuth,
    @Param('fromCode') fromCode: string,
    @Param('toCode') toCode: string,
    @Req() req: AuditHttpRequest,
  ): Promise<void> {
    await this.units.deleteConversion(
      { userId: auth.userId },
      unitCodeSchema.parse(fromCode),
      unitCodeSchema.parse(toCode),
      requestAuditContext(req),
    );
  }
}
