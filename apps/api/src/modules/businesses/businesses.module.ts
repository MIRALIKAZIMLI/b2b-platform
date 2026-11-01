import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { SettingsModule } from '../settings';
import { BusinessProfileService } from './business-profile.service';
import { ActivityTypesController } from './activity-types.controller';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessesRepository } from './businesses.repository';
import { IpHourlyRateLimiter } from './ip-hourly-rate-limiter';
import { SellerApplicationsController } from './seller-applications.controller';
import { SellerApplicationsRepository } from './seller-applications.repository';
import { SellerApplicationsService } from './seller-applications.service';

/**
 * İşletme çekirdek tabloları (F1.7), kimliksiz toptancı başvurusu (F2.2) ve işletme profili
 * okuma ucu (F2.3b), profil düzenleme (F2.4). IpKeyService global
 * IdentityModule'den, Redis istemcisi global RedisModule'den gelir.
 */
@Module({
  imports: [AuditModule, SettingsModule],
  controllers: [SellerApplicationsController, ActivityTypesController, BusinessProfileController],
  providers: [
    BusinessesRepository,
    BusinessProfileService,
    SellerApplicationsRepository,
    IpHourlyRateLimiter,
    SellerApplicationsService,
  ],
  exports: [BusinessesRepository, SellerApplicationsRepository, IpHourlyRateLimiter],
})
export class BusinessesModule {}
