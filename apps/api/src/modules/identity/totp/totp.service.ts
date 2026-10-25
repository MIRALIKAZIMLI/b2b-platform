// TOTP kurulumu ve giriş ikinci adımı (US-002, NFR-46, TM-03, F1.6).
// - Sır otplib ile üretilir (20 bayt, base32), AES-256-GCM ile şifreli saklanır (totp-crypto.ts).
// - Doğrulama ±1 adım (30 sn); aynı adım ikinci kez kabul edilmez (`last_used_step`).
// - Kurtarma kodu: aynı `code` alanı, `XXXXX-XXXXX` biçimi; bir kez kullanılır (Mimar kararı K2).
// - Kaba kuvvet: her deneme kod doğrulanmadan önce Redis'te atomik sayılır (otp.* ayarları);
//   sınır aşılınca 423 OTP_LOCKED. Doğru kod sayacı sıfırlar.
// - Sır, otpauth URI'si ve kodlar loglanmaz (F1.6-AC5). Zaman Clock'tan.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { SettingKey, SettingValue } from '@b2b/shared';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { Clock } from '../../../core/clock';
import { DomainError } from '../../../core/errors/domain-error';
import { SettingsService } from '../../settings';
import { IDENTITY_CONFIG, type IdentityConfig } from '../identity.config';
import type { RecoveryCodeHash } from '../identity.schema';
import { OtpRateLimiter } from '../otp-rate-limiter';
import { SessionRepository } from '../session.repository';
import { type AuthResult, type DeviceInput, SessionService } from '../session.service';
import { TokenService } from '../token.service';
import {
  findUnusedRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  RECOVERY_CODE_PATTERN,
} from './recovery-codes';
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto';
import { TotpRepository } from './totp.repository';

const ISSUER = 'B2B';
const SECRET_BYTES = 20;
const STEP_SECONDS = 30;
const WINDOW_STEPS = 1;
const TOTP_CODE_PATTERN = /^[0-9]{6}$/;

export interface TotpSetupResult {
  readonly otpauthUri?: string;
  readonly recoveryCodes?: string[];
}

export interface TotpSettingsPort {
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
}

const confirmSchema = z.string().regex(TOTP_CODE_PATTERN).optional();
const codeSchema = z.string().max(32);

/** Sayılmış bir deneme (reserveAttempt). */
interface Attempt {
  readonly count: number;
  readonly maxAttempts: number;
  readonly lockMinutes: number;
  readonly nowMs: number;
}

type VerifyOutcome = 'ok' | 'invalid' | 'required';

/** Redis anahtarında kullanıcının ikinci adım sayacı (OTP numara sayacından ayrı ad alanı). */
function limiterKey(userId: string): string {
  return `totp-${userId}`;
}

