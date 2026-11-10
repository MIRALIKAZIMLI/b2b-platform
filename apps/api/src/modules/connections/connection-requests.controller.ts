import {
  type ConnectionRequestView,
  type ConnectionView,
  connectionAcceptSchema,
  connectionRequestCreateSchema,
  type IncomingConnectionRequestPage,
  incomingConnectionRequestsQuerySchema,
  type OutgoingConnectionRequestPage,
  outgoingConnectionRequestsQuerySchema,
} from '@b2b/shared';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { ConnectionRequestsService } from './connection-requests.service';
import { ConnectionResponsesService } from './connection-responses.service';

/**
 * Bağlantı isteği (F2.12a, F2.13a; openapi `connections`). Satıcı: gönderme, gönderilenler, geri
 * çekme (`connections.request.send`, kapsam `all`/`assigned`). Alıcı: gelen istekler
 * (`connections.view`, satın alma sorumlusu da görür, US-023 AC6), kabul/red
 * (`connections.request.respond`, yalnız `buyer`).
 */
@Controller('api/v1/connection-requests')
export class ConnectionRequestsController {
  constructor(
    @Inject(ConnectionRequestsService) private readonly requests: ConnectionRequestsService,
    @Inject(ConnectionResponsesService) private readonly responses: ConnectionResponsesService,
  ) {}

  @Post()
  @HttpCode(201)
  @RequirePermission('connections.request.send')
  async send(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ): Promise<ConnectionRequestView> {
    return await this.requests.send(tenant, connectionRequestCreateSchema.parse(body));
  }

  @Get('outgoing')
  @RequirePermission('connections.request.send')
  async outgoing(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<OutgoingConnectionRequestPage> {
    return await this.requests.outgoing(tenant, outgoingConnectionRequestsQuerySchema.parse(query));
  }

  @Get('incoming')
  @RequirePermission('connections.view')
  async incoming(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: unknown,
  ): Promise<IncomingConnectionRequestPage> {
    return await this.responses.incoming(
      tenant,
      incomingConnectionRequestsQuerySchema.parse(query),
    );
  }

  @Post(':id/accept')
  @HttpCode(200)
  @RequirePermission('connections.request.respond')
  async accept(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<ConnectionView> {
    connectionAcceptSchema.parse(body ?? {});
    return await this.responses.accept(tenant, z.uuid().parse(id), requestAuditContext(req));
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('connections.request.respond')
  async reject(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<ConnectionRequestView> {
    return await this.responses.reject(tenant, z.uuid().parse(id));
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermission('connections.request.send')
  async withdraw(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<ConnectionRequestView> {
    return await this.requests.withdraw(tenant, z.uuid().parse(id));
  }
}
