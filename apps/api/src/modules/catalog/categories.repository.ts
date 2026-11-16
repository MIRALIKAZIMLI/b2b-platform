// Kategori ağacı sorguları (F3.2a, US-029). Okuma her bağlamda (G); yazma yalnız çağıranın platform
// işleminde (`withPlatformTx`) RLS yazma politikasıyla. `depth` tetikleyicide hesaplanır.
import { Injectable } from '@nestjs/common';
import type { CatalogName } from '@b2b/shared';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { categories } from './catalog.schema';

export interface CategoryRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: unknown;
  readonly depth: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

const columns = {
  id: categories.id,
  parentId: categories.parentId,
  name: categories.name,
  depth: categories.depth,
  sortOrder: categories.sortOrder,
  isActive: categories.isActive,
};

@Injectable()
export class CategoriesRepository {
  /** Tüm düğümler; seviye, sıra, oluşturma sırasıyla (ağaç istemcide kurulur). */
  async listAll(tx: Tx): Promise<CategoryRow[]> {
    return await tx
      .select(columns)
      .from(categories)
      .orderBy(asc(categories.depth), asc(categories.sortOrder), asc(categories.createdAt));
  }

  async find(tx: Tx, id: string): Promise<CategoryRow | undefined> {
    const rows = await tx.select(columns).from(categories).where(eq(categories.id, id));
    return rows[0];
  }

  async lock(tx: Tx, id: string): Promise<CategoryRow | undefined> {
    const rows = await tx
      .select(columns)
      .from(categories)
      .where(eq(categories.id, id))
      .for('update');
    return rows[0];
  }

  /** Aynı üstün çocukları (kök için `null`); ad tekliği denetimi (K3). */
  async siblings(tx: Tx, parentId: string | null): Promise<CategoryRow[]> {
    return await tx
      .select(columns)
      .from(categories)
      .where(parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId));
  }

  /** Aynı üst altındaki eşzamanlı ekleme/yeniden adlandırma sıralanır (K3 yarışı). */
  async lockSiblingScope(tx: Tx, parentId: string | null): Promise<void> {
    const key = `category_siblings:${parentId ?? 'root'}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  async insert(
    tx: Tx,
    row: { parentId: string | null; name: CatalogName; sortOrder: number; now: Date },
  ): Promise<string> {
    const inserted = await tx
      .insert(categories)
      .values({
        parentId: row.parentId,
        name: row.name,
        // Tetikleyici üstten yeniden hesaplar; buradaki değer yok sayılır.
        depth: 1,
        sortOrder: row.sortOrder,
        isActive: true,
        createdAt: row.now,
        updatedAt: row.now,
      })
      .returning({ id: categories.id });
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error('kategori eklenemedi');
    return id;
  }

  async update(
    tx: Tx,
    id: string,
    patch: { name?: CatalogName; sortOrder?: number; isActive?: boolean },
    now: Date,
  ): Promise<void> {
    await tx
      .update(categories)
      .set({ ...patch, updatedAt: now })
      .where(eq(categories.id, id));
  }
}
