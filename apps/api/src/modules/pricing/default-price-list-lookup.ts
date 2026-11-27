// Excel içe aktarma için fiyat kapıları (c4 §2 imports → pricing). F3.5a: önizlemede fiyat sütunu
// varsayılan listeye yazılabilir mi (kart K9). F3.5c: uygulamada `unit` ambalajının fiyatı
// varsayılan listeye hemen geçerli yazılır (K4, Mimar S2–S3). F3.7a: müşteri fiyatı türü
// (`CustomerPriceImport`; bağlantı, bugünkü fiyat, yazım).
import { Inject, Injectable, Module } from '@nestjs/common';
import type { Tx } from '../../core/db';
import { fromDecimalString, toDecimalString, UNIT_PRICE_SCALE } from '../../core/money';
import { BuyerPriceLoader } from './buyer-price.loader';
import { CustomerPricesRepository } from './customer-prices.repository';
import { PriceListsRepository } from './price-lists.repository';
import { TierPricesRepository } from './tier-prices.repository';

@Injectable()
export class DefaultPriceListLookup {
  constructor(@Inject(PriceListsRepository) private readonly repository: PriceListsRepository) {}

  /** Satıcının varsayılan (aktif) fiyat listesinin kimliği; yoksa `null`. */
  async defaultListIdTx(tx: Tx, sellerId: string): Promise<string | null> {
    const list = await this.repository.defaultTx(tx, sellerId);
    return list?.status === 'active' ? list.id : null;
  }
}

