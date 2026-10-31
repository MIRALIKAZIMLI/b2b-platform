// OTP dışındaki SMS'ler (davet / aktivasyon bağlantısı; F2.1a, D18 güncellemesi). OTP ile aynı
// kurallar uygulanır: yalnızca `sms.allowed_country_codes` ülkeleri ve ortak günlük sayaç
// `sms.daily_cap` (OtpRateLimiter, Redis). Gönderilemezse hata atmaz, `false` döner; çağıran
// işlemi geri almaz (kart K3). Mesaj gövdesi (bağlantı/token) ve telefon loglanmaz.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../core/clock';
import { SmsSender } from '../../core/ports/sms-sender';
import { SettingsService } from '../settings';
import { OtpRateLimiter } from './otp-rate-limiter';
import { parsePhoneE164 } from './phone';

export interface TransactionalSms {
  readonly to: string;
  readonly body: string;
  readonly purpose: 'invitation';
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

@Injectable()
export class TransactionalSmsService {
  private readonly logger = new Logger(TransactionalSmsService.name);

  constructor(
    @Inject(SmsSender) private readonly sms: SmsSender,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(OtpRateLimiter) private readonly limiter: OtpRateLimiter,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** Gönderildiyse true. Ülke izinli değilse, günlük sınır dolduysa veya sağlayıcı hata verirse false. */
  async send(message: TransactionalSms): Promise<boolean> {
    try {
      const phone = parsePhoneE164(message.to);
      const allowed = await this.settings.get('sms.allowed_country_codes');
      if (phone === undefined || !allowed.includes(phone.countryCode)) {
        this.logger.warn(`sms.${message.purpose}_skipped: ülke izinli değil`);
        return false;
      }
      const dailyCap = await this.settings.get('sms.daily_cap');
      if (!(await this.limiter.countDailySms(this.clock.now().getTime(), dailyCap))) {
        this.logger.warn(`sms.${message.purpose}_skipped: günlük SMS sınırına ulaşıldı`);
        return false;
      }
      await this.sms.send({ to: phone.e164, body: message.body, purpose: message.purpose });
      return true;
    } catch (error: unknown) {
      this.logger.warn(`sms.${message.purpose}_failed: SMS gönderilemedi (${errorName(error)})`);
      return false;
    }
  }
}
