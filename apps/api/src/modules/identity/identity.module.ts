import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { I18nModule } from '../i18n';
import { SettingsModule } from '../settings';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { IDENTITY_CONFIG, type IdentityConfig } from './identity.config';
import { MeController } from './me.controller';
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

/**
 * Kimlik: kullanıcılar, OTP (F1.5a), oturum, JWT ve yenileme anahtarı (F1.5b), TOTP ve platform
 * ekibi (F1.6). SmsSender global
 * SmsModule'den, Redis istemcisi global RedisModule'den gelir. AccessTokenGuard ve TokenService
 * diğer modüllerin korumalı uçları için dışa açıktır.
 */
@Module({})
export class IdentityModule {
  static forRoot(config: IdentityConfig): DynamicModule {
    return {
      module: IdentityModule,
      imports: [SettingsModule, I18nModule, AuditModule],
      controllers: [OtpController, AuthController, MeController, TotpController],
      providers: [
        { provide: IDENTITY_CONFIG, useValue: config },
        OtpRepository,
        OtpRateLimiter,
        OtpService,
        SessionRepository,
        TokenService,
        SessionService,
        AccessTokenGuard,
        TotpRepository,
        TotpService,
      ],
      exports: [OtpService, TokenService, AccessTokenGuard],
    };
  }
}
