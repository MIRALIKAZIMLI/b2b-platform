// Şubeler (F2.5, US-010). Tüm yöntemler çağıranın kiracı işleminde çalışır; RLS (T) başka
// işletmenin satırını göstermez ve yazdırmaz. `business_id` koşulu ikinci savunmadır.
import { Injectable } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { regions } from '../i18n';
import { branches } from './businesses.schema';

export type BranchRow = typeof branches.$inferSelect;

export interface NewBranch {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly regionId: string;
  readonly addressLine: string;
  readonly geoLat: string | null;
  readonly geoLng: string | null;
  readonly approvalRule: string;
  readonly approvalThreshold: string | null;
  readonly now: Date;
}

export interface BranchPatch {
  name?: string;
  regionId?: string;
  addressLine?: string;
  geoLat?: string | null;
  geoLng?: string | null;
  approvalRule?: string;
  approvalThreshold?: string | null;
  status?: string;
}

@Injectable()
export class BranchesRepository {
  /** Aktifler önce, sonra ada göre. */
  async listTx(tx: Tx, businessId: string): Promise<BranchRow[]> {
    return await tx
      .select()
      .from(branches)
      .where(eq(branches.businessId, businessId))
      .orderBy(asc(branches.status), asc(branches.name), asc(branches.id));
  }

  async findTx(tx: Tx, businessId: string, id: string): Promise<BranchRow | undefined> {
    const rows = await tx
      .select()
      .from(branches)
      .where(and(eq(branches.businessId, businessId), eq(branches.id, id)));
    return rows[0];
  }

  async lockTx(tx: Tx, businessId: string, id: string): Promise<BranchRow | undefined> {
    const rows = await tx
      .select()
      .from(branches)
      .where(and(eq(branches.businessId, businessId), eq(branches.id, id)))
      .for('update');
    return rows[0];
  }

  /** Bu şube dışındaki aktif şube sayısı (T3: son aktif şube pasifleşemez). */
  async countOtherActiveTx(tx: Tx, businessId: string, exceptId: string): Promise<number> {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(branches)
      .where(
        and(
          eq(branches.businessId, businessId),
          eq(branches.status, 'active'),
          ne(branches.id, exceptId),
        ),
      );
    return rows[0]?.n ?? 0;
  }

  async insertTx(tx: Tx, input: NewBranch): Promise<BranchRow> {
    const rows = await tx
      .insert(branches)
      .values({
        id: input.id,
        businessId: input.businessId,
        name: input.name,
        regionId: input.regionId,
        addressLine: input.addressLine,
        geoLat: input.geoLat,
        geoLng: input.geoLng,
        approvalRule: input.approvalRule,
        approvalThreshold: input.approvalThreshold,
        status: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) throw new Error('şube eklenemedi');
    return row;
  }

  async updateTx(
    tx: Tx,
    businessId: string,
    id: string,
    patch: BranchPatch,
    now: Date,
  ): Promise<BranchRow | undefined> {
    const rows = await tx
      .update(branches)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(branches.businessId, businessId), eq(branches.id, id)))
      .returning();
    return rows[0];
  }

  /** `regions` G tablosu; herkes okur. */
  async regionExistsTx(tx: Tx, regionId: string): Promise<boolean> {
    const rows = await tx
      .select({ id: regions.id })
      .from(regions)
      .where(eq(regions.id, regionId))
      .limit(1);
    return rows.length > 0;
  }
}
