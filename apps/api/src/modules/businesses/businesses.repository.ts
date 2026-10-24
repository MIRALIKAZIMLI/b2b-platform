import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  type PlatformTxContext,
  type TenantTxContext,
  withPlatformTx,
  withTenantTx,
} from '../../core/db';
import {
  businessCapabilities,
  businesses,
  type Capability,
  type CapabilityStatus,
} from './businesses.schema';

export type BusinessRow = typeof businesses.$inferSelect;

export interface CapabilityRow {
  readonly capability: Capability;
  readonly status: CapabilityStatus;
}

/**
 * İşletme çekirdek tablolarına erişim (F1.7). Sorgular kiracı filtresini açıkça yazar; RLS son
 * savunma hattıdır (ADR-0003 §5). HTTP uç noktaları F2'de (işletme açma F2.1, kayıt F2.3).
 */
@Injectable()
export class BusinessesRepository {
  /** Bağlamdaki işletmenin kendi kaydı; yoksa undefined. */
  async findOwn(ctx: TenantTxContext): Promise<BusinessRow | undefined> {
    const rows = await withTenantTx(ctx, (tx) =>
      tx.select().from(businesses).where(eq(businesses.id, ctx.businessId)),
    );
    return rows[0];
  }

  /** Bağlamdaki işletmenin yetenekleri (yetki kontrolü yeteneğe göre, ADR-0004). */
  async listCapabilities(ctx: TenantTxContext): Promise<CapabilityRow[]> {
    const rows = await withTenantTx(ctx, (tx) =>
      tx
        .select({
          capability: businessCapabilities.capability,
          status: businessCapabilities.status,
        })
        .from(businessCapabilities)
        .where(eq(businessCapabilities.businessId, ctx.businessId)),
    );
    return rows as CapabilityRow[];
  }

  /**
   * Yeteneği onaylar (yalnızca platform bağlamı; K1, state-machines §10). Satır yoksa false.
   * `approvedAt` çağıran servisin Clock'undan gelir.
   */
  async approveCapability(
    ctx: PlatformTxContext,
    businessId: string,
    capability: Capability,
    approvedAt: Date,
  ): Promise<boolean> {
    const rows = await withPlatformTx(ctx, (tx) =>
      tx
        .update(businessCapabilities)
        .set({ status: 'approved', approvedBy: ctx.userId, approvedAt, updatedAt: approvedAt })
        .where(
          and(
            eq(businessCapabilities.businessId, businessId),
            eq(businessCapabilities.capability, capability),
          ),
        )
        .returning({ businessId: businessCapabilities.businessId }),
    );
    return rows.length === 1;
  }
}
