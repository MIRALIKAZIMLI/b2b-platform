import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { brandCreateSchema, brandsQuerySchema } from '@b2b/shared';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { Authenticated, RequirePermission } from '../../core/auth/access-decorators';
import { withSystemTx } from '../../core/db';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { type BrandOptionView, type BrandRequestView, BrandsService } from './brands.service';
import { CategoriesService, type CategoryView } from './categories.service';

/**
 * Kategori ve marka listeleri, toptancının marka talebi (openapi `catalog`; F3.2a, US-029).
 * Listeler giriş yapmış her kullanıcıya (G); talep yalnız `catalog.manage` (yetenek `seller`).
 */
@Controller('api/v1/catalog')
export class TaxonomyController {
  constructor(
    @Inject(CategoriesService) private readonly categories: CategoriesService,
    @Inject(BrandsService) private readonly brands: BrandsService,
  ) {}

  /** Görünür ağaç: kendisi ve bütün üstleri aktif düğümler (AC4), düz liste. */
  @Authenticated()
  @Get('categories')
  async categoryTree(): Promise<CategoryView[]> {
    return await withSystemTx((tx) => this.categories.listTx(tx, true));
  }

  /** Aktif markalar; onay bekleyen talepler dönmez (V5). */
  @Authenticated()
  @Get('brands')
  async brandOptions(@Query() query: unknown): Promise<BrandOptionView[]> {
    const input = brandsQuerySchema.parse(query);
    return await withSystemTx((tx) => this.brands.searchTx(tx, input));
  }

  /** US-029 AC2: marka talebi; 422 `name: [taken]`, günlük sınır 429 `RATE_LIMITED`. */
  @Post('brands')
  @HttpCode(201)
  @RequirePermission('catalog.manage')
  async requestBrand(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BrandRequestView> {
    const input = brandCreateSchema.parse(body);
    return await this.brands.request(tenant, input.name, requestAuditContext(req));
  }

  /** Toptancının kendi talepleri (onay bekleyen, onaylanan, reddedilen). */
  @Get('brand-requests')
  @RequirePermission('catalog.view')
  async ownBrandRequests(@CurrentTenant() tenant: TenantContext): Promise<BrandRequestView[]> {
    return await this.brands.listOwnRequests(tenant);
  }
}