/** Doğrulayıcıdan gelen noktalı metin; ondalıktaki sondaki sıfırlar atılır (Decimal şeması ≤ 4 hane). */
function decimalText(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

@Injectable()
export class ImportPriceWriter {
  constructor(@Inject(PriceListsRepository) private readonly repository: PriceListsRepository) {}

  /**
   * `unit` ambalajının fiyatını listeye `validFrom = now` ile yazar. Şu an geçerli fiyatla aynıysa
   * yazmaz (gereksiz geçmiş satırı yok). Aynı an için satır zaten varsa geçerli olmuş fiyat
   * değişmez (`upsertItemsTx` `>`): 0 satır yazılır ve `'conflict'` döner (Müfettiş 29 D2). Liste ve ambalajın bu satıcıya ait olduğu bileşik FK ve
   * RLS ile güvencede; liste kimliği çağıranın aynı işlemde okuduğu varsayılan listedir.
   */
  async setUnitPriceTx(
    tx: Tx,
    input: {
      readonly sellerId: string;
      readonly listId: string;
      readonly packagingId: string;
      readonly unitPrice: string;
      readonly userId: string;
      readonly now: Date;
    },
  ): Promise<'written' | 'unchanged' | 'conflict'> {
    const price = fromDecimalString(decimalText(input.unitPrice));
    const rows = await this.repository.pricesTx(tx, [input.listId], [input.packagingId], input.now);
    const current = rows.filter((row) => row.validFrom.getTime() <= input.now.getTime()).at(-1);
    if (current !== undefined && fromDecimalString(current.unitPrice).eq(price)) return 'unchanged';
    const written = await this.repository.upsertItemsTx(
      tx,
      [
        {
          priceListId: input.listId,
          sellerId: input.sellerId,
          packagingId: input.packagingId,
          unitPrice: toDecimalString(price, UNIT_PRICE_SCALE),
          validFrom: input.now,
          createdAt: input.now,
          createdBy: input.userId,
        },
      ],
      input.now,
    );
    return written === 1 ? 'written' : 'conflict';
  }
}

/** Bir ambalajın bu perakendecideki bugünkü fiyatı (fark raporu ve şablon için). */
export interface ImportCurrentPrice {
  /** Şu an geçerli müşteri fiyatı; yoksa null. */
  readonly customerPrice: string | null;
  /** Perakendecinin bugün ödediği birim fiyat (ADR-0019 sırası); hiçbir kaynakta yoksa null. */
  readonly effectivePrice: string | null;
}

/** Müşteri fiyatı yazımının sonucu; `previous`/`unitPrice` audit için (Müfettiş 30 not 2). */
export interface CustomerPriceWrite {
  readonly outcome: 'written' | 'unchanged' | 'conflict';
  /** Yazımdan önce geçerli müşteri fiyatı; yoksa null. */
  readonly previous: string | null;
  /** Yazılan (ölçeklenmiş) fiyat. */
  readonly unitPrice: string;
}

@Injectable()
export class CustomerPriceImport {
  constructor(
    @Inject(CustomerPricesRepository) private readonly repository: CustomerPricesRepository,
    @Inject(BuyerPriceLoader) private readonly loader: BuyerPriceLoader,
  ) {}

  /**
   * Alıcıyla aktif bağlantı (R30); yoksa null. `share`: uygulama partisi bağlantı satırını kilitler,
   * iptal parti bitene kadar bekler.
   */
  async connectionTx(
    tx: Tx,
    sellerId: string,
    buyerId: string,
    lock?: 'share',
  ): Promise<{ readonly priceListId: string | null } | null> {
    const connection = await this.repository.activeConnectionTx(tx, sellerId, buyerId, lock);
    return connection === undefined ? null : { priceListId: connection.priceListId };
  }

  async currentTx(
    tx: Tx,
    input: {
      readonly sellerId: string;
      readonly buyerId: string;
      readonly priceListId: string | null;
      readonly packagingIds: readonly string[];
      readonly now: Date;
    },
  ): Promise<Map<string, ImportCurrentPrice>> {
    const loaded = await this.loader.loadTx(tx, input);
    const result = new Map<string, ImportCurrentPrice>();
    for (const [packagingId, price] of loaded) {
      result.set(packagingId, {
        customerPrice: price.customerPrice?.unitPrice ?? null,
        effectivePrice: price.resolved.source === 'none' ? null : price.resolved.finalUnitPrice,
      });
    }
    return result;
  }

  /**
   * Müşteri fiyatını `validFrom = now` ile yazar. Şu an geçerli müşteri fiyatıyla aynıysa yazmaz.
   * Aynı an için satır zaten varsa geçerli olmuş fiyat değişmez: 0 satır, `conflict` (F3.5c D2
   * ile aynı). Ambalajın bu satıcıya ait olduğu bileşik FK ve RLS ile güvencede; aktif bağlantıyı
   * çağıran aynı işlemde `connectionTx(..., 'share')` ile denetler.
   */
  async setTx(
    tx: Tx,
    input: {
      readonly sellerId: string;
      readonly buyerId: string;
      readonly packagingId: string;
      readonly unitPrice: string;
      readonly userId: string;
      readonly now: Date;
    },
  ): Promise<CustomerPriceWrite> {
    const price = fromDecimalString(decimalText(input.unitPrice));
    const current = await this.repository.effectiveTx(
      tx,
      input.sellerId,
      input.buyerId,
      [input.packagingId],
      input.now,
    );
    const existing = current.get(input.packagingId);
    const previous = existing?.unitPrice ?? null;
    const unitPrice = toDecimalString(price, UNIT_PRICE_SCALE);
    if (existing !== undefined && fromDecimalString(existing.unitPrice).eq(price)) {
      return { outcome: 'unchanged', previous, unitPrice };
    }
    const written = await this.repository.upsertTx(
      tx,
      [
        {
          sellerId: input.sellerId,
          buyerId: input.buyerId,
          packagingId: input.packagingId,
          unitPrice,
          validFrom: input.now,
          createdAt: input.now,
          createdBy: input.userId,
        },
      ],
      input.now,
    );
    return { outcome: written === 1 ? 'written' : 'conflict', previous, unitPrice };
  }
}

@Module({
  providers: [
    PriceListsRepository,
    CustomerPricesRepository,
    TierPricesRepository,
    BuyerPriceLoader,
    DefaultPriceListLookup,
    ImportPriceWriter,
    CustomerPriceImport,
  ],
  exports: [DefaultPriceListLookup, ImportPriceWriter, CustomerPriceImport],
})
export class PricingImportModule {}
