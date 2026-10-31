import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { ActivityTypesController } from './activity-types.controller';
import { BusinessesRepository } from './businesses.repository';
import { IpHourlyRateLimiter } from './ip-hourly-rate-limiter';
import { SellerApplicationsController } from './seller-applications.controller';
import { SellerApplicationsRepository } from './seller-applications.repository';
import { SellerApplicationsService } from './seller-applications.service';

/**
 * İşletme çekirdek tabloları (F1.7) ve kimliksiz toptancı başvurusu (F2.2). IpKeyService global
 * IdentityModule'den, Redis istemcisi global RedisModule'den gelir.
 */
@Module({
  imports: [SettingsModule],
  controllers: [SellerApplicationsController, ActivityTypesController],
  providers: [
    BusinessesRepository,
    SellerApplicationsRepository,
    IpHourlyRateLimiter,
    SellerApplicationsService,
  ],
  exports: [BusinessesRepository, SellerApplicationsRepository, IpHourlyRateLimiter],
})
export class BusinessesModule {}
