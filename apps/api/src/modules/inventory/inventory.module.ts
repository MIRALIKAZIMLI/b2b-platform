import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { BusinessesModule } from '../businesses';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { StockController } from './stock.controller';
import { StockRepository } from './stock.repository';
import { StockService } from './stock.service';

/**
 * Stok (c4 §2 `inventory`): F3.10 stok modu okuma ve var/yok işareti; F3.11a miktarlı stok,
 * hareketler (`StockService`) ve miktarlı moda geçiş. Rezervasyon (F4.4) aynı modüle eklenir.
 * Depo ve satıcı profili `businesses` modülünün dışa açık deposundan (c4 §1 `inventory → businesses`).
 */
@Module({
  imports: [AuditModule, BusinessesModule],
  controllers: [InventoryController, StockController],
  providers: [InventoryRepository, InventoryService, StockRepository, StockService],
  exports: [StockService],
})
export class InventoryModule {}
