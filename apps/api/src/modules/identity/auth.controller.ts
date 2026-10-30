import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuditRequestContext } from '../../core/audit';
import { resolveRequestId } from '../../core/request-id.middleware';
import { Authenticated, Public } from '../../core/auth/access-decorators';
import { DomainError } from '../../core/errors/domain-error';
import { CurrentSession } from './current-session';
import { DEVICE_TYPES } from './identity.schema';
import {
  clearRefreshCookieHeader,
  type CookieReply,
  deliverRefreshToken,
  hasRequestedWith,
  isWebClient,
  readRefreshCookie,
} from './refresh-cookie';
import {
  type AuthResult,
  type SessionAuth,
  SessionService,
  type TokenPair,
} from './session.service';

// Fastify isteğinden kullanılan kısım (fastify doğrudan bağımlılık değil).
interface HttpRequest {
  readonly ip?: string;
  readonly raw: Parameters<typeof resolveRequestId>[0];
}

const verifyBodySchema = z.strictObject({
  challengeId: z.string(),
  code: z.string(),
  device: z
    .strictObject({
      type: z.enum(DEVICE_TYPES).optional(),
      name: z.string().max(120).optional(),
      appVersion: z.string().max(40).optional(),
    })
    .optional(),
});

const refreshBodySchema = z.strictObject({ refreshToken: z.string().optional() });

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

function auditContext(req: HttpRequest): AuditRequestContext {
  const ip = ipSchema.safeParse(req.ip);
  return { requestId: resolveRequestId(req.raw), ...(ip.success ? { ip: ip.data } : {}) };
}

/** Cookie'yi silen yenileme hataları: anahtar geçersiz, süresi dolmuş veya yeniden kullanılmış. */
const COOKIE_CLEARING_CODES: ReadonlySet<string> = new Set([
  'UNAUTHENTICATED',
  'REFRESH_TOKEN_REUSED',
]);

/** Web yanıtında `refreshToken` gövdeden çıkar (cookie'ye taşınır). */
type WebAware<T> = T | Omit<T, 'refreshToken'>;

interface SessionJson {
  readonly id: string;
  readonly deviceType: string;
  readonly deviceName: string | null;
  readonly city: string | null;
  readonly lastUsedAt: string;
  readonly current: boolean;
}

/** openapi `/api/v1/auth/*` (US-001 AC2, US-004, SF-01; F1.5b). */
@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  /** `X-Client: web` → yenileme anahtarı httpOnly cookie'de, gövdede yok (F1.13a). */
  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verify(
    @Body() body: unknown,
    @Req() req: HttpRequest,
    @Headers('x-client') client: string | undefined,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<WebAware<AuthResult>> {
    const input = verifyBodySchema.parse(body);
    const device = input.device;
    const result = await this.sessions.verifyOtp({
      challengeId: input.challengeId,
      code: input.code,
      ...(device === undefined
        ? {}
        : {
            device: {
              ...(device.type === undefined ? {} : { type: device.type }),
              ...(device.name === undefined ? {} : { name: device.name }),
            },
          }),
      context: auditContext(req),
    });
    return deliverRefreshToken(
      result,
      isWebClient(client),
      reply,
      await this.sessions.refreshTokenMaxAgeSeconds(),
    );
  }

  /**
   * Gövdedeki anahtar (mobil) önceliklidir; yoksa cookie okunur. Cookie ile yenileme
   * `X-Requested-With` ister (TM-21); başlık yoksa anahtar tüketilmeden 401. Cookie ile gelen
   * istekte yeni anahtar yine cookie'ye yazılır; hata olursa cookie silinir.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: unknown,
    @Req() req: HttpRequest,
    @Headers('x-client') client: string | undefined,
    @Headers('x-requested-with') requestedWith: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<WebAware<TokenPair>> {
    const input = refreshBodySchema.parse(body ?? {});
    if (input.refreshToken !== undefined) {
      const result = await this.sessions.refresh(input.refreshToken, auditContext(req));
      return deliverRefreshToken(
        result,
        isWebClient(client),
        reply,
        await this.sessions.refreshTokenMaxAgeSeconds(),
      );
    }
    const cookieToken = readRefreshCookie(cookieHeader);
    if (cookieToken === undefined) throw new DomainError('UNAUTHENTICATED');
    if (!hasRequestedWith(requestedWith)) throw new DomainError('UNAUTHENTICATED');
    try {
      const result = await this.sessions.refresh(cookieToken, auditContext(req));
      return deliverRefreshToken(
        result,
        true,
        reply,
        await this.sessions.refreshTokenMaxAgeSeconds(),
      );
    } catch (error) {
      // Yalnız anahtar geçersizse cookie silinir; geçici hata (ör. DB) oturumu bitirmez (Müfettiş L1).
      if (error instanceof DomainError && COOKIE_CLEARING_CODES.has(error.code)) {
        reply.header('Set-Cookie', clearRefreshCookieHeader());
      }
      throw error;
    }
  }

  /** Oturum ailesi kapatılır; web cookie'si her durumda silinir (mobilde etkisiz). */
  @Post('logout')
  @HttpCode(204)
  @Authenticated()
  async logout(
    @CurrentSession() auth: SessionAuth,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<void> {
    await this.sessions.logout(auth);
    reply.header('Set-Cookie', clearRefreshCookieHeader());
  }

  @Get('sessions')
  @Authenticated()
  async list(@CurrentSession() auth: SessionAuth): Promise<SessionJson[]> {
    const sessions = await this.sessions.list(auth);
    return sessions.map((session) => ({
      id: session.id,
      deviceType: session.deviceType,
      deviceName: session.deviceName,
      city: session.city,
      lastUsedAt: session.lastUsedAt.toISOString(),
      current: session.current,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Authenticated()
  async close(@CurrentSession() auth: SessionAuth, @Param('id') id: string): Promise<void> {
    await this.sessions.close(auth, id);
  }
}
