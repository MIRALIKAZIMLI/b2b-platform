// OTP isteme ve doğrulama (US-001, SF-01, NFR-45, F1.5a).
// - Kayıtlı olmayan numaraya da kod gönderilir; yanıt aynıdır (numara varlığı sızdırılmaz).
//   Bu adımda kullanıcı oluşturulmaz (kayıt F2.3).
// - Kod ve telefon loglanmaz (NFR-66); veritabanında kodun yalnızca HMAC özeti vardır.
// - Doğrulama yalnızca servis fonksiyonudur; HTTP `verify` ucu token ürettiği için F1.5b'de.
// Süre, kota ve eşikler SettingsService'ten (US-017 `otp.*`, `sms.*`); saat Clock'tan.
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SettingKey, SettingValue } from '@b2b/shared';
import { z } from 'zod';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { SmsSender } from '../../core/ports/sms-sender';
import { I18nService } from '../i18n';
import { SettingsService } from '../settings';
import { IDENTITY_CONFIG, type IdentityConfig } from './identity.config';
import { OTP_PURPOSES, type OtpPurpose } from './identity.schema';
import { generateOtpCode, hashOtpCode, ipKey, otpCodeMatches, phoneKey } from './otp-code';
import { OtpRateLimiter } from './otp-rate-limiter';
import { OtpRepository } from './otp.repository';
import { parsePhoneE164 } from './phone';

/** SettingsService'in burada kullanılan kısmı (birim testte sahtesi verilir). */
export interface OtpSettingsPort {
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
}

/** I18nService'in burada kullanılan kısmı. */
export interface OtpTextPort {
  text(key: string, acceptLanguage: string | undefined): Promise<string | undefined>;
}

export type OtpRepositoryPort = Pick<OtpRepository, 'create' | 'close' | 'withLockedChallenge'>;
export type OtpRateLimiterPort = Pick<
  OtpRateLimiter,
  'lockRemainingSeconds' | 'lock' | 'reserveRequest' | 'countDailySms'
>;

export interface RequestOtpInput {
  readonly phone: string;
  readonly purpose: OtpPurpose;
  /** İstek IP'si (Fastify `request.ip`); bilinmiyorsa IP sınırı uygulanmaz. */
  readonly ip?: string;
  readonly acceptLanguage?: string;
}

export interface RequestOtpResult {
  readonly challengeId: string;
  readonly expiresAt: Date;
}

export interface VerifyChallengeInput {
  readonly challengeId: string;
  readonly code: string;
  readonly context?: AuditRequestContext;
}

export interface VerifiedChallenge {
  readonly phoneE164: string;
  readonly purpose: OtpPurpose;
}

const SMS_TEMPLATE_KEY = 'sms.otp_body';
/** Çeviri yoksa (ör. seed çalışmamış) mesaj yalnızca koddur. */
const SMS_TEMPLATE_FALLBACK = '{code}';

const requestSchema = z.strictObject({
  phone: z.string().max(32),
  purpose: z.enum(OTP_PURPOSES),
});

const verifySchema = z.strictObject({
  challengeId: z.uuid(),
  code: z.string().regex(/^[0-9]{6}$/),
});

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

