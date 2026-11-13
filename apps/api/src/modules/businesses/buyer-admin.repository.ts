// Platform admininin perakendeci kayıtları (F2.18, US-015, US-016). Yalnız çağıranın platform
// işleminde (`withPlatformTx`, `platform-admin` modülü) kullanılır; `businesses` grubunun platform
// politikası (F1.7) satırları gösterir. `status`, `verified_at`, `verified_by` yalnız platform
// bağlamında değişir (`businesses_guard_platform_columns`). VÖEN temizlenince aynı tetikleyici
// hukuki tipi ve doğrulama rozetini sıfırlar (0016, R20).
import { Injectable } from '@nestjs/common';
import type { BuyerAdminFilter } from '@b2b/shared';
import { and, desc, eq, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { type BusinessStatus, businessCapabilities, businesses, personData } from './businesses.schema';

export interface BuyerAdminRow {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string | null;
  readonly legalType: string | null;
  readonly regionId: string;
  readonly status: BusinessStatus;
  readonly verifiedAt: Date | null;
  readonly profileCompleteness: number;
  readonly createdAt: Date;
}

/** Durumu değiştirilecek işletme (yetenekleriyle). */
export interface BusinessForStatus {
  readonly id: string;
  readonly status: BusinessStatus;
  readonly capabilities: readonly string[];
}

const FILTERS: Readonly<Record<BuyerAdminFilter, SQL | undefined>> = {
  all: ne(businesses.status, 'archived'),
  voen_pending: and(
    ne(businesses.status, 'archived'),
    isNotNull(businesses.voen),
    isNull(businesses.verifiedAt),
  ),
  dormant: eq(businesses.status, 'dormant'),
  suspended: eq(businesses.status, 'suspended'),
};

@Injectable()
export class BuyerAdminRepository {
  /** Perakendeciler, yeniden eskiye (created_at, id). İmleç son öğenin kimliği; arşivliler yok. */
  async listTx(
    tx: Tx,
    filter: BuyerAdminFilter,
    afterId: string | undefined,
    limit: number,
  ): Promise<BuyerAdminRow[]> {
    const after =
      afterId === undefined
        ? undefined
        : sql`(${businesses.createdAt}, ${businesses.id}) <
              (select b.created_at, b.id from businesses b where b.id = ${afterId})`;
    return await this.query(tx)
      .where(and(FILTERS[filter], after))
      .orderBy(desc(businesses.createdAt), desc(businesses.id))
      .limit(limit);
  }

  /** `buyer` yetenekli işletme; `lock` ile işlem sonuna kadar kilitli. */
  async findTx(tx: Tx, id: string, lock = false): Promise<BuyerAdminRow | undefined> {
    const query = this.query(tx).where(eq(businesses.id, id));
    const rows = lock ? await query.for('update', { of: businesses }) : await query;
    return rows[0];
  }

  /** Herhangi bir işletme (askıya alma her yetenekte; V2), kilitli. */
  async lockForStatusTx(tx: Tx, id: string): Promise<BusinessForStatus | undefined> {
    const rows = await tx
      .select({ id: businesses.id, status: businesses.status })
      .from(businesses)
      .where(eq(businesses.id, id))
      .for('update');
    const row = rows[0];
    if (row === undefined) return undefined;
    const caps = await tx
      .select({ capability: businessCapabilities.capability })
      .from(businessCapabilities)
      .where(eq(businessCapabilities.businessId, id));
    return {
      id: row.id,
      status: row.status as BusinessStatus,
      capabilities: caps.map((c) => c.capability),
    };
  }

  /** US-015 AC2: doğrulama rozeti. */
  async verifyTx(tx: Tx, id: string, userId: string, now: Date): Promise<void> {
    await tx
      .update(businesses)
      .set({ verifiedAt: now, verifiedBy: userId, updatedAt: now })
      .where(eq(businesses.id, id));
  }

  /** US-015 AC2: VÖEN temizlenir; tetikleyici `legal_type` ve rozeti sıfırlar (0016). */
  async clearVoenTx(tx: Tx, id: string, now: Date): Promise<void> {
    await tx.update(businesses).set({ voen: null, updatedAt: now }).where(eq(businesses.id, id));
  }

  async setStatusTx(tx: Tx, id: string, status: BusinessStatus, now: Date): Promise<void> {
    await tx.update(businesses).set({ status, updatedAt: now }).where(eq(businesses.id, id));
  }

  /** US-016 AC2: 🔒 kişisel veri satırı silinir (data-model §5); silinen satır sayısı. */
  async deletePersonDataTx(tx: Tx, businessId: string): Promise<number> {
    const rows = await tx
      .delete(personData)
      .where(eq(personData.businessId, businessId))
      .returning({ id: personData.id });
    return rows.length;
  }

  private query(tx: Tx) {
    return tx
      .select({
        id: businesses.id,
        legalName: businesses.legalName,
        voen: businesses.voen,
        legalType: businesses.legalType,
        regionId: businesses.regionId,
        status: sql<BusinessStatus>`${businesses.status}`,
        verifiedAt: businesses.verifiedAt,
        profileCompleteness: businesses.profileCompleteness,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .innerJoin(
        businessCapabilities,
        and(
          eq(businessCapabilities.businessId, businesses.id),
          eq(businessCapabilities.capability, 'buyer'),
        ),
      )
      .$dynamic();
  }
}
