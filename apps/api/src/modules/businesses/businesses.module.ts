import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { OutboxModule } from '../../core/outbox';
import { SettingsModule } from '../settings';
import { BranchesController } from './branches.controller';
import { BranchesRepository } from './branches.repository';
import { BranchesService } from './branches.service';
import { BusinessPrivacyController } from './business-privacy.controller';
import { BusinessPrivacyService } from './business-privacy.service';
import { BusinessProfileService } from './business-profile.service';
import { ActivityTypesController } from './activity-types.controller';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessesRepository } from './businesses.repository';
import { IpHourlyRateLimiter } from './ip-hourly-rate-limiter';
import { SellerApplicationsController } from './seller-applications.controller';
import { SellerApplicationsRepository } from './seller-applications.repository';
import { SellerApplicationsService } from './seller-applications.service';
import { SellerProfileController, WarehousesController } from './seller-setup.controller';
import { SellerSetupRepository } from './seller-setup.repository';
import { SellerSetupService } from './seller-setup.service';

/**
 * İşletme çekirdek tabloları (F1.7), kimliksiz toptancı başvurusu (F2.2) ve işletme profili
 * okuma ucu (F2.3b), profil düzenleme (F2.4), görünürlük ayarları (F2.10), depolar / satıcı profili / hizmet bölgeleri (F2.6), şubeler (F2.5).
 * IpKeyService global IdentityModule'den, Redis istemcisi global RedisModule'den,
 * WarehouseLimitGate global WarehouseLimitGateModule'den (billing) gelir.
 */
@Module({
  imports: [AuditModule, OutboxModule, SettingsModule],
  controllers: [
    SellerApplicationsController,
    ActivityTypesController,
    BusinessProfileController,
    BusinessPrivacyController,
    WarehousesController,
    SellerProfileController,
    BranchesController,
  ],
  providers: [
    BusinessesRepository,
    BusinessProfileService,
    BusinessPrivacyService,
    SellerApplicationsRepository,
    IpHourlyRateLimiter,
    SellerApplicationsService,
    SellerSetupRepository,
    SellerSetupService,
    BranchesRepository,
    BranchesService,
  ],
  exports: [
    SellerSetupRepository,
    BusinessesRepository,
    SellerApplicationsRepository,
    IpHourlyRateLimiter,
  ],
})
export class BusinessesModule {}
