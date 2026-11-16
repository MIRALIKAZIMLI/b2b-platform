import { Body, Controller, Get, Inject, Put, Query, Req } from '@nestjs/common';
import {
  adminSettingsQuerySchema,
  adminSettingUpdateSchema,
  type SETTINGS_ADMIN_ROLES,
} from '@b2b/shared';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePlatformRole } from '../../core/auth/access-decorators';
import { CurrentSession, type SessionAuth } from '../identity';
import type { AdminSettingView } from '../settings';
import { type AdminSettingsList, SettingsAdminService } from './settings-admin.service';

/** `@b2b/shared` SETTINGS_ADMIN_ROLES ile aynı (tip denetimi). F2.19 T1: yalnız süper admin. */
export const SETTINGS_ADMINS = ['super_admin'] as const satisfies typeof SETTINGS_ADMIN_ROLES;

interface AdminSettingResponse extends Omit<AdminSettingView, 'updatedAt'> {
  readonly updatedAt: string | null;
}

/** openapi `/api/v1/admin/settings` GET/PUT (F2.19, US-017). */
@Controller('api/v1/admin/settings')
export class SettingsAdminController {
  constructor(@Inject(SettingsAdminService) private readonly service: SettingsAdminService) {}

  @Get()
  @RequirePlatformRole(...SETTINGS_ADMINS)
  async list(
    @CurrentSession() auth: SessionAuth,
    @Query() query: unknown,
  ): Promise<Omit<AdminSettingsList, 'items'> & { items: AdminSettingResponse[] }> {
    const result = await this.service.list(
      { userId: auth.userId },
      adminSettingsQuerySchema.parse(query),
    );
    return { ...result, items: result.items.map(toResponse) };
  }

  /** US-017 AC1–AC3: tek anahtarı bir kapsamda yazar. */
  @Put()
  @RequirePlatformRole(...SETTINGS_ADMINS)
  async update(
    @CurrentSession() auth: SessionAuth,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<AdminSettingResponse> {
    const item = await this.service.update(
      { userId: auth.userId },
      adminSettingUpdateSchema.parse(body),
      requestAuditContext(req),
    );
    return toResponse(item);
  }
}

function toResponse(item: AdminSettingView): AdminSettingResponse {
  return { ...item, updatedAt: item.updatedAt === null ? null : item.updatedAt.toISOString() };
}
