// Üyelik rolü değişikliği (F1.8a, US-013 AC4). Aynı işlemde: üyelik kilitlenir, rol güncellenir
// (son admin tetikleyicisi → LAST_ADMIN_PROTECTED), audit'e kim (actor), kime (userId), eski ve
// yeni rol yazılır, `membership.role_changed` outbox olayı eklenir (izin önbelleği temizliği F1.8b).
// Uç nokta ve izin denetimi (`team.manage`) F2.7 / F1.8b'de gelir.
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type TenantTxContext, withTenantTx, withUserTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { OutboxWriter } from '../../core/outbox';
import { AccessRepository, type MyMembership } from './access.repository';

export interface ChangeRoleInput {
  readonly membershipId: string;
  readonly roleId: string;
  readonly context?: AuditRequestContext;
}

/** İşlemi yapan kullanıcı ve işletme; actor kullanıcı zorunlu (audit "kim"). */
export interface MembershipActorContext extends TenantTxContext {
  readonly userId: string;
}

@Injectable()
export class MembershipService {
  constructor(
    @Inject(AccessRepository) private readonly repository: AccessRepository,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async changeRole(ctx: MembershipActorContext, input: ChangeRoleInput): Promise<void> {
    await withTenantTx(ctx, async (tx) => {
      const membership = await this.repository.lockMembership(
        tx,
        ctx.businessId,
        input.membershipId,
      );
      if (membership === undefined) {
        throw new DomainError('NOT_FOUND');
      }
      const role = await this.repository.findRole(tx, ctx.businessId, input.roleId);
      if (role === undefined) {
        throw new DomainError('NOT_FOUND');
      }
      if (membership.roleId === role.id) {
        return;
      }
      await this.repository.updateMembershipRole(tx, membership.id, role.id, this.clock.now());
      await this.audit.record(tx, {
        actor: { type: 'user', userId: ctx.userId },
        businessId: ctx.businessId,
        action: 'membership.role_changed',
        targetType: 'membership',
        targetId: membership.id,
        before: { userId: membership.userId, roleId: membership.roleId },
        after: { userId: membership.userId, roleId: role.id },
        ...(input.context === undefined ? {} : { context: input.context }),
      });
      await this.outbox.write(tx, {
        type: 'membership.role_changed',
        aggregateType: 'membership',
        aggregateId: membership.id,
        businessIds: [ctx.businessId],
        payload: {
          membershipId: membership.id,
          userId: membership.userId,
          oldRoleId: membership.roleId,
          newRoleId: role.id,
        },
      });
    });
  }

  /** Kullanıcının tüm işletmelerdeki aktif üyelikleri (/me, işletme seçici; F1.8b kullanır). */
  async listMine(userId: string): Promise<MyMembership[]> {
    return await withUserTx({ userId }, (tx) => this.repository.listMyMemberships(tx));
  }
}