@Injectable()
export class TotpService {
  constructor(
    @Inject(TotpRepository) private readonly repository: TotpRepository,
    @Inject(SessionService) private readonly sessions: Pick<SessionService, 'openSession'>,
    @Inject(SessionRepository) private readonly users: Pick<SessionRepository, 'findSelf'>,
    @Inject(TokenService) private readonly tokens: Pick<TokenService, 'verifyPendingTotp'>,
    @Inject(OtpRateLimiter)
    private readonly limiter: Pick<
      OtpRateLimiter,
      'lockRemainingSeconds' | 'lock' | 'recordFailure' | 'clearFailures'
    >,
    @Inject(SettingsService) private readonly settings: TotpSettingsPort,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  /** POST /auth/totp/setup: başlat (confirmCode yok) veya onayla (US-002 AC1, AC4). */
  async setup(userId: string, confirmCode: unknown): Promise<TotpSetupResult> {
    const parsed = confirmSchema.safeParse(confirmCode);
    if (!parsed.success) throw new DomainError('TOTP_INVALID');
    const user = await this.activeUser(userId);
    const now = this.clock.now();

    if (parsed.data === undefined) {
      return await this.repository.withLocked(userId, now, async (row, ops) => {
        if (row?.enabledAt != null) throw new DomainError('INVALID_STATE_TRANSITION');
        const secret = authenticator.generateSecret(SECRET_BYTES);
        await ops.saveSecret(encryptTotpSecret(this.key(), userId, secret));
        return { otpauthUri: authenticator.keyuri(user.phoneE164, ISSUER, secret) };
      });
    }

    const code = parsed.data;
    // Deneme kod doğrulanmadan önce atomik sayılır (Müfettiş H1): eşzamanlı istekler kilidi aşamaz.
    const attempt = await this.reserveAttempt(userId);
    const result = await this.repository.withLocked(userId, now, async (row, ops) => {
      // Kurulum başlatılmamış (satır yok) veya zaten etkin.
      if (row?.enabledAt !== null) {
        throw new DomainError('INVALID_STATE_TRANSITION');
      }
      const step = this.matchStep(userId, row.secretEncrypted, code, null);
      if (step === undefined) return undefined;
      const recoveryCodes = generateRecoveryCodes();
      const hashes: RecoveryCodeHash[] = recoveryCodes.map((recovery) => ({
        hash: hashRecoveryCode(this.config.otpHashKey, userId, recovery),
        usedAt: null,
      }));
      await ops.enable(hashes, step);
      return recoveryCodes;
    });
    if (result === undefined) {
      return await this.rejectAttempt(userId, attempt);
    }
    await this.limiter.clearFailures(limiterKey(userId));
    // Kodlar yalnızca bu yanıtta bir kez görünür; bir daha istenemez (US-002 AC4).
    return { recoveryCodes: result };
  }

  /** POST /auth/totp/verify: giriş ikinci adımı (US-002 AC1, AC2); doğruysa oturum açılır. */
  async verify(pendingToken: string, rawCode: unknown, device?: DeviceInput): Promise<AuthResult> {
    const userId = await this.tokens.verifyPendingTotp(pendingToken);
    const parsed = codeSchema.safeParse(rawCode);
    if (!parsed.success) throw new DomainError('TOTP_INVALID');
    const code = parsed.data.trim().toUpperCase();
    await this.activeUser(userId);
    // Deneme kod doğrulanmadan önce atomik sayılır (Müfettiş H1): eşzamanlı istekler kilidi aşamaz.
    const attempt = await this.reserveAttempt(userId);
    const now = this.clock.now();

    const outcome = await this.repository.withLocked(
      userId,
      now,
      async (row, ops): Promise<VerifyOutcome> => {
        if (row?.enabledAt == null) return 'required';
        if (TOTP_CODE_PATTERN.test(code)) {
          const step = this.matchStep(userId, row.secretEncrypted, code, row.lastUsedStep);
          if (step === undefined) return 'invalid';
          await ops.recordStep(step);
          return 'ok';
        }
        if (RECOVERY_CODE_PATTERN.test(code)) {
          const index = findUnusedRecoveryCode(
            this.config.otpHashKey,
            userId,
            code,
            row.recoveryCodes,
          );
          if (index === -1) return 'invalid';
          const usedAt = now.toISOString();
          await ops.useRecoveryCodes(
            row.recoveryCodes.map((entry, i) => (i === index ? { ...entry, usedAt } : entry)),
          );
          return 'ok';
        }
        return 'invalid';
      },
    );

    switch (outcome) {
      case 'required':
        throw new DomainError('TOTP_REQUIRED');
      case 'invalid':
        return await this.rejectAttempt(userId, attempt);
      case 'ok':
        await this.limiter.clearFailures(limiterKey(userId));
        return await this.sessions.openSession(userId, device);
    }
  }

  /** Kodun adımı; geçersizse veya `lastUsedStep` ve öncesiyse (tekrar kullanım) undefined. */
  private matchStep(
    userId: string,
    secretEncrypted: Buffer,
    code: string,
    lastUsedStep: number | null,
  ): number | undefined {
    const secret = decryptTotpSecret(this.key(), userId, secretEncrypted);
    const epoch = this.clock.now().getTime();
    const delta = authenticator
      .clone({ epoch, step: STEP_SECONDS, window: WINDOW_STEPS })
      .checkDelta(code, secret);
    if (delta === null) return undefined;
    const step = Math.floor(epoch / 1000 / STEP_SECONDS) + delta;
    if (lastUsedStep !== null && step <= lastUsedStep) return undefined;
    return step;
  }

  private async activeUser(userId: string) {
    const user = await this.users.findSelf(userId);
    if (user === undefined) throw new DomainError('UNAUTHENTICATED');
    if (user.status !== 'active') throw new DomainError('USER_DISABLED');
    return user;
  }

  private async assertNotLocked(userId: string): Promise<void> {
    const lockedFor = await this.limiter.lockRemainingSeconds(
      limiterKey(userId),
      this.clock.now().getTime(),
    );
    if (lockedFor !== undefined) throw new DomainError('OTP_LOCKED', { retryAfter: lockedFor });
  }

  /**
   * Denemeyi kod doğrulanmadan önce sayar (Redis'te atomik ZADD + ZCARD). Kilitliyse veya bu
   * deneme pencerede `otp.max_attempts` sayısını aşıyorsa kod hiç doğrulanmadan 423 OTP_LOCKED.
   * Böylece aynı anda gelen N istekten en çok `otp.max_attempts` tanesi kodu dener.
   */
  private async reserveAttempt(userId: string): Promise<Attempt> {
    await this.assertNotLocked(userId);
    const [maxAttempts, windowMinutes, lockMinutes] = await Promise.all([
      this.settings.get('otp.max_attempts'),
      this.settings.get('otp.fail_window_minutes'),
      this.settings.get('otp.lock_minutes'),
    ]);
    const nowMs = this.clock.now().getTime();
    const count = await this.limiter.recordFailure(
      limiterKey(userId),
      nowMs,
      windowMinutes,
      randomUUID(),
    );
    const attempt: Attempt = { count, maxAttempts, lockMinutes, nowMs };
    if (count > maxAttempts) await this.lockAndThrow(userId, attempt);
    return attempt;
  }

  /** Yanlış kod: bu deneme sınıra ulaştıysa kullanıcı kilitlenir (423), değilse 400 TOTP_INVALID. */
  private async rejectAttempt(userId: string, attempt: Attempt): Promise<never> {
    if (attempt.count >= attempt.maxAttempts) await this.lockAndThrow(userId, attempt);
    throw new DomainError('TOTP_INVALID');
  }

  private async lockAndThrow(userId: string, attempt: Attempt): Promise<never> {
    await this.limiter.lock(limiterKey(userId), attempt.nowMs, attempt.lockMinutes);
    throw new DomainError('OTP_LOCKED', { retryAfter: attempt.lockMinutes * 60 });
  }

  private key(): Buffer {
    return this.config.totpEncryptionKey;
  }
}
