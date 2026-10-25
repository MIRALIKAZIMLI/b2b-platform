import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { OutboxModule } from '../../core/outbox';
import { AccessRepository } from './access.repository';
import { MembershipService } from './membership.service';
import { RoleService } from './role.service';

/**
 * Erişim verisi (F1.8a): izinler, rol şablonları, roller, üyelikler. Bu adımda HTTP uç noktası
 * yok; TenantContext, PermissionGuard ve /me izinleri F1.8b'de gelir.
 */
@Module({
  imports: [AuditModule, OutboxModule],
  providers: [AccessRepository, RoleService, MembershipService],
  exports: [RoleService, MembershipService],
})
export class AccessModule {}
