import { type DirectorySearchResult, directorySearchQuerySchema } from '@b2b/shared';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { DirectorySearchService } from './directory-search.service';

/**
 * Perakendeci dizini (F2.11b, openapi `GET /api/v1/directory/buyers`). İzin `directory.search`
 * (yetenek `seller`, kapsam `all`/`assigned`). Dışa aktarma ucu bilerek yok (US-019 AC4).
 */
@Controller('api/v1/directory')
export class DirectoryController {
  constructor(@Inject(DirectorySearchService) private readonly search: DirectorySearchService) {}

  @Get('buyers')
  @RequirePermission('directory.search')
  async buyers(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<DirectorySearchResult> {
    return await this.search.search(tenant, directorySearchQuerySchema.parse(query));
  }
}
