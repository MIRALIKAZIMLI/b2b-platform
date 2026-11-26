// `connections` fiyat listesi atama portunun uygulaması (F3.6a). Bağımlılık yönü pricing → connections.
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { Tx } from '../../core/db';
import { PRICE_LIST_ASSIGNMENT_PORT, type PriceListAssignmentPort } from '../connections';
import { PriceListsRepository } from './price-lists.repository';

@Injectable()
export class PriceListAssignmentAdapter implements PriceListAssignmentPort {
  constructor(@Inject(PriceListsRepository) private readonly repository: PriceListsRepository) {}

  async lockAssignableTx(tx: Tx, sellerId: string, priceListId: string): Promise<boolean> {
    const list = await this.repository.findTx(tx, sellerId, priceListId, 'share');
    return list?.status === 'active';
  }
}

/** Portu tüm uygulamaya sağlar; `ConnectionsModule` pricing modülünü içe aktarmaz (döngü yok). */
@Global()
@Module({
  providers: [
    PriceListsRepository,
    PriceListAssignmentAdapter,
    { provide: PRICE_LIST_ASSIGNMENT_PORT, useExisting: PriceListAssignmentAdapter },
  ],
  exports: [PRICE_LIST_ASSIGNMENT_PORT],
})
export class PriceListAssignmentPortModule {}
