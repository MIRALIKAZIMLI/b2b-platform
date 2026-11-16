import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { OutboxModule } from '../../core/outbox';
import { AccessModule, WEB_BASE_URL } from '../access';
import { BillingModule } from '../billing';
import { BusinessesModule } from '../businesses';
import { CatalogModule } from '../catalog';
import { ConnectionsModule } from '../connections';
import { I18nModule } from '../i18n';
import { SettingsModule } from '../settings';
import { BuyerArchiveService } from './buyer-archive.service';
import { BuyersAdminController } from './buyers-admin.controller';
import { BuyersAdminService } from './buyers-admin.service';
import { RoleCatalogController } from './role-catalog.controller';
import { RoleCatalogAdminService } from './role-catalog.service';
import { SellerApplicationsAdminController } from './seller-applications.controller';
import { SellerApplicationsAdminService } from './seller-applications.service';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';
import { SettingsAdminController } from './settings-admin.controller';
import { SettingsAdminService } from './settings-admin.service';
import { UnitsAdminController } from './units-admin.controller';
import { UnitsAdminService } from './units-admin.service';

export interface PlatformAdminOptions {
  /** SMS'teki aktivasyon bağlantısının web adresi (`WEB_BASE_URL`). */
  readonly webBaseUrl: string;
}

/**
 * Platform admin uçları (F2.1a: toptancı açma, aktivasyon daveti, plan listesi; F2.2: başvurular; F2.9: unvan ve rol
 * şablonu kataloğu; F2.18: perakendeci moderasyonu, askıya alma, "sil"; F2.19: ayarlar; F3.1: birim kataloğu). Platform bağlamı
 * (`withPlatformTx`) yalnızca bu modülde açılır (c4 §3.7); uçlar `@RequirePlatformRole`.
 */
@Module({})
export class PlatformAdminModule {
  static register(options: PlatformAdminOptions): DynamicModule {
    return {
      module: PlatformAdminModule,
      imports: [
        AuditModule,
        AccessModule,
        BillingModule,
        BusinessesModule,
        CatalogModule,
        ConnectionsModule,
        OutboxModule,
        I18nModule,
        SettingsModule,
      ],
      controllers: [
        SellersController,
        SellerApplicationsAdminController,
        RoleCatalogController,
        UnitsAdminController,
        BuyersAdminController,
        SettingsAdminController,
      ],
      providers: [
        SellersService,
        SellerApplicationsAdminService,
        RoleCatalogAdminService,
        UnitsAdminService,
        BuyersAdminService,
        BuyerArchiveService,
        SettingsAdminService,
        { provide: WEB_BASE_URL, useValue: options.webBaseUrl },
      ],
    };
  }
}
