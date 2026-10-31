import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { BusinessesRepository } from './businesses.repository';
import { SellerApplicationRateLimiter } from './seller-application-rate-limiter';
import { SellerApplicationsController } from './seller-applications.controller';
import { SellerApplicationsRepository } from './seller-applications.repository';
import { SellerApplicationsService } from './seller-applications.service';

/**
 * İşletme çekirdek tabloları (F1.7) ve kimliksiz toptancı başvurusu (F2.2). IpKeyService global
 * IdentityModule'den, Redis istemcisi global RedisModule'den gelir.
 */
@Module({
  imports: [SettingsModule],
  controllers: [SellerApplicationsController],
  providers: [
    BusinessesRepository,
    SellerApplicationsRepository,
    SellerApplicationRateLimiter,
    SellerApplicationsService,
  ],
  exports: [BusinessesRepository, SellerApplicationsRepository],
})
export class BusinessesModule {}
