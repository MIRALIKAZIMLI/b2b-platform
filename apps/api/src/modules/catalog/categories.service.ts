// Kategori ağacı kuralları (F3.2a, US-029 AC1; R38). Yazma metotları çağıranın platform işleminde
// (`*Tx`; platform-admin `withPlatformTx` açar, c4 §3.7); audit aynı işlemde. Okuma her bağlamda (G).
import { Inject, Injectable } from '@nestjs/common';
import {
  CATEGORY_MAX_DEPTH,
  type CatalogEntryPatch,
  type CatalogName,
  type CategoryCreate,
} from '@b2b/shared';
import { type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { namesClash, sameName } from './catalog-names';
import { CategoriesRepository, type CategoryRow } from './categories.repository';

export interface CategoryView {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: unknown;
  readonly depth: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface CatalogActor {
  readonly userId: string;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

function view(row: CategoryRow): CategoryView {
  return { ...row };
}

/**
 * Ürün formu ve perakendeci süzgeci için görünür düğümler: kendisi ve bütün üstleri aktif (AC4:
 * pasif üstün altı da gizlenir). Satırlar seviye sırasıyla geldiği için üst her zaman önce işlenir.
 */
export function visibleCategories(rows: readonly CategoryRow[]): CategoryRow[] {
  const visible = new Set<string>();
  const result: CategoryRow[] = [];
  for (const row of rows) {
    if (!row.isActive) continue;
    if (row.parentId !== null && !visible.has(row.parentId)) continue;
    visible.add(row.id);
    result.push(row);
  }
  return result;
}

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CategoriesRepository) private readonly repository: CategoriesRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** `activeOnly`: `GET /catalog/categories`; admin pasifler dahil tümünü görür. */
  async listTx(tx: Tx, activeOnly: boolean): Promise<CategoryView[]> {
    const rows = await this.repository.listAll(tx);
    return (activeOnly ? visibleCategories(rows) : rows).map(view);
  }

  /** AC1: 4 dilde ad ve isteğe bağlı üst; derinlik ≤ 3 (AC3); pasif üst altına eklenmez. */
  async createTx(
    tx: Tx,
    actor: CatalogActor,
    input: CategoryCreate,
    context: AuditRequestContext,
  ): Promise<CategoryView> {
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      const parent = await this.repository.lock(tx, parentId);
      if (parent === undefined) throw invalid('parentId', 'not_found');
      if (!parent.isActive) throw invalid('parentId', 'inactive');
      if (parent.depth >= CATEGORY_MAX_DEPTH) throw invalid('parentId', 'max_depth');
    }
    await this.assertNameFreeTx(tx, parentId, input.name, null);
    const id = await this.repository.insert(tx, {
      parentId,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
      now: this.clock.now(),
    });
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'category.created',
      targetType: 'category',
      targetId: id,
      after: { parentId, name: input.name, sortOrder: input.sortOrder ?? 0 },
      context,
    });
    return await this.viewTx(tx, id);
  }

  /** Ad, sıra, aktiflik; üst kategori değişmez (K4), silme yok (AC4). */
  async updateTx(
    tx: Tx,
    actor: CatalogActor,
    id: string,
    input: CatalogEntryPatch,
    context: AuditRequestContext,
  ): Promise<CategoryView> {
    const current = await this.repository.lock(tx, id);
    if (current === undefined) throw new DomainError('NOT_FOUND');
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: { name?: CatalogName; sortOrder?: number; isActive?: boolean } = {};
    if (input.name !== undefined && !sameName(current.name, input.name)) {
      await this.assertNameFreeTx(tx, current.parentId, input.name, id);
      before.name = current.name;
      after.name = input.name;
      patch.name = input.name;
    }
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) {
      before.sortOrder = current.sortOrder;
      after.sortOrder = input.sortOrder;
      patch.sortOrder = input.sortOrder;
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      before.isActive = current.isActive;
      after.isActive = input.isActive;
      patch.isActive = input.isActive;
    }
    if (Object.keys(patch).length > 0) {
      await this.repository.update(tx, id, patch, this.clock.now());
      await this.audit.record(tx, {
        actor: { type: 'platform', userId: actor.userId },
        businessId: null,
        action: 'category.updated',
        targetType: 'category',
        targetId: id,
        before,
        after,
        context,
      });
    }
    return await this.viewTx(tx, id);
  }

  /** K3: aynı üst altında hiçbir dilde aynı ad yok (F3.5 Excel eşlemesi ada göre). */
  private async assertNameFreeTx(
    tx: Tx,
    parentId: string | null,
    name: CatalogName,
    selfId: string | null,
  ): Promise<void> {
    await this.repository.lockSiblingScope(tx, parentId);
    const siblings = await this.repository.siblings(tx, parentId);
    if (siblings.some((row) => row.id !== selfId && namesClash(row.name, name))) {
      throw invalid('name', 'taken');
    }
  }

  private async viewTx(tx: Tx, id: string): Promise<CategoryView> {
    const row = await this.repository.find(tx, id);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return view(row);
  }
}
