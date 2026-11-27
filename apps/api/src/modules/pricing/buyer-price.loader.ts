// Bir perakendeci için `PriceResolver` girdilerini veritabanından yükler (F3.7a K7; ADR-0019). Hesap
// yalnız saf çekirdekte (`resolvePrice`); bu sınıf yalnız okur. Kaynaklar: müşteri fiyatı (F3.7a),
// bağlantıya atanmış aktif liste, varsayılan liste. Şube fiyatı/indirimi (F3.8) ve kademe (F3.9)
// eklendikçe buraya bağlanır; F3.12a perakendeci ürün listesi de bu yükleyiciyi kullanır.
import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { type CustomerPriceRow, CustomerPricesRepository } from './customer-prices.repository';
import { type PriceListSource, type ResolvedPrice, resolvePrice } from './price-resolver';
import { type PriceListRow, PriceListsRepository, type PriceRow } from './price-lists.repository';

export interface BuyerPrice {
  /** Satış birimi başına, miktar 1 (kademe yok). */
  readonly resolved: ResolvedPrice;
  /** Şu an geçerli müşteri fiyatı; yoksa undefined. */
  readonly customerPrice: CustomerPriceRow | undefined;
}

export interface BuyerPriceQuery {
  readonly sellerId: string;
  readonly buyerId: string;
  /** Bağlantıya atanmış liste (`connections.price_list_id`). */
  readonly priceListId: string | null;
  readonly packagingIds: readonly string[];
  readonly now: Date;
}

@Injectable()
export class BuyerPriceLoader {
  constructor(
    @Inject(PriceListsRepository) private readonly lists: PriceListsRepository,
    @Inject(CustomerPricesRepository) private readonly customers: CustomerPricesRepository,
  ) {}

  /** Ambalaj başına çözülmüş fiyat. Satıcının para birimi yoksa 404 (F3.6a ile aynı). */
  async loadTx(tx: Tx, query: BuyerPriceQuery): Promise<Map<string, BuyerPrice>> {
    const { sellerId, buyerId, packagingIds, now } = query;
    const result = new Map<string, BuyerPrice>();
    if (packagingIds.length === 0) return result;
    const seller = await this.lists.sellerContextTx(tx, sellerId);
    if (seller === undefined) throw new DomainError('NOT_FOUND');

    const assigned =
      query.priceListId === null
        ? undefined
        : await this.lists.findTx(tx, sellerId, query.priceListId);
    const assignedList = assigned?.status === 'active' ? assigned : undefined;
    const defaultList = await this.lists.defaultTx(tx, sellerId);
    const listIds = [
      ...new Set(
        [assignedList, defaultList].flatMap((list) => (list === undefined ? [] : [list.id])),
      ),
    ];
    const listRows = await this.lists.pricesTx(tx, listIds, packagingIds, now);
    const byListPackaging = new Map<string, PriceRow[]>();
    for (const row of listRows) {
      const key = `${row.priceListId}:${row.packagingId}`;
      const bucket = byListPackaging.get(key) ?? [];
      bucket.push(row);
      byListPackaging.set(key, bucket);
    }
    const customer = await this.customers.effectiveTx(tx, sellerId, buyerId, packagingIds, now);

    const source = (list: PriceListRow | undefined, packagingId: string): PriceListSource | null =>
      list === undefined
        ? null
        : {
            listId: list.id,
            name: list.name,
            currency: list.currencyCode,
            vatIncluded: list.vatIncluded,
            vatRate: list.vatRate,
            prices: (byListPackaging.get(`${list.id}:${packagingId}`) ?? []).map((row) => ({
              unitPrice: row.unitPrice,
              validFrom: row.validFrom,
            })),
          };

    for (const packagingId of new Set(packagingIds)) {
      const customerPrice = customer.get(packagingId);
      const resolved = resolvePrice({
        now,
        currency: seller.currencyCode,
        qty: '1',
        branchPricingEnabled: false,
        branchPrices: [],
        customerPrices:
          customerPrice === undefined
            ? []
            : [{ unitPrice: customerPrice.unitPrice, validFrom: customerPrice.validFrom }],
        // Varsayılan liste bağlantıya açıkça atanmışsa kaynak `price_list` (ADR-0019 sırası).
        assignedList: source(assignedList, packagingId),
        defaultList: source(defaultList, packagingId),
        tiers: [],
        branchDiscountPercent: null,
      });
      result.set(packagingId, { resolved, customerPrice });
    }
    return result;
  }
}
