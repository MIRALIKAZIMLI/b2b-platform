import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { PriceListsController, PricesController } from './price-lists.controller';
import { PriceListsRepository } from './price-lists.repository';
import { PriceListsService } from './price-lists.service';

/**
 * Fiyat (c4 §2 `pricing`): F3.6a fiyat listeleri, liste fiyatları ve `PriceResolver` açıklaması.
 * Müşteri/şube fiyatı (F3.7/F3.8) ve kademe (F3.9) aynı modüle eklenir. Bağlantıya liste atama
 * doğrulaması `PriceListAssignmentPortModule` ile connections'a sağlanır.
 */
@Module({
  imports: [AuditModule],
  controllers: [PriceListsController, PricesController],
  providers: [PriceListsRepository, PriceListsService],
})
export class PricingModule {}
