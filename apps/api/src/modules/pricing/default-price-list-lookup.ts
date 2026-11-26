// Excel içe aktarma için fiyat okuma kapısı (F3.5a; c4 §2 imports → pricing). Önizlemede fiyat
// sütunu varsayılan listeye yazılabilir mi (kart K9) diye bakar; yazım F3.5c'de bu modülde.
import { Inject, Injectable, Module } from '@nestjs/common';
import type { Tx } from '../../core/db';
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

@Module({
  providers: [PriceListsRepository, DefaultPriceListLookup],
  exports: [DefaultPriceListLookup],
})
export class PricingImportModule {}