type VerifyOutcome =
  | { readonly kind: 'ok'; readonly challenge: VerifiedChallenge }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'locked'; readonly retryAfterSeconds: number };

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(OtpRepository) private readonly repository: OtpRepositoryPort,
    @Inject(OtpRateLimiter) private readonly limiter: OtpRateLimiterPort,
    @Inject(SettingsService) private readonly settings: OtpSettingsPort,
    @Inject(I18nService) private readonly texts: OtpTextPort,
    @Inject(SmsSender) private readonly sms: SmsSender,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  /** Kod üretir, saklar ve SMS'le gönderir (US-001 AC1, AC3, AC6; F1.5-AC8). */
  async requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    const { phone: rawPhone, purpose } = requestSchema.parse({
      phone: input.phone,
      purpose: input.purpose,
    });
    const phone = parsePhoneE164(rawPhone);
    if (phone === undefined) {
      throw new DomainError('VALIDATION_FAILED', { phone: ['invalid_phone'] });
    }
    const allowed = await this.settings.get('sms.allowed_country_codes');
    if (!allowed.includes(phone.countryCode)) {
      throw new DomainError('VALIDATION_FAILED', { phone: ['country_not_allowed'] });
    }

    const [ttlMinutes, resendIntervalSeconds, maxPerHour, ipMaxPerHour, dailyCap] =
      await Promise.all([
        this.settings.get('otp.code_ttl_minutes'),
        this.settings.get('otp.resend_interval_seconds'),
        this.settings.get('otp.max_per_hour'),
        this.settings.get('otp.ip_max_per_hour'),
        this.settings.get('sms.daily_cap'),
      ]);

    const now = this.clock.now();
    const nowMs = now.getTime();
    const numberKey = phoneKey(this.config.otpHashKey, phone.e164);
    const ip = ipSchema.safeParse(input.ip);

    const lockedFor = await this.limiter.lockRemainingSeconds(numberKey, nowMs);
    if (lockedFor !== undefined) {
      // Kilitli numara yeni kod alamaz; kalan süre döner (Mimar kararı 3, sözleşme değişmez).
      throw new DomainError('OTP_RATE_LIMITED', { retryAfter: lockedFor });
    }

    const challengeId = this.ids.next();
    const decision = await this.limiter.reserveRequest({
      phoneKey: numberKey,
      ...(ip.success ? { ipKey: ipKey(this.config.otpHashKey, ip.data) } : {}),
      nowMs,
      member: challengeId,
      resendIntervalSeconds,
      maxPerHour,
      ipMaxPerHour,
    });
    if (!decision.allowed) {
      throw new DomainError('OTP_RATE_LIMITED', { retryAfter: decision.retryAfterSeconds });
    }
    if (!(await this.limiter.countDailySms(nowMs, dailyCap))) {
      this.logger.warn('otp.daily_cap_reached: günlük SMS sınırına ulaşıldı');
      throw new DomainError('SMS_UNAVAILABLE');
    }

    const code = generateOtpCode();
    const expiresAt = new Date(nowMs + ttlMinutes * 60 * 1000);
    await this.repository.create({
      id: challengeId,
      phoneE164: phone.e164,
      purpose,
      codeHash: hashOtpCode(this.config.otpHashKey, challengeId, code),
      expiresAt,
      requestIp: ip.success ? ip.data : null,
      now,
    });

    const template =
      (await this.texts.text(SMS_TEMPLATE_KEY, input.acceptLanguage)) ?? SMS_TEMPLATE_FALLBACK;
    const body = template.replaceAll('{code}', code).replaceAll('{minutes}', String(ttlMinutes));
    try {
      await this.sms.send({ to: phone.e164, body, purpose: 'otp' });
    } catch (error: unknown) {
      // SF-01: yeniden denemeler de başarısız → challenge kapatılır, kullanıcı sonra tekrar ister.
      this.logger.warn(`otp.sms_failed: SMS gönderilemedi (${errorName(error)})`);
      await this.repository.close(challengeId, this.clock.now());
      throw new DomainError('SMS_UNAVAILABLE');
    }

    return { challengeId, expiresAt };
  }

  /**
   * Kodu doğrular (US-001 AC4, AC5). Doğruysa challenge kapatılır (tek kullanım) ve telefon döner.
   * Yanlış kod deneme sayar; `otp.max_attempts` sayısına ulaşınca numara `otp.lock_minutes`
   * kilitlenir, challenge kapatılır ve audit'e yazılır. Hatalar: OTP_INVALID, OTP_EXPIRED, OTP_LOCKED.
   */
  async verifyChallenge(input: VerifyChallengeInput): Promise<VerifiedChallenge> {
    const { challengeId, code } = verifySchema.parse({
      challengeId: input.challengeId,
      code: input.code,
    });
    // Ayarlar işlemden önce okunur: işlem açıkken ikinci bir bağlantı beklenmez.
    const [maxAttempts, lockMinutes] = await Promise.all([
      this.settings.get('otp.max_attempts'),
      this.settings.get('otp.lock_minutes'),
    ]);
    const now = this.clock.now();
    const nowMs = now.getTime();

    const outcome = await this.repository.withLockedChallenge(
      challengeId,
      now,
      async (challenge, ops): Promise<VerifyOutcome> => {
        // Yok veya kullanılmış (consumed_at dolu).
        if (challenge?.consumedAt !== null) {
          return { kind: 'invalid' };
        }
        const numberKey = phoneKey(this.config.otpHashKey, challenge.phoneE164);
        const lockedFor = await this.limiter.lockRemainingSeconds(numberKey, nowMs);
        if (lockedFor !== undefined) {
          return { kind: 'locked', retryAfterSeconds: lockedFor };
        }
        if (nowMs >= challenge.expiresAt.getTime()) {
          return { kind: 'expired' };
        }
        if (otpCodeMatches(this.config.otpHashKey, challengeId, code, challenge.codeHash)) {
          await ops.close();
          return {
            kind: 'ok',
            challenge: { phoneE164: challenge.phoneE164, purpose: challenge.purpose },
          };
        }
        const attempts = await ops.fail();
        if (attempts < maxAttempts) {
          return { kind: 'invalid' };
        }
        await ops.close();
        await this.audit.record(ops.tx, {
          actor: { type: 'system', userId: null },
          businessId: null,
          action: 'otp.locked',
          targetType: 'otp_challenge',
          targetId: challengeId,
          after: { attempts, lockMinutes },
          ...(input.context === undefined ? {} : { context: input.context }),
        });
        // Redis yazılamazsa hata atar ve işlem geri alınır (güvenli taraf: kilit ve audit
        // birlikte yazılır ya da hiçbiri; kullanıcı SMS_UNAVAILABLE alır).
        await this.limiter.lock(numberKey, nowMs, lockMinutes);
        return { kind: 'locked', retryAfterSeconds: lockMinutes * 60 };
      },
    );

    switch (outcome.kind) {
      case 'ok':
        return outcome.challenge;
      case 'invalid':
        throw new DomainError('OTP_INVALID');
      case 'expired':
        throw new DomainError('OTP_EXPIRED');
      case 'locked':
        throw new DomainError('OTP_LOCKED', { retryAfter: outcome.retryAfterSeconds });
    }
  }
}
