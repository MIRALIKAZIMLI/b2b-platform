// Marka sorguları (F3.2a, US-029). Okuma RLS ile kısıtlı (V5: aktif + kendi talebi + platform);
// admin yazması platform işleminde, toptancı talebi yalnız `brand_request_create` (DEFINER, R37).
import { Injectable } from '@nestjs/common';
import type { BrandStatus } from '@b2b/shared';
import { and, asc, desc, eq, ilike, type SQL, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { businesses } from '../businesses';
import { brands } from './catalog.schema';

export interface BrandRow {
  readonly id: string;
  readonly name: string;
  readonly status: BrandStatus;
  readonly isActive: boolean;
  readonly requestedByBusinessId: string | null;
  readonly requestedByUserId: string | null;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

export interface AdminBrandRow extends BrandRow {
  readonly requestedByBusinessName: string | null;
}

const columns = {
  id: brands.id,
  name: brands.name,
  status: sql<BrandStatus>`${brands.status}`,
  isActive: brands.isActive,
  requestedByBusinessId: brands.requestedByBusinessId,
  requestedByUserId: brands.requestedByUserId,
  createdAt: brands.createdAt,
  decidedAt: brands.decidedAt,
};

/** Sonsuz liste yok: admin ve toptancı listeleri üst sınırlı (F3.2b ekranı süzgeçle daraltır). */
const LIST_LIMIT = 500;

function pgErrorOf(error: unknown, code: string, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && current.code === code) {
      return (
        constraint === undefined || ('constraint' in current && current.constraint === constraint)
      );
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

/** Ad tekliği (K1): `lower(btrim(name))`, reddedilenler hariç. */
export function isBrandNameTaken(error: unknown): boolean {
  return pgErrorOf(error, '23505', 'brands_name_uq');
}

/** `brand_request_create` günlük sınırı (K2). */
export function isBrandRequestLimit(error: unknown): boolean {
  return pgErrorOf(error, 'CT001');
}

/** `ilike` için `%`, `_` ve `\` kaçışlı içerir araması. */
function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

@Injectable()
export class BrandsRepository {
  /** `GET /catalog/brands`: yalnız `active` ve aktif markalar, ada göre. */
  async searchActive(tx: Tx, q: string | undefined, limit: number): Promise<BrandRow[]> {
    const conditions: SQL[] = [eq(brands.status, 'active'), eq(brands.isActive, true)];
    if (q !== undefined && q.length > 0) conditions.push(ilike(brands.name, containsPattern(q)));
    return await tx
      .select(columns)
      .from(brands)
      .where(and(...conditions))
      .orderBy(asc(sql`lower(${brands.name})`))
      .limit(limit);
  }

  /** Toptancının kendi talepleri (RLS de yalnız bunları gösterir; koşul ikinci savunma). */
  async listRequestedBy(tx: Tx, businessId: string): Promise<BrandRow[]> {
    return await tx
      .select(columns)
      .from(brands)
      .where(eq(brands.requestedByBusinessId, businessId))
      .orderBy(desc(brands.createdAt))
      .limit(LIST_LIMIT);
  }

  /** Admin listesi: talep eden işletmenin ünvanıyla (platform işleminde). */
  async listAdmin(
    tx: Tx,
    filter: { status?: BrandStatus | undefined; q?: string | undefined },
  ): Promise<AdminBrandRow[]> {
    const conditions: SQL[] = [];
    if (filter.status !== undefined) conditions.push(eq(brands.status, filter.status));
    if (filter.q !== undefined && filter.q.length > 0) {
      conditions.push(ilike(brands.name, containsPattern(filter.q)));
    }
    return await tx
      .select({ ...columns, requestedByBusinessName: businesses.legalName })
      .from(brands)
      .leftJoin(businesses, eq(businesses.id, brands.requestedByBusinessId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(brands.createdAt))
      .limit(LIST_LIMIT);
  }

  async findAdmin(tx: Tx, id: string): Promise<AdminBrandRow | undefined> {
    const rows = await tx
      .select({ ...columns, requestedByBusinessName: businesses.legalName })
      .from(brands)
      .leftJoin(businesses, eq(businesses.id, brands.requestedByBusinessId))
      .where(eq(brands.id, id));
    return rows[0];
  }

  async find(tx: Tx, id: string): Promise<BrandRow | undefined> {
    const rows = await tx.select(columns).from(brands).where(eq(brands.id, id));
    return rows[0];
  }

  async lock(tx: Tx, id: string): Promise<BrandRow | undefined> {
    const rows = await tx.select(columns).from(brands).where(eq(brands.id, id)).for('update');
    return rows[0];
  }

  /** Admin markası doğrudan `active` açılır. */
  async insertActive(tx: Tx, row: { id: string; name: string; now: Date }): Promise<void> {
    await tx.insert(brands).values({
      id: row.id,
      name: row.name,
      status: 'active',
      isActive: true,
      createdAt: row.now,
      updatedAt: row.now,
    });
  }

  /** Toptancı talebi (R37): durum, işletme ve hız sınırı fonksiyonda belirlenir. */
  async request(
    tx: Tx,
    row: { id: string; name: string; userId: string; limit: number; now: Date },
  ): Promise<void> {
    await tx.execute(
      sql`select brand_request_create(${row.id}::uuid, ${row.name}, ${row.userId}::uuid, ${row.limit}::int, ${row.now.toISOString()}::timestamptz)`,
    );
  }

  async update(
    tx: Tx,
    id: string,
    patch: {
      name?: string;
      status?: BrandStatus;
      isActive?: boolean;
      decidedAt?: Date;
      decidedByUserId?: string;
    },
    now: Date,
  ): Promise<void> {
    await tx
      .update(brands)
      .set({ ...patch, updatedAt: now })
      .where(eq(brands.id, id));
  }
}
