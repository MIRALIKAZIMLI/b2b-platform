import { Module } from '@nestjs/common';
import { OutboxModule } from '../../core/outbox';
import { OpsMetricsModule } from '../../core/ops-metrics';
import { AuditModule } from '../../core/audit';
import { CatalogImportModule, CatalogImportWriterModule } from '../catalog';
import { FilesModule, FilesWorkerModule } from '../files';
import { I18nModule } from '../i18n';
import { PricingImportModule } from '../pricing';
import { SettingsModule } from '../settings';
import { ImportsController } from './imports.controller';
import { ImportsProcessor } from './imports.processor';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';
import { ApplyImportJob } from './jobs/apply-import.job';
import { ExpireImportsJob, ExpireImportsSchedule } from './jobs/expire-imports.job';
import { ValidateImportJob } from './jobs/validate-import.job';

/**
 * Excel içe aktarma (c4 §2 `imports`; F3.5a): şablon, iş açma, durum/önizleme. Bağımlılık yönü
 * imports → catalog, pricing, files (c4 §1); uygulama (F3.5c) aynı yönde yazma kapılarını kullanır.
 */
@Module({
  imports: [OutboxModule, SettingsModule, FilesModule, I18nModule, CatalogImportModule],
  controllers: [ImportsController],
  providers: [ImportsRepository, ImportsService],
})
export class ImportsModule {}

/**
 * Worker (F3.5a): `imports` kuyruğu tüketicisi (doğrulama; F3.5c uygulama) ve süre dolumu /
 * zaman aşımı zamanlayıcısı.
 * Depo global StorageModule'den, kuyruklar global QueueModule'den gelir.
 */
@Module({
  imports: [
    SettingsModule,
    OpsMetricsModule,
    FilesWorkerModule,
    I18nModule,
    CatalogImportModule,
    CatalogImportWriterModule,
    PricingImportModule,
    AuditModule,
  ],
  providers: [
    ImportsRepository,
    ValidateImportJob,
    ApplyImportJob,
    ExpireImportsJob,
    ExpireImportsSchedule,
    ImportsProcessor,
  ],
})
export class ImportsWorkerModule {}
