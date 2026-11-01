// Üyelik rolü değişikliği (F1.8a, US-013 AC4). Aynı işlemde: üyelik kilitlenir, rol güncellenir
// (son admin tetikleyicisi → LAST_ADMIN_PROTECTED), audit'e kim (actor), kime (userId), eski ve
// yeni rol yazılır, `membership.role_changed` outbox olayı eklenir (izin önbelleği temizliği F1.8b).
// Uç nokta (`PATCH /team/members/{id}`, `team.manage`) F2.7a TeamService'te.
import { Inject, Injectable } from '@nestjs/common';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { type TenantTxContext, type Tx, withTenantTx, withUserTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { OutboxWriter } from '../../core/outbox';
import { AccessRepository, type MyMembership } from './access.repository';
import { PermissionCache } from './permission.cache';

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
    @Inject(PermissionCache) private readonly cache: Pick<PermissionCache, 'invalidate'>,
  ) {}

  /**
   * İşletmenin ilk admin üyeliği, çağıranın kiracı işleminde (F2.3a perakendeci kaydı, R15).
   * Rol işletme admini olmalı (`createFromTemplateCodeTx` ile kopyalanan şablon); bileşik FK rolün
   * aynı işletmeye ait olduğunu garanti eder.
   */
  async addFounderAdminTx(
    tx: Tx,
    input: {
      id: string;
      businessId: string;
      userId: string;
      roleId: string;
      jobTitleId: string;
      now: Date;
    },
  ): Promise<void> {
    const role = await this.repository.findRole(tx, input.businessId, input.roleId);
    if (role?.isBusinessAdmin !== true) throw new DomainError('VALIDATION_FAILED');
    await this.repository.insertMembership(tx, {
      id: input.id,
      userId: input.userId,
      businessId: input.businessId,
      roleId: input.roleId,
      jobTitleId: input.jobTitleId,
      status: 'active',
      joinedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async changeRole(ctx: MembershipActorContext, input: ChangeRoleInput): Promise<void> {
    const changed = await withTenantTx(ctx, async (tx) => {
      const membership = await this.repository.lockMembership(
        tx,
        ctx.businessId,
        input.membershipId,
      );
      // Yalnız aktif üyelik (Mimar K4; Müfettiş PR #23 notu 3): removed üyelik yok sayılır.
      if (membership?.status !== 'active') {
        throw new DomainError('NOT_FOUND');
      }
      const role = await this.repository.findRole(tx, ctx.businessId, input.roleId);
      if (role === undefined) {
        throw new DomainError('NOT_FOUND');
      }
      if (
        !(await this.repository.businessHasCapability(
          tx,
          ctx.businessId,
          role.capability === 'buyer' ? 'buyer' : 'seller',
        ))
      ) {
        throw new DomainError('CAPABILITY_REQUIRED');
      }
      if (membership.roleId === role.id) {
        return false;
      }
      await this.applyRoleChangeTx(tx, ctx, membership, role.id, input.context);
      return true;
    });
    // Commit sonrası: önbellek hemen temizlenir (worker tüketicisi yedek; F1.8-AC5).
    if (changed) await this.cache.invalidate(input.membershipId);
  }

  /**
   * Rol değişikliğini çağıranın işleminde uygular (F2.7a ekip ekranı da kullanır): rol yazılır
   * (son admin tetikleyicisi), audit `membership.role_changed` (kim, kime, eski, yeni; US-013 AC4)
   * ve outbox olayı. Önbellek temizliği commit'ten sonra çağıranın işidir.
   */
  async applyRoleChangeTx(
    tx: Tx,
    ctx: MembershipActorContext,
    membership: { id: string; userId: string; roleId: string },
    roleId: string,
    context?: AuditRequestContext,
  ): Promise<void> {
    await this.repository.updateMembershipRole(tx, membership.id, roleId, this.clock.now());
    await this.audit.record(tx, {
      actor: { type: 'user', userId: ctx.userId },
      businessId: ctx.businessId,
      action: 'membership.role_changed',
      targetType: 'membership',
      targetId: membership.id,
      before: { userId: membership.userId, roleId: membership.roleId },
      after: { userId: membership.userId, roleId },
      ...(context === undefined ? {} : { context }),
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
        newRoleId: roleId,
      },
    });
  }

  /** Commit sonrası izin önbelleğini temizler (F1.8-AC5). */
  async invalidatePermissions(membershipId: string): Promise<void> {
    await this.cache.invalidate(membershipId);
  }

  /** Kullanıcının tüm işletmelerdeki aktif üyelikleri (/me, işletme seçici; F1.8b kullanır). */
  async listMine(userId: string): Promise<MyMembership[]> {
    return await withUserTx({ userId }, (tx) => this.repository.listMyMemberships(tx));
  }
}
