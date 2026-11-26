import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import {
  importCreateSchema,
  type ImportJobView,
  type ImportTemplateLink,
  importTemplateQuerySchema,
} from '@b2b/shared';
import { z } from 'zod';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { ImportsService } from './imports.service';

const idSchema = z.uuid();

/**
 * Excel içe aktarma (openapi `imports`; F3.5a, US-031, SF-08). Bütün uçlar `imports.run`
 * (yetenek `seller`, kapsam `all`); perakendeci 403, başka satıcının işi 404. Uygulama
 * (`POST /imports/{id}/apply`) F3.5c'de.
 */
@Controller('api/v1/imports')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly imports: ImportsService) {}

  /** US-031 AC1: şablon .xlsx'in süreli indirme bağlantısı (kullanıcının dilinde). */
  @Get('template')
  @RequirePermission('imports.run')
  async template(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ImportTemplateLink> {
    return await this.imports.template(
      tenant,
      importTemplateQuerySchema.parse(query),
      acceptLanguage,
    );
  }

  /** US-031 AC2: F1.10 ile yüklenmiş `import` dosyasından iş açar; doğrulama arka planda. */
  @Post()
  @HttpCode(202)
  @RequirePermission('imports.run')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ImportJobView> {
    return await this.imports.create(tenant, importCreateSchema.parse(body), acceptLanguage);
  }

  @Get(':id')
  @RequirePermission('imports.run')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<ImportJobView> {
    return await this.imports.get(tenant, idSchema.parse(id));
  }
}
