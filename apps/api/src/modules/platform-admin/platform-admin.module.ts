import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { AccessModule, WEB_BASE_URL } from '../access';
import { BillingModule } from '../billing';
import { BusinessesModule } from '../businesses';
import { I18nModule } from '../i18n';
import { SettingsModule } from '../settings';
import { RoleCatalogController } from './role-catalog.controller';
import { RoleCatalogAdminService } from './role-catalog.service';
import { SellerApplicationsAdminController } from './seller-applications.controller';
import { SellerApplicationsAdminService } from './seller-applications.service';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

export interface PlatformAdminOptions {
  /** SMS'teki aktivasyon bağlantısının web adresi (`WEB_BASE_URL`). */
  readonly webBaseUrl: string;
}

/**
 * Platform admin uçları (F2.1a: toptancı açma, aktivasyon daveti, plan listesi; F2.2: başvurular; F2.9: unvan ve rol
 * şablonu kataloğu). Platform bağlamı
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
        I18nModule,
        SettingsModule,
      ],
      controllers: [SellersController, SellerApplicationsAdminController, RoleCatalogController],
      providers: [
        SellersService,
        SellerApplicationsAdminService,
        RoleCatalogAdminService,
        { provide: WEB_BASE_URL, useValue: options.webBaseUrl },
      ],
    };
  }
}
