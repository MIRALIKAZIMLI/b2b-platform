import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { BuyerPriceLoader } from './buyer-price.loader';
import { CustomerPricesRepository } from './customer-prices.repository';
import { CustomerPricesService } from './customer-prices.service';
import {
  CustomerPricesController,
  PriceListsController,
  PricesController,
} from './price-lists.controller';
import { PriceListsRepository } from './price-lists.repository';
import { PriceListsService } from './price-lists.service';

/**
 * Fiyat (c4 §2 `pricing`): F3.6a fiyat listeleri, liste fiyatları ve `PriceResolver` açıklaması;
 * F3.7a müşteri fiyatı. Şube fiyatı (F3.8) ve kademe (F3.9) aynı modüle eklenir. Bağlantıya liste atama
 * doğrulaması `PriceListAssignmentPortModule` ile connections'a sağlanır.
 */
@Module({
  imports: [AuditModule],
  controllers: [PriceListsController, PricesController, CustomerPricesController],
  providers: [
    PriceListsRepository,
    PriceListsService,
    CustomerPricesRepository,
    CustomerPricesService,
    BuyerPriceLoader,
  ],
})
export class PricingModule {}
