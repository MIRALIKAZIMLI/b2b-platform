// Erişim anahtarı (JWT) ve kayıt anahtarı (F1.5b, ADR-0006, Mimar kararı 1 ve K2).
// - HS256 (jose); başlıkta `kid`. Güncel anahtar imzalar; önceki anahtar (döndürme) yalnızca doğrular.
// - Erişim anahtarı: `typ = access`, `sub` (kullanıcı), `sid` (oturum), `exp`. İzin ve üyelik
//   JWT'ye konmaz (her istekte doğrulanır, F1.8b).
// - Kayıt anahtarı (`pendingToken`): `typ = pending`, `purpose = register`, `phone`. Erişim anahtarı
//   olarak kabul edilmez.
// - TOTP ön oturumu (F1.6): `typ = pending`, `purpose = totp`, `sub` (kullanıcı). Yalnızca
//   /auth/totp/* uçlarında geçerli; erişim anahtarı olarak kabul edilmez.
// - Zaman Clock'tan (`iat`, `exp`, doğrulamada `currentDate`). Anahtarlar loglanmaz.
import { Inject, Injectable } from '@nestjs/common';
import type { SettingKey, SettingValue } from '@b2b/shared';
import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { Clock } from '../../core/clock';
import { DomainError } from '../../core/errors/domain-error';
import { SettingsService } from '../settings';
import { IDENTITY_CONFIG, type IdentityConfig } from './identity.config';

const ALGORITHM = 'HS256';
const MINUTE_SECONDS = 60;

export interface AccessClaims {
  readonly userId: string;
  readonly sessionId: string;
}

export interface SignedAccessToken {
  readonly token: string;
  /** Saniye. */
  readonly expiresIn: number;
}

export interface TokenSettingsPort {
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
}

const accessPayloadSchema = z.object({
  typ: z.literal('access'),
  sub: z.uuid(),
  sid: z.uuid(),
});

const pendingPayloadSchema = z.object({
  typ: z.literal('pending'),
  purpose: z.literal('register'),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
});

const pendingTotpPayloadSchema = z.object({
  typ: z.literal('pending'),
  purpose: z.literal('totp'),
  sub: z.uuid(),
});

function encode(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

@Injectable()
export class TokenService {
  private readonly keys: ReadonlyMap<string, Uint8Array>;

  constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(SettingsService) private readonly settings: TokenSettingsPort,
    @Inject(Clock) private readonly clock: Clock,
  ) {
    const keys = new Map<string, Uint8Array>([
      [config.jwt.current.id, encode(config.jwt.current.secret)],
    ]);
    if (config.jwt.previous !== undefined) {
      keys.set(config.jwt.previous.id, encode(config.jwt.previous.secret));
    }
    this.keys = keys;
  }

  /** Erişim anahtarı; ömür `auth.access_token_minutes` (NFR-44). */
  async signAccess(claims: AccessClaims): Promise<SignedAccessToken> {
    const minutes = await this.settings.get('auth.access_token_minutes');
    const expiresIn = minutes * MINUTE_SECONDS;
    const token = await this.sign(
      { typ: 'access', sid: claims.sessionId },
      expiresIn,
      claims.userId,
    );
    return { token, expiresIn };
  }

  /** Kayıt anahtarı (nextStep = register); ömür erişim anahtarıyla aynı. */
  async signPendingRegistration(phoneE164: string): Promise<string> {
    const minutes = await this.settings.get('auth.access_token_minutes');
    return await this.sign(
      { typ: 'pending', purpose: 'register', phone: phoneE164 },
      minutes * MINUTE_SECONDS,
    );
  }

  /** Erişim anahtarını doğrular; geçersizse `UNAUTHENTICATED` (F1.5-AC12). */
  async verifyAccess(token: string): Promise<AccessClaims> {
    const payload = accessPayloadSchema.safeParse(await this.verify(token));
    if (!payload.success) throw new DomainError('UNAUTHENTICATED');
    return { userId: payload.data.sub, sessionId: payload.data.sid };
  }

  /** TOTP ön oturumu (nextStep = totp / totp_setup); ömür erişim anahtarıyla aynı (F1.6). */
  async signPendingTotp(userId: string): Promise<string> {
    const minutes = await this.settings.get('auth.access_token_minutes');
    return await this.sign({ typ: 'pending', purpose: 'totp' }, minutes * MINUTE_SECONDS, userId);
  }

  /** TOTP ön oturumunu doğrular; kullanıcı kimliği döner. */
  async verifyPendingTotp(token: string): Promise<string> {
    const payload = pendingTotpPayloadSchema.safeParse(await this.verify(token));
    if (!payload.success) throw new DomainError('UNAUTHENTICATED');
    return payload.data.sub;
  }

  /** Kayıt anahtarını doğrular (F2.3 kullanır); telefon döner. */
  async verifyPendingRegistration(token: string): Promise<string> {
    const payload = pendingPayloadSchema.safeParse(await this.verify(token));
    if (!payload.success) throw new DomainError('UNAUTHENTICATED');
    return payload.data.phone;
  }

  private async sign(
    claims: Record<string, string>,
    ttlSeconds: number,
    subject?: string,
  ): Promise<string> {
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM, kid: this.config.jwt.current.id })
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ttlSeconds);
    if (subject !== undefined) jwt.setSubject(subject);
    return await jwt.sign(encode(this.config.jwt.current.secret));
  }

  /** İmza, `kid`, algoritma ve süre; hata ayrıntısı dışarı verilmez. */
  private async verify(token: string): Promise<unknown> {
    try {
      const { kid } = decodeProtectedHeader(token);
      const key = kid === undefined ? undefined : this.keys.get(kid);
      if (key === undefined) throw new DomainError('UNAUTHENTICATED');
      const { payload } = await jwtVerify(token, key, {
        algorithms: [ALGORITHM],
        currentDate: this.clock.now(),
        requiredClaims: ['exp', 'iat'],
      });
      return payload;
    } catch (error: unknown) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('UNAUTHENTICATED');
    }
  }
}
