import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { IdempotencyModule } from '../../core/idempotency';
import { OutboxModule } from '../../core/outbox';
import { AccessModule, WEB_BASE_URL } from '../access';
import { BillingModule } from '../billing';
import { BusinessesModule } from '../businesses';
import { I18nModule } from '../i18n';
import { SettingsModule } from '../settings';
import { BuyerRegistrationController } from './buyer-registration.controller';
import { BuyerRegistrationService } from './buyer-registration.service';
import { TeamInvitationService } from './team-invitation.service';
import { TeamInvitationsController } from './team-invitations.controller';

/**
 * Kimliksiz perakendeci kaydı (F2.3a, US-005, SF-02) ve ekip daveti (F2.7a, US-013). Yalnızca düzenleyicidir: tablo sahibi
 * değildir; businesses, access, billing ve identity'nin `tx` alan fonksiyonlarını tek kiracı
 * işleminde çağırır (R15, c4 §1 `onboarding`). TokenService, SessionService, UserDirectory ve
 * IpKeyService global IdentityModule'den gelir.
 */
export interface OnboardingOptions {
  /** Ekip daveti SMS'indeki bağlantının web adresi (`WEB_BASE_URL`, F2.7a). */
  readonly webBaseUrl: string;
}

@Module({})
export class OnboardingModule {
  static register(options: OnboardingOptions): DynamicModule {
    return {
      module: OnboardingModule,
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
      controllers: [BuyerRegistrationController, TeamInvitationsController],
      providers: [
        BuyerRegistrationService,
        TeamInvitationService,
        { provide: WEB_BASE_URL, useValue: options.webBaseUrl },
      ],
    };
  }
}
