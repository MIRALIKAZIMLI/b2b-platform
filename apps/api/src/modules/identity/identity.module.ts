import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { I18nModule } from '../i18n';
import { SettingsModule } from '../settings';
import { AuthController } from './auth.controller';
import { IDENTITY_CONFIG, type IdentityConfig } from './identity.config';
import { IpKeyService } from './ip-key.service';
import { OtpRateLimiter } from './otp-rate-limiter';
import { OtpController } from './otp.controller';
import { OtpRepository } from './otp.repository';
import { OtpService } from './otp.service';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { TotpController } from './totp/totp.controller';
import { TotpRepository } from './totp/totp.repository';
import { TotpService } from './totp/totp.service';
import { TransactionalSmsService } from './transactional-sms.service';
import { UserDirectory } from './user-directory';

/**
 * Kimlik: kullanıcılar, OTP (F1.5a), oturum, JWT ve yenileme anahtarı (F1.5b), TOTP ve platform
 * ekibi (F1.6). SmsSender global SmsModule'den, Redis istemcisi global RedisModule'den gelir.
 * Global modül (yapılandırmalı forRoot): access modülü kimlik servislerini içe aktarabilsin (F1.8b).
 * Erişim kararı global AccessGuard'da (modules/access); /me access modülünde.
 */
@Module({})
export class IdentityModule {
  static forRoot(config: IdentityConfig): DynamicModule {
    return {
      module: IdentityModule,
      global: true,
      imports: [SettingsModule, I18nModule, AuditModule],
      controllers: [OtpController, AuthController, TotpController],
      providers: [
        { provide: IDENTITY_CONFIG, useValue: config },
        OtpRepository,
        OtpRateLimiter,
        OtpService,
        SessionRepository,
        TokenService,
        SessionService,
        TotpRepository,
        TotpService,
        UserDirectory,
        TransactionalSmsService,
        IpKeyService,
      ],
      // F1.8b: access modülü (AccessGuard, /me) TokenService, SessionService ve TotpRepository kullanır.
      // F2.1a: access davet servisi UserDirectory ve TransactionalSmsService kullanır.
      exports: [
        OtpService,
        TokenService,
        SessionService,
        TotpRepository,
        UserDirectory,
        TransactionalSmsService,
        // F2.2: kimliksiz toptancı başvurusunun IP hız sınırı (businesses).
        IpKeyService,
      ],
    };
  }
}
