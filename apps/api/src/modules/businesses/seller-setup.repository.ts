// Toptancı kurulumu (F2.6, US-011): depolar, satıcı profili, hizmet bölgeleri. Tüm yöntemler
// çağıranın kiracı işleminde çalışır; RLS başka işletmenin satırını göstermez ve yazdırmaz.
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { regions } from '../i18n';
import { sellerProfiles, serviceAreas, warehouses } from './businesses.schema';

export type WarehouseRow = typeof warehouses.$inferSelect;
export type SellerProfileRow = typeof sellerProfiles.$inferSelect;

export interface NewWarehouse {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly addressLine: string | null;
  readonly isDefault: boolean;
  readonly now: Date;
}

export interface WarehousePatch {
  readonly name?: string;
  readonly addressLine?: string | null;
  readonly isDefault?: boolean;
  readonly status?: 'active' | 'inactive';
}

export interface SellerProfilePatch {
  readonly description?: Record<string, string> | null;
  readonly minOrderAmount?: string | null;
  readonly requireDeliveryPhoto?: boolean;
  readonly defaultWarehouseId?: string;
}

@Injectable()
export class SellerSetupRepository {
  // --- depolar ---

  async listWarehousesTx(tx: Tx, businessId: string): Promise<WarehouseRow[]> {
    return await tx
      .select()
      .from(warehouses)
      .where(eq(warehouses.businessId, businessId))
      .orderBy(desc(warehouses.isDefault), asc(warehouses.name), asc(warehouses.id));
  }

  /** Aktif depo sayısı (`warehouses.max` kullanımı; pasif depo sayılmaz). */
  async countActiveWarehousesTx(tx: Tx, businessId: string): Promise<number> {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(warehouses)
      .where(and(eq(warehouses.businessId, businessId), eq(warehouses.status, 'active')));
    return rows[0]?.n ?? 0;
  }

  /** İşletmenin herhangi bir deposu var mı (ilk depo varsayılan olur, AC1). */
  async hasAnyWarehouseTx(tx: Tx, businessId: string): Promise<boolean> {
    const rows = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.businessId, businessId))
      .limit(1);
    return rows.length > 0;
  }

  async lockWarehouseTx(tx: Tx, businessId: string, id: string): Promise<WarehouseRow | undefined> {
    const rows = await tx
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.businessId, businessId), eq(warehouses.id, id)))
      .for('update');
    return rows[0];
  }

  async insertWarehouseTx(tx: Tx, input: NewWarehouse): Promise<WarehouseRow> {
    const rows = await tx
      .insert(warehouses)
      .values({
        id: input.id,
        businessId: input.businessId,
        name: input.name,
        addressLine: input.addressLine,
        isDefault: input.isDefault,
        status: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) throw new Error('depo eklenemedi');
    return row;
  }

  /** Varsayılan depo bayrağını kaldırır (kısmi benzersiz indeks: işletme başına tek varsayılan). */
  async clearDefaultWarehouseTx(tx: Tx, businessId: string, now: Date): Promise<void> {
    await tx
      .update(warehouses)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(warehouses.businessId, businessId), eq(warehouses.isDefault, true)));
  }

  async updateWarehouseTx(
    tx: Tx,
    businessId: string,
    id: string,
    patch: WarehousePatch,
    now: Date,
  ): Promise<WarehouseRow | undefined> {
    const rows = await tx
      .update(warehouses)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(warehouses.businessId, businessId), eq(warehouses.id, id)))
      .returning();
    return rows[0];
  }

  // --- satıcı profili ---

  async findSellerProfileTx(tx: Tx, businessId: string): Promise<SellerProfileRow | undefined> {
    const rows = await tx
      .select()
      .from(sellerProfiles)
      .where(eq(sellerProfiles.businessId, businessId));
    return rows[0];
  }

  /** Satır yoksa açar (F2.1a her toptancıya açar; eski veri için güvence), varsa alanları yazar. */
  async upsertSellerProfileTx(
    tx: Tx,
    businessId: string,
    patch: SellerProfilePatch,
    now: Date,
  ): Promise<SellerProfileRow> {
    const rows = await tx
      .insert(sellerProfiles)
      .values({ businessId, ...patch, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: sellerProfiles.businessId,
        set: { ...patch, updatedAt: now },
      })
      .returning();
    const row = rows[0];
    if (row === undefined) throw new Error('satıcı profili yazılamadı');
    return row;
  }

  // --- hizmet bölgeleri ---

  async listServiceAreaIdsTx(tx: Tx, sellerId: string): Promise<string[]> {
    const rows = await tx
      .select({ regionId: serviceAreas.regionId })
      .from(serviceAreas)
      .where(eq(serviceAreas.sellerId, sellerId))
      .orderBy(asc(serviceAreas.regionId));
    return rows.map((row) => row.regionId);
  }

  /** Verilen kimliklerden `regions`'da olanlar (G tablosu; herkes okur). */
  async existingRegionIdsTx(tx: Tx, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await tx
      .select({ id: regions.id })
      .from(regions)
      .where(inArray(regions.id, [...ids]));
    return new Set(rows.map((row) => row.id));
  }

  /** Listeyi bütünüyle değiştirir (sil + ekle, aynı işlemde). */
  async replaceServiceAreasTx(
    tx: Tx,
    sellerId: string,
    regionIds: readonly string[],
    now: Date,
  ): Promise<void> {
    await tx.delete(serviceAreas).where(eq(serviceAreas.sellerId, sellerId));
    if (regionIds.length === 0) return;
    await tx
      .insert(serviceAreas)
      .values(regionIds.map((regionId) => ({ sellerId, regionId, createdAt: now })));
  }
}
