import { Global, Injectable, Module } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { BranchUsageGate } from '../businesses';
import { invitations, memberships } from './access.schema';

/** F2.5 S3: şubeye bağlı aktif üyelik ve açık (kabul edilmemiş, süresi geçmemiş) davet sayısı. */
@Injectable()
export class AccessBranchUsageGate extends BranchUsageGate {
  async countBoundTx(
    tx: Tx,
    businessId: string,
    branchId: string,
    now: Date,
  ): Promise<{ members: number; invitations: number }> {
    const [members] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          eq(memberships.businessId, businessId),
          eq(memberships.branchId, branchId),
          eq(memberships.status, 'active'),
        ),
      );
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(invitations)
      .where(
        and(
          eq(invitations.businessId, businessId),
          eq(invitations.branchId, branchId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      );
    return { members: members?.n ?? 0, invitations: open?.n ?? 0 };
  }
}

/** `BranchUsageGate` uygulaması. Global: `businesses` access'i içe aktarmadan belirteci çözer. */
@Global()
@Module({
  providers: [
    AccessBranchUsageGate,
    { provide: BranchUsageGate, useExisting: AccessBranchUsageGate },
  ],
  exports: [BranchUsageGate],
})
export class BranchUsageGateModule {}
