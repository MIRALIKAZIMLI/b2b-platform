import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { IdempotencyModule } from '../../core/idempotency';
import { OutboxModule } from '../../core/outbox';
import { AccessModule } from '../access';
import { BillingModule } from '../billing';
import { BusinessesModule } from '../businesses';
import { I18nModule } from '../i18n';
import { SettingsModule } from '../settings';
import { BuyerRegistrationController } from './buyer-registration.controller';
import { BuyerRegistrationService } from './buyer-registration.service';

/**
 * Kimliksiz perakendeci kaydı (F2.3a, US-005, SF-02). Yalnızca düzenleyicidir: tablo sahibi
 * değildir; businesses, access, billing ve identity'nin `tx` alan fonksiyonlarını tek kiracı
 * işleminde çağırır (R15, c4 §1 `onboarding`). TokenService, SessionService, UserDirectory ve
 * IpKeyService global IdentityModule'den gelir.
 */
@Module({
  imports: [
    AuditModule,
    IdempotencyModule,
    OutboxModule,
    AccessModule,
    BillingModule,
    BusinessesModule,
    I18nModule,
    SettingsModule,
  ],
  controllers: [BuyerRegistrationController],
  providers: [BuyerRegistrationService],
})
export class OnboardingModule {}
