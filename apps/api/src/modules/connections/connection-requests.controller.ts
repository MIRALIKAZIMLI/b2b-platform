import {
  type ConnectionRequestView,
  connectionRequestCreateSchema,
  type OutgoingConnectionRequestPage,
  outgoingConnectionRequestsQuerySchema,
} from '@b2b/shared';
import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { ConnectionRequestsService } from './connection-requests.service';

/**
 * Bağlantı isteği (F2.12a, openapi `connections`). İzin `connections.request.send` (yetenek
 * `seller`, kapsam `all`/`assigned`). Gelen istekler, yanıt ve geri çekme F2.13'te.
 */
@Controller('api/v1/connection-requests')
export class ConnectionRequestsController {
  constructor(
    @Inject(ConnectionRequestsService) private readonly requests: ConnectionRequestsService,
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
}
