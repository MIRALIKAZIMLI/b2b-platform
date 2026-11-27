import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { SettingsModule } from '../settings';
import { BuyerPriceLoader } from './buyer-price.loader';
import { CustomerPricesRepository } from './customer-prices.repository';
import { CustomerPricesService } from './customer-prices.service';
import {
  CustomerPricesController,
  PriceListsController,
  PricesController,
  TierPricesController,
} from './price-lists.controller';
import { PriceListsRepository } from './price-lists.repository';
import { PriceListsService } from './price-lists.service';
import { TierPricesRepository } from './tier-prices.repository';
import { TierPricesService } from './tier-prices.service';

/**
 * Fiyat (c4 §2 `pricing`): F3.6a fiyat listeleri, liste fiyatları ve `PriceResolver` açıklaması;
 * F3.7a müşteri fiyatı; F3.9 kademeli indirim. Şube fiyatı (F3.8) aynı modüle eklenir. Bağlantıya liste atama
 * doğrulaması `PriceListAssignmentPortModule` ile connections'a sağlanır.
 */
@Module({
  imports: [AuditModule, SettingsModule],
  controllers: [
    PriceListsController,
    PricesController,
    CustomerPricesController,
    TierPricesController,
  ],
  providers: [
    PriceListsRepository,
    PriceListsService,
    CustomerPricesRepository,
    CustomerPricesService,
    BuyerPriceLoader,
    TierPricesRepository,
    TierPricesService,
  ],
})
export class PricingModule {}
