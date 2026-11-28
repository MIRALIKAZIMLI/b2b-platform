// Miktarlı stok (F3.11a; US-039 AC1, AC7, ADR-0018, R35, R36; c4 §5 `StockService`).
// - Stok yalnız hareketle değişir: servis hareket ekler, satırı veritabanı tetikleyicisi günceller.
// - Sayım düzeltmesi (S1 = A): kullanıcı sayılan toplamı girer; hareket farkı yazar. Fark 0 ise
//   hareket yazılmaz; yalnız satırın ilk sayımı 0 ise 0 farklı hareket satırı açar ("sayıldı",
//   miktarlı moda geçişte sayılmamış sayılmaz, S2).
// - Depo kapsamı (R36): `inventory.*` kapsamı `warehouse` olan kullanıcı yalnız kendi deposunda.
// - Kilit sırası: depo `FOR SHARE` → varyant `FOR NO KEY UPDATE` → stok satırı (tetikleyici). Aynı
//   varyantın hareketleri sıralanır; sayım farkı her zaman taze sayıdan hesaplanır.
// - Stok her modda yazılır (S5 = B: miktarlı moda geçmeden önce sayım girilir).
// Hareket başına audit yok (F3.11a K2): hareket kaydı silinmez iz, `created_by` dolu.
import { Inject, Injectable } from '@nestjs/common';
import type { ManualStockMovementType, PermissionCode } from '@b2b/shared';
import { Clock } from '../../core/clock';
import { withTenantTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { compare, fromDecimalString, subtract, toDecimalString, ZERO } from '../../core/money';
import type { TenantContext } from '../../core/tenant-context';
import { SellerSetupRepository } from '../businesses';
import { InventoryRepository } from './inventory.repository';
import { type StockMovementView, StockRepository, type StockRowView } from './stock.repository';

export const STOCK_LIST_LIMIT_DEFAULT = 20;
/** `numeric(14,3)` metni `Decimal` şemasında; 4 hane güvenli (girdi en çok 3 ondalık). */
const QTY_TEXT_SCALE = 4;

export interface StockMovementInput {
  readonly warehouseId: string;
  readonly variantId: string;
  readonly type: ManualStockMovementType;
  readonly qty: string;
  readonly lotNo?: string | undefined;
  readonly expiryDate?: string | undefined;
  readonly note?: string | undefined;
}

export interface StockMovementResult {
  readonly movement: StockMovementView | null;
  readonly stock: StockRowView;
}

export interface StockListQuery {
  readonly warehouseId?: string | undefined;
  readonly variantId?: string | undefined;
  readonly low?: boolean | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

function invalidCursor(): DomainError {
  return new DomainError('VALIDATION_FAILED', { cursor: ['invalid'] });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stok imleci: `[sku, warehouseId]` JSON, base64url. Bozuk imleç 422. */
function encodeStockCursor(row: StockRowView): string {
  return Buffer.from(JSON.stringify([row.sku, row.warehouseId])).toString('base64url');
}

function decodeStockCursor(value: string): { sku: string; warehouseId: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      UUID.test(parsed[1])
    ) {
      return { sku: parsed[0], warehouseId: parsed[1] };
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  throw invalidCursor();
}

/** Hareket imleci: `<createdAt ISO>|<id>` base64url. */
function encodeMovementCursor(row: StockMovementView): string {
  return Buffer.from(`${row.createdAt}|${row.id}`).toString('base64url');
}

function decodeMovementCursor(value: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  const createdAt = iso === undefined ? new Date(Number.NaN) : new Date(iso);
  if (id === undefined || Number.isNaN(createdAt.getTime()) || !UUID.test(id)) {
    throw invalidCursor();
  }
  return { createdAt, id };
}

@Injectable()
export class StockService {
  constructor(
    @Inject(StockRepository) private readonly repository: StockRepository,
    @Inject(InventoryRepository) private readonly inventory: InventoryRepository,
    @Inject(SellerSetupRepository) private readonly sellerSetup: SellerSetupRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /**
   * R36: kapsam `warehouse` ise istenen depo kullanıcının deposu olmalı (değilse 403). Depo
   * verilmemişse kullanıcının deposu döner (deposu yoksa 403). Kapsam `all`: istenen depo.
   */
  private scopedWarehouse(
    tenant: TenantContext,
    permission: PermissionCode,
    warehouseId: string | undefined,
  ): string | undefined {
    if (tenant.permissions.get(permission) !== 'warehouse') return warehouseId;
    if (tenant.warehouseId === null) throw new DomainError('PERMISSION_DENIED');
    if (warehouseId !== undefined && warehouseId !== tenant.warehouseId) {
      throw new DomainError('PERMISSION_DENIED');
    }
    return tenant.warehouseId;
  }

  /** `POST /stock/movements` (US-039 AC1 mal girişi, AC7 sayım düzeltmesi). */
  async record(tenant: TenantContext, input: StockMovementInput): Promise<StockMovementResult> {
    this.scopedWarehouse(tenant, 'inventory.manage', input.warehouseId);
    const qty = fromDecimalString(input.qty);
    if (input.type === 'receipt' && compare(qty, ZERO) <= 0) {
      throw new DomainError('VALIDATION_FAILED', { qty: ['not_positive'] });
    }
    const now = this.clock.now();
    const sellerId = tenant.businessId;
    return await withTenantTx(tenant, async (tx) => {
      const warehouse = await this.sellerSetup.shareWarehouseTx(tx, sellerId, input.warehouseId);
      if (warehouse?.status !== 'active') {
        throw new DomainError('NOT_FOUND');
      }
      const variant = await this.inventory.lockVariantTx(tx, sellerId, input.variantId);
      if (variant === undefined) throw new DomainError('NOT_FOUND');
      if (variant.status === 'archived' || variant.productStatus === 'archived') {
        throw new DomainError('INVALID_STATE_TRANSITION');
      }

      let delta = qty;
      let firstCount = false;
      if (input.type === 'adjustment') {
        const counts = await this.repository.countsTx(
          tx,
          sellerId,
          input.warehouseId,
          input.variantId,
        );
        const onHand = fromDecimalString(counts?.onHand ?? '0');
        const reserved = fromDecimalString(counts?.reserved ?? '0');
        if (compare(qty, reserved) < 0) {
          throw new DomainError('STOCK_INSUFFICIENT', { reserved: counts?.reserved ?? '0' });
        }
        delta = subtract(qty, onHand);
        firstCount = counts === undefined;
      }

      let movement: StockMovementView | null = null;
      if (compare(delta, ZERO) !== 0 || firstCount) {
        movement = await this.repository.insertMovementTx(tx, {
          id: this.ids.next(),
          sellerId,
          warehouseId: input.warehouseId,
          variantId: input.variantId,
          type: input.type,
          onHandDelta: toDecimalString(delta, QTY_TEXT_SCALE),
          lotNo: input.lotNo ?? null,
          expiryDate: input.expiryDate ?? null,
          note: input.note ?? null,
          createdBy: tenant.userId,
          now,
        });
      }
      const stock = await this.repository.stockRowTx(
        tx,
        sellerId,
        input.warehouseId,
        input.variantId,
      );
      if (stock === undefined) throw new Error('stok satırı hareketten sonra bulunamadı');
      return { movement, stock };
    });
  }

  /** `GET /stock` (US-039): kapsamlı kullanıcı yalnız kendi deposu. */
  async list(tenant: TenantContext, query: StockListQuery): Promise<Page<StockRowView>> {
    const warehouseId = this.scopedWarehouse(tenant, 'inventory.view', query.warehouseId);
    const limit = query.limit ?? STOCK_LIST_LIMIT_DEFAULT;
    const after = query.cursor === undefined ? undefined : decodeStockCursor(query.cursor);
    const rows = await withTenantTx(tenant, async (tx) => {
      let lowDefault: string | undefined;
      if (query.low === true) {
        const profile = await this.sellerSetup.findSellerProfileTx(tx, tenant.businessId);
        lowDefault = profile?.lowStockDisplayThreshold ?? '5';
      }
      return await this.repository.listTx(tx, tenant.businessId, {
        warehouseId,
        variantId: query.variantId,
        lowDefault,
        after,
        limit: limit + 1,
      });
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor: rows.length > limit && last !== undefined ? encodeStockCursor(last) : null,
    };
  }

  /** `GET /stock/movements`: yeniden eskiye; kapsamlı kullanıcı yalnız kendi deposu. */
  async movements(
    tenant: TenantContext,
    query: Omit<StockListQuery, 'low'>,
  ): Promise<Page<StockMovementView>> {
    const warehouseId = this.scopedWarehouse(tenant, 'inventory.view', query.warehouseId);
    const limit = query.limit ?? STOCK_LIST_LIMIT_DEFAULT;
    const before = query.cursor === undefined ? undefined : decodeMovementCursor(query.cursor);
    const rows = await withTenantTx(tenant, (tx) =>
      this.repository.listMovementsTx(tx, tenant.businessId, {
        warehouseId,
        variantId: query.variantId,
        before,
        limit: limit + 1,
      }),
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor: rows.length > limit && last !== undefined ? encodeMovementCursor(last) : null,
    };
  }
}
