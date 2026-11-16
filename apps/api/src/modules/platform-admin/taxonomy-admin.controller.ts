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
import {
  activityTypeCreateSchema,
  adminBrandsQuerySchema,
  brandCreateSchema,
  brandPatchSchema,
  catalogEntryPatchSchema,
  categoryCreateSchema,
} from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePlatformRole } from '../../core/auth/access-decorators';
import type { ActivityTypeAdminView, AdminBrandView, CategoryView } from '../catalog';
import { CurrentSession, type SessionAuth } from '../identity';
import { CATALOG_ADMINS } from './role-catalog.controller';
import { TaxonomyAdminService } from './taxonomy-admin.service';

/**
 * openapi `/api/v1/admin/catalog/categories*`, `/brands*`, `/activity-types*` (F3.2a, US-029).
 * Erişim F2.9 V1 ile aynı (süper admin + içerik). Silme ucu yoktur (R38): yalnız `isActive: false`.
 */
@Controller('api/v1/admin/catalog')
export class TaxonomyAdminController {
  constructor(@Inject(TaxonomyAdminService) private readonly taxonomy: TaxonomyAdminService) {}

  @Get('categories')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async listCategories(@CurrentSession() auth: SessionAuth): Promise<CategoryView[]> {
    return await this.taxonomy.listCategories({ userId: auth.userId });
  }

  @Post('categories')
  @HttpCode(201)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async createCategory(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<CategoryView> {
    const input = categoryCreateSchema.parse(body);
    return await this.taxonomy.createCategory(
      { userId: auth.userId },
      input,
      requestAuditContext(req),
    );
  }

  @Patch('categories/:id')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async updateCategory(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<CategoryView> {
    const categoryId = z.uuid().parse(id);
    const input = catalogEntryPatchSchema.parse(body);
    return await this.taxonomy.updateCategory(
      { userId: auth.userId },
      categoryId,
      input,
      requestAuditContext(req),
    );
  }

  @Get('brands')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async listBrands(
    @CurrentSession() auth: SessionAuth,
    @Query() query: unknown,
  ): Promise<AdminBrandView[]> {
    return await this.taxonomy.listBrands(
      { userId: auth.userId },
      adminBrandsQuerySchema.parse(query),
    );
  }

  @Post('brands')
  @HttpCode(201)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async createBrand(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<AdminBrandView> {
    const input = brandCreateSchema.parse(body);
    return await this.taxonomy.createBrand(
      { userId: auth.userId },
      input.name,
      requestAuditContext(req),
    );
  }

  /** Onay (`status: active`), red (`rejected`), ad düzeltme, aktiflik (state-machines §13). */
  @Patch('brands/:id')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async updateBrand(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<AdminBrandView> {
    const brandId = z.uuid().parse(id);
    const input = brandPatchSchema.parse(body);
    return await this.taxonomy.updateBrand(
      { userId: auth.userId },
      brandId,
      input,
      requestAuditContext(req),
    );
  }

  @Get('activity-types')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async listActivityTypes(@CurrentSession() auth: SessionAuth): Promise<ActivityTypeAdminView[]> {
    return await this.taxonomy.listActivityTypes({ userId: auth.userId });
  }

  @Post('activity-types')
  @HttpCode(201)
  @RequirePlatformRole(...CATALOG_ADMINS)
  async createActivityType(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<ActivityTypeAdminView> {
    const input = activityTypeCreateSchema.parse(body);
    return await this.taxonomy.createActivityType(
      { userId: auth.userId },
      input,
      requestAuditContext(req),
    );
  }

  @Patch('activity-types/:id')
  @RequirePlatformRole(...CATALOG_ADMINS)
  async updateActivityType(
    @CurrentSession() auth: SessionAuth,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<ActivityTypeAdminView> {
    const activityTypeId = z.uuid().parse(id);
    const input = catalogEntryPatchSchema.parse(body);
    return await this.taxonomy.updateActivityType(
      { userId: auth.userId },
      activityTypeId,
      input,
      requestAuditContext(req),
    );
  }
}
