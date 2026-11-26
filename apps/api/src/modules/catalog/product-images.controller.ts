import { Body, Controller, Delete, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { productImageAddSchema, productImageOrderSchema } from '@b2b/shared';
import { z } from 'zod';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { type ProductImageView, ProductImagesService } from './product-images.service';

const idSchema = z.uuid();

/**
 * Ürün görselleri (openapi `catalog`; F3.4a, US-030 AC3). Yazma `catalog.manage` (yetenek
 * `seller`); perakendeci 403. Başka kiracının ürünü veya dosyası 404. Görseller ürün yanıtında
 * (`Product.images`) okunur; ayrı okuma ucu yok.
 */
@Controller('api/v1/products/:id/images')
export class ProductImagesController {
  constructor(@Inject(ProductImagesService) private readonly images: ProductImagesService) {}

  /** K1: `ready` `product_image` dosyası ürüne bağlanır; küçültme arka planda. */
  @Post()
  @HttpCode(201)
  @RequirePermission('catalog.manage')
  async add(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProductImageView> {
    return await this.images.add(tenant, idSchema.parse(id), productImageAddSchema.parse(body));
  }

  /** K6: ürünün bütün görselleri yeni sırayla; ilk görsel kapak. */
  @Put('order')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async reorder(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.images.reorder(tenant, idSchema.parse(id), productImageOrderSchema.parse(body));
  }

  /** K7: görsel üründen kaldırılır. */
  @Delete(':imageId')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    await this.images.remove(tenant, idSchema.parse(id), idSchema.parse(imageId));
  }
}
