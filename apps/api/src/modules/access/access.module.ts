import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../../core/audit';
import { OutboxModule } from '../../core/outbox';
import { TotpRepository } from '../identity';
import { SettingsModule } from '../settings';
import { AccessEventsProcessor } from './access-events.processor';
import { AccessGuard, PLATFORM_ROLE } from './access.guard';
import { AccessRepository } from './access.repository';
import { InvitationService } from './invitation.service';
import { InvitationsController } from './invitations.controller';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { MembershipService } from './membership.service';
import { PermissionCache } from './permission.cache';
import { RoleService } from './role.service';
import { TenantContextRepository } from './tenant-context.repository';
import { TenantContextService, TOTP_STATUS } from './tenant-context.service';

/**
 * Erişim (F1.8a veri, F1.8b karar): izinler, rol şablonları, roller, üyelikler; global AccessGuard
 * (APP_GUARD), kiracı bağlamı, izin önbelleği ve `/me`. Kimlik servisleri global IdentityModule'den.
 */
@Module({
  imports: [AuditModule, OutboxModule, SettingsModule],
  controllers: [MeController, InvitationsController],
  providers: [
    AccessRepository,
    RoleService,
    MembershipService,
    PermissionCache,
    TenantContextRepository,
    TenantContextService,
    MeService,
    InvitationService,
    { provide: TOTP_STATUS, useExisting: TotpRepository },
    { provide: PLATFORM_ROLE, useExisting: TotpRepository },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [RoleService, MembershipService, TenantContextService, InvitationService],
})
export class AccessModule {}

/** Worker: `access` kuyruğu tüketicisi (izin önbelleği temizliği). */
@Module({
  imports: [SettingsModule],
  providers: [PermissionCache, AccessEventsProcessor],
})
export class AccessWorkerModule {}
