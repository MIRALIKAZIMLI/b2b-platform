import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

/**
 * Stok (c4 §2 `inventory`): F3.10 stok modu okuma ve var/yok işareti. Miktarlı stok, hareketler
 * (F3.11a) ve rezervasyon (F4.4) aynı modüle eklenir.
 */
@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [InventoryRepository, InventoryService],
})
export class InventoryModule {}
