import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { OutboxModule } from '../../core/outbox';
import { FilesModule } from '../files';
import { SettingsModule } from '../settings';
import { ActivityTypesAdminService } from './activity-types.service';
import { BrandsRepository } from './brands.repository';
import { BrandsService } from './brands.service';
import { CategoriesRepository } from './categories.repository';
import { CatalogProcessor } from './catalog.processor';
import { CategoriesService } from './categories.service';
import { BullCatalogJobs, CatalogJobs } from './jobs/catalog-jobs';
import { ResizeImageJob } from './jobs/resize-image.job';
import { ProductImportLookup } from './product-import-lookup';
import { ProductImagesController } from './product-images.controller';
import { ProductImagesRepository } from './product-images.repository';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { TaxonomyController } from './taxonomy.controller';
import { UnitsController } from './units.controller';
import { UnitsRepository } from './units.repository';
import { UnitsService } from './units.service';

/**
 * Katalog (c4 §2 `catalog`): F3.1 birim kataloğu; F3.2a kategori, marka, faaliyet alanı yönetimi ve
 * toptancının marka talebi. F3.3a toptancının ürün, varyant ve ambalaj uçları; F3.4a ürün görselleri. Admin yazma uçları platform-admin modülünde (`withPlatformTx` yalnız
 * orada açılır); kurallar ve audit burada.
 */
@Module({
  imports: [AuditModule, OutboxModule, FilesModule, SettingsModule],
  controllers: [UnitsController, TaxonomyController, ProductsController, ProductImagesController],
  providers: [
    UnitsRepository,
    UnitsService,
    CategoriesRepository,
    CategoriesService,
    BrandsRepository,
    BrandsService,
    ActivityTypesAdminService,
    ProductsRepository,
    ProductsService,
    ProductImagesRepository,
    ProductImagesService,
  ],
  exports: [UnitsService, CategoriesService, BrandsService, ActivityTypesAdminService],
})
export class CatalogModule {}

/**
 * Excel içe aktarma için katalog okuma kapısı (F3.5a): API (`imports` modülü) ve worker aynı
 * sağlayıcıyı kullanır. Bağımlılığı yok; işlem çağırandan gelir.
 */
@Module({
  providers: [ProductImportLookup],
  exports: [ProductImportLookup],
})
export class CatalogImportModule {}

/**
 * Worker (F3.4a): `catalog` kuyruğu tüketicisi (ürün görseli küçültme). Depo global
 * StorageModule'den, kuyruklar global QueueModule'den (outbox dağıtıcısı) gelir.
 */
@Module({
  imports: [SettingsModule],
  providers: [
    ProductImagesRepository,
    ResizeImageJob,
    CatalogProcessor,
    { provide: CatalogJobs, useClass: BullCatalogJobs },
  ],
})
export class CatalogWorkerModule {}
