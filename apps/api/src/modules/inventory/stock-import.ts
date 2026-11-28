// Excel stok sayımı kapısı (F3.11c; c4 §1 `imports → inventory`, kart K1–K12). `imports` modülü
// stok tablolarına doğrudan dokunmaz: depo, şablon satırları, bugünkü sayılar ve sayım yazımı bu
// sınıftan geçer. Yazım elle sayımla aynı `StockService.countTx` (R35: yalnız `adjustment` hareketi).
import { Module, Inject, Injectable } from '@nestjs/common';
import type { StockMode } from '@b2b/shared';
import type { Tx } from '../../core/db';
import { SellerSetupRepository } from '../businesses';
import { InventoryRepository } from './inventory.repository';
import { type StockCounts, StockRepository } from './stock.repository';
import { type StockCountInput, type StockCountOutcome, StockService } from './stock.service';

/** Şablonun bir satırı: depodaki satılabilir varyant ve bugünkü `on_hand` (sayılmamışsa null). */
export interface StockTemplateRow {
  readonly variantId: string;
  readonly sku: string;
  readonly productName: Record<string, string>;
  readonly attributes: Record<string, unknown>;
  readonly baseUnitCode: string;
  readonly onHand: string | null;
}

/** V3: ürün şablonunun stok sütunu için satıcının modu, aktif varsayılan deposu ve oradaki sayılar. */
export interface ProductStockContext {
  readonly mode: StockMode;
  readonly defaultWarehouseId: string | null;
  readonly counts: ReadonlyMap<string, StockCounts>;
}

@Injectable()
export class StockImport {
  constructor(
    @Inject(StockService) private readonly stock: Pick<StockService, 'countTx'>,
    @Inject(StockRepository) private readonly repository: StockRepository,
    @Inject(SellerSetupRepository) private readonly sellerSetup: SellerSetupRepository,
    @Inject(InventoryRepository) private readonly inventory: InventoryRepository,
  ) {}

  /**
   * V3: satıcının aktif varsayılan deposu; yoksa null. `share`: uygulama partisi depoyu kilitler
   * (pasifleştirme parti bitene kadar bekler).
   */
  async defaultWarehouseIdTx(tx: Tx, sellerId: string, lock?: 'share'): Promise<string | null> {
    const rows = await this.sellerSetup.listWarehousesTx(tx, sellerId);
    const found = rows.find((row) => row.isDefault && row.status === 'active');
    if (found === undefined) return null;
    if (lock === 'share') {
      return (await this.activeWarehouseTx(tx, sellerId, found.id, 'share')) ? found.id : null;
    }
    return found.id;
  }

  /** V3 önizleme ve uygulama: mod, varsayılan depo ve oradaki bugünkü sayılar (kilitsiz). */
  async productStockContextTx(
    tx: Tx,
    sellerId: string,
    variantIds: readonly string[],
  ): Promise<ProductStockContext> {
    const mode = await this.inventory.stockModeTx(tx, sellerId);
    const defaultWarehouseId = await this.defaultWarehouseIdTx(tx, sellerId);
    const counts =
      mode === 'quantity' && defaultWarehouseId !== null
        ? await this.countsTx(tx, sellerId, defaultWarehouseId, variantIds)
        : new Map<string, StockCounts>();
    return { mode, defaultWarehouseId, counts };
  }

  /**
   * V3 `availability` modu: var/yok işareti (F3.10 ile aynı kolon; varyant `FOR NO KEY UPDATE`).
   * İş başına `import.applied` audit'i yeter (F3.11c K10).
   */
  async setAvailabilityTx(
    tx: Tx,
    input: {
      readonly sellerId: string;
      readonly variantId: string;
      readonly isAvailable: boolean;
      readonly now: Date;
    },
  ): Promise<boolean> {
    const variant = await this.inventory.lockVariantTx(tx, input.sellerId, input.variantId);
    if (variant === undefined) return false;
    if (variant.isAvailable !== input.isAvailable) {
      await this.inventory.setAvailableTx(
        tx,
        input.sellerId,
        input.variantId,
        input.isAvailable,
        input.now,
      );
    }
    return true;
  }

  /**
   * Satıcının deposu aktif mi (K1). `share`: uygulama partisi depoyu `FOR SHARE` kilitler; aynı
   * anda gelen pasifleştirme parti bitene kadar bekler (elle hareketle aynı kilit sırası).
   */
  async activeWarehouseTx(
    tx: Tx,
    sellerId: string,
    warehouseId: string,
    lock?: 'share',
  ): Promise<boolean> {
    const warehouse =
      lock === 'share'
        ? await this.sellerSetup.shareWarehouseTx(tx, sellerId, warehouseId)
        : await this.sellerSetup.findWarehouseTx(tx, sellerId, warehouseId);
    return warehouse?.status === 'active';
  }

  /** K3: depodaki bütün satılabilir varyantlar (stok ekranı listesiyle aynı), SKU sırasıyla. */
  async templateRowsTx(
    tx: Tx,
    sellerId: string,
    warehouseId: string,
    limit: number,
  ): Promise<StockTemplateRow[]> {
    const rows = await this.repository.listItemsTx(tx, sellerId, {
      warehouseId,
      filter: 'all',
      lowThresholdUnits: '0',
      limit,
    });
    return rows.map((row) => ({
      variantId: row.variantId,
      sku: row.sku,
      productName: row.productName,
      attributes: row.attributes,
      baseUnitCode: row.baseUnitCode,
      onHand: row.onHand,
    }));
  }

  /** Önizleme: bugünkü sayılar (kilitsiz; uygulama `countTx` ile taze sayıdan yeniden hesaplar). */
  async countsTx(
    tx: Tx,
    sellerId: string,
    warehouseId: string,
    variantIds: readonly string[],
  ): Promise<Map<string, StockCounts>> {
    return await this.repository.countsForVariantsTx(tx, sellerId, warehouseId, variantIds);
  }

  /** Bir satırın sayımı (çağıran depoyu `activeWarehouseTx(..., 'share')` ile kilitlemiş olmalı). */
  async countTx(tx: Tx, input: StockCountInput): Promise<StockCountOutcome> {
    return await this.stock.countTx(tx, input);
  }
}

/** API ve worker için hafif modül (denetleyici yok; `PricingImportModule` deseni). */
@Module({
  providers: [
    InventoryRepository,
    StockRepository,
    StockService,
    SellerSetupRepository,
    StockImport,
  ],
  exports: [StockImport],
})
export class InventoryImportModule {}
