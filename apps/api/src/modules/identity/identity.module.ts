import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { I18nModule } from '../i18n';
import { SettingsModule } from '../settings';
import { IDENTITY_CONFIG, type IdentityConfig } from './identity.config';
import { OtpRateLimiter } from './otp-rate-limiter';
import { OtpController } from './otp.controller';
import { OtpRepository } from './otp.repository';
import { OtpService } from './otp.service';

/**
 * Kimlik (F1.5a): kullanıcılar, OTP isteme ve doğrulama. SmsSender global SmsModule'den,
 * Redis istemcisi global RedisModule'den gelir. Oturum ve `verify` ucu F1.5b'de.
 */
@Module({})
export class IdentityModule {
  static forRoot(config: IdentityConfig): DynamicModule {
    return {
      module: IdentityModule,
      imports: [SettingsModule, I18nModule, AuditModule],
      controllers: [OtpController],
      providers: [
        { provide: IDENTITY_CONFIG, useValue: config },
        OtpRepository,
        OtpRateLimiter,
        OtpService,
      ],
      exports: [OtpService],
    };
  }
}
