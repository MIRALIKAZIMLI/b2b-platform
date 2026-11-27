// Excel içe aktarma için fiyat kapıları (c4 §2 imports → pricing). F3.5a: önizlemede fiyat sütunu
// varsayılan listeye yazılabilir mi (kart K9). F3.5c: uygulamada `unit` ambalajının fiyatı
// varsayılan listeye hemen geçerli yazılır (K4, Mimar S2–S3).
import { Inject, Injectable, Module } from '@nestjs/common';
import type { Tx } from '../../core/db';
import { fromDecimalString, toDecimalString, UNIT_PRICE_SCALE } from '../../core/money';
import { PriceListsRepository } from './price-lists.repository';

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
   * yazmaz (gereksiz geçmiş satırı yok). Liste ve ambalajın bu satıcıya ait olduğu bileşik FK ve
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
  ): Promise<'written' | 'unchanged'> {
    const price = fromDecimalString(decimalText(input.unitPrice));
    const rows = await this.repository.pricesTx(tx, [input.listId], [input.packagingId], input.now);
    const current = rows.filter((row) => row.validFrom.getTime() <= input.now.getTime()).at(-1);
    if (current !== undefined && fromDecimalString(current.unitPrice).eq(price)) return 'unchanged';
    await this.repository.upsertItemsTx(
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
    return 'written';
  }
}

@Module({
  providers: [PriceListsRepository, DefaultPriceListLookup, ImportPriceWriter],
  exports: [DefaultPriceListLookup, ImportPriceWriter],
})
export class PricingImportModule {}
