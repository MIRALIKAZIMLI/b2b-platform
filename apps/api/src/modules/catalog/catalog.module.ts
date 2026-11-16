import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { SettingsModule } from '../settings';
import { ActivityTypesAdminService } from './activity-types.service';
import { BrandsRepository } from './brands.repository';
import { BrandsService } from './brands.service';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { TaxonomyController } from './taxonomy.controller';
import { UnitsController } from './units.controller';
import { UnitsRepository } from './units.repository';
import { UnitsService } from './units.service';

/**
 * Katalog (c4 §2 `catalog`): F3.1 birim kataloğu; F3.2a kategori, marka, faaliyet alanı yönetimi ve
 * toptancının marka talebi. Admin yazma uçları platform-admin modülünde (`withPlatformTx` yalnız
 * orada açılır); kurallar ve audit burada.
 */
@Module({
  imports: [AuditModule, SettingsModule],
  controllers: [UnitsController, TaxonomyController],
  providers: [
    UnitsRepository,
    UnitsService,
    CategoriesRepository,
    CategoriesService,
    BrandsRepository,
    BrandsService,
    ActivityTypesAdminService,
  ],
  exports: [UnitsService, CategoriesService, BrandsService, ActivityTypesAdminService],
})
export class CatalogModule {}
