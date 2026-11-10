import {
  type ConnectionPage,
  type ConnectionView,
  connectionsQuerySchema,
  connectionTermsUpdateSchema,
  type SalesRepList,
} from '@b2b/shared';
import { Body, Controller, Get, Inject, Param, Patch, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { ConnectionTermsService } from './connection-terms.service';

/**
 * Bağlantılar (F2.14a; US-024, openapi `connections`). Liste iki tarafa (`connections.view`);
 * koşullar yalnız satıcıya (`connections.terms.manage`, kapsam yalnız `all`: temsilci yalnız görür).
 */
@Controller('api/v1/connections')
export class ConnectionsController {
  constructor(@Inject(ConnectionTermsService) private readonly terms: ConnectionTermsService) {}

  @Get()
  @RequirePermission('connections.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<ConnectionPage> {
    return await this.terms.list(tenant, connectionsQuerySchema.parse(query));
  }

  @Get('sales-reps')
  @RequirePermission('connections.terms.manage')
  async salesReps(@CurrentTenant() tenant: TenantContext): Promise<SalesRepList> {
    return await this.terms.salesReps(tenant);
  }

  @Patch(':id/terms')
  @RequirePermission('connections.terms.manage')
  async updateTerms(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<ConnectionView> {
    const input = connectionTermsUpdateSchema.parse(body ?? {});
    return await this.terms.updateTerms(
      tenant,
      z.uuid().parse(id),
      input,
      requestAuditContext(req),
    );
  }
}
