// Oturumlar (US-001 AC2, US-004, SF-01, F1.5b). Yenileme anahtarı 32 rastgele bayt (base64url);
// veritabanında yalnızca SHA-256 özeti (Mimar kararı 4). Her yenilemede anahtar döndürülür;
// kapatılmış bir anahtar tekrar gelirse aile iptal edilir ve audit'e yazılır (F1.5-AC11).
// Erişim anahtarı durumsuzdur: oturum kapatılınca en geç ömrü (15 dk) dolunca düşer (US-004 AC2).
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { SettingKey, SettingValue } from '@b2b/shared';
import { z } from 'zod';
import { type AuditRecorder, type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import { DomainError } from '../../core/errors/domain-error';
import { IdGenerator } from '../../core/id-generator';
import { SettingsService } from '../settings';
import type { DeviceType } from './identity.schema';
import { OtpService } from './otp.service';
import { type ActiveSession, SessionRepository } from './session.repository';
import { TokenService } from './token.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_BYTES = 32;
/** `device` gelmezse (Mimar kararı 6). */
const DEFAULT_DEVICE_TYPE: DeviceType = 'web';

export interface DeviceInput {
  readonly type?: DeviceType;
  readonly name?: string;
}

export interface VerifyOtpInput {
  readonly challengeId: string;
  readonly code: string;
  readonly device?: DeviceInput;
  readonly context?: AuditRequestContext;
}

/** openapi `AuthResult`; üyelikler F1.8b'de dolar. */
export type AuthResult =
  | {
      readonly nextStep: 'none';
      readonly accessToken: string;
      readonly expiresIn: number;
      readonly refreshToken: string;
      readonly memberships: readonly never[];
    }
  | {
      readonly nextStep: 'register';
      readonly pendingToken: string;
      readonly memberships: readonly never[];
    };

/** openapi `TokenPair`. */
export interface TokenPair {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
}

/** Kimliği doğrulanmış istek (AccessTokenGuard). */
export interface SessionAuth {
  readonly userId: string;
  readonly sessionId: string;
}

export interface SessionView {
  readonly id: string;
  readonly deviceType: DeviceType;
  readonly deviceName: string | null;
  readonly city: string | null;
  readonly lastUsedAt: Date;
  readonly current: boolean;
}

/** openapi `Me` (temel alanlar; `platformRole` F1.6/F2, üyelikler F1.8b). */
export interface MeView {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly preferredLanguage: string | null;
  readonly timezone: string | null;
  readonly platformRole: null;
  readonly memberships: readonly never[];
}

export interface SessionSettingsPort {
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
}

const refreshTokenSchema = z.string().min(1).max(256);

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function newRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function toView(session: ActiveSession, currentSessionId: string): SessionView {
  return {
    id: session.id,
    deviceType: session.deviceType,
    deviceName: session.deviceName,
    city: session.ipCity,
    lastUsedAt: session.lastUsedAt,
    current: session.id === currentSessionId,
  };
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(OtpService) private readonly otp: Pick<OtpService, 'verifyChallenge'>,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SettingsService) private readonly settings: SessionSettingsPort,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  /** POST /auth/otp/verify (SF-01). */
  async verifyOtp(input: VerifyOtpInput): Promise<AuthResult> {
    const verified = await this.otp.verifyChallenge({
      challengeId: input.challengeId,
      code: input.code,
      ...(input.context === undefined ? {} : { context: input.context }),
    });
    const user = await this.sessions.findUserByPhone(verified.phoneE164);
    if (user === undefined) {
      // Kayıtlı olmayan numara: oturum açılmaz; kayıt (F2.3) bu anahtarla yapılır (Mimar kararı 2).
      const pendingToken = await this.tokens.signPendingRegistration(verified.phoneE164);
      return { nextStep: 'register', pendingToken, memberships: [] };
    }
    if (user.status !== 'active') {
      throw new DomainError('USER_DISABLED');
    }

    const sessionId = this.ids.next();
    const refreshToken = newRefreshToken();
    const now = this.clock.now();
    await this.sessions.open({
      id: sessionId,
      userId: user.id,
      familyId: this.ids.next(),
      refreshTokenHash: hashRefreshToken(refreshToken),
      deviceType: input.device?.type ?? DEFAULT_DEVICE_TYPE,
      deviceName: input.device?.name ?? null,
      now,
      expiresAt: await this.refreshExpiry(now),
    });
    const access = await this.tokens.signAccess({ userId: user.id, sessionId });
    return {
      nextStep: 'none',
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      memberships: [],
    };
  }

  /** POST /auth/refresh: döndürme ve yeniden kullanım tespiti (F1.5-AC11). */
  async refresh(rawToken: unknown, context?: AuditRequestContext): Promise<TokenPair> {
    const parsed = refreshTokenSchema.safeParse(rawToken);
    if (!parsed.success) throw new DomainError('UNAUTHENTICATED');

    const now = this.clock.now();
    const newId = this.ids.next();
    const refreshToken = newRefreshToken();
    const result = await this.sessions.rotate(
      {
        refreshTokenHash: hashRefreshToken(parsed.data),
        newId,
        newRefreshTokenHash: hashRefreshToken(refreshToken),
        now,
        newExpiresAt: await this.refreshExpiry(now),
      },
      async (tx, familyId) => {
        await this.audit.record(tx, {
          actor: { type: 'system', userId: null },
          businessId: null,
          action: 'session.refresh_reused',
          targetType: 'session_family',
          targetId: familyId,
          ...(context === undefined ? {} : { context }),
        });
      },
    );

    switch (result.result) {
      case 'rotated': {
        const access = await this.tokens.signAccess({
          userId: result.userId,
          sessionId: result.sessionId,
        });
        return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken };
      }
      case 'reused':
        throw new DomainError('REFRESH_TOKEN_REUSED');
      case 'unknown':
      case 'expired':
      case 'disabled':
        throw new DomainError('UNAUTHENTICATED');
    }
  }

  /** POST /auth/logout: bu oturumun ailesi kapatılır. */
  async logout(auth: SessionAuth): Promise<void> {
    await this.sessions.revokeFamily(auth.userId, auth.sessionId, this.clock.now(), false);
  }

  /** GET /auth/sessions (US-004 AC1). */
  async list(auth: SessionAuth): Promise<SessionView[]> {
    const sessions = await this.sessions.listActive(auth.userId, this.clock.now());
    return sessions.map((session) => toView(session, auth.sessionId));
  }

  /** DELETE /auth/sessions/{id} (US-004 AC2): başkasının veya kapalı oturum → 404 (F1.5-AC14). */
  async close(auth: SessionAuth, sessionId: string): Promise<void> {
    if (!z.uuid().safeParse(sessionId).success) throw new DomainError('NOT_FOUND');
    const revoked = await this.sessions.revokeFamily(
      auth.userId,
      sessionId,
      this.clock.now(),
      true,
    );
    if (revoked === 0) throw new DomainError('NOT_FOUND');
  }

  /** GET /me (temel; üyelik ve izinler F1.8b). Aktif olmayan kullanıcı → 403 USER_DISABLED. */
  async me(auth: SessionAuth): Promise<MeView> {
    const user = await this.sessions.findSelf(auth.userId);
    if (user === undefined) throw new DomainError('UNAUTHENTICATED');
    if (user.status !== 'active') throw new DomainError('USER_DISABLED');
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phoneE164,
      preferredLanguage: user.preferredLanguage,
      timezone: user.timezone,
      platformRole: null,
      memberships: [],
    };
  }

  private async refreshExpiry(now: Date): Promise<Date> {
    const days = await this.settings.get('auth.refresh_token_days');
    return new Date(now.getTime() + days * DAY_MS);
  }
}
