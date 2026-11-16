import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { UnitsController } from './units.controller';
import { UnitsRepository } from './units.repository';
import { UnitsService } from './units.service';

/**
 * Katalog (c4 §2 `catalog`): F3.1 birim kataloğu. Admin yazma uçları platform-admin modülünde
 * (`withPlatformTx` yalnız orada açılır); kurallar ve audit burada.
 */
@Module({
  imports: [AuditModule],
  controllers: [UnitsController],
  providers: [UnitsRepository, UnitsService],
  exports: [UnitsService],
})
export class CatalogModule {}
