import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuditRequestContext } from '../../core/audit';
import { resolveRequestId } from '../../core/request-id.middleware';
import { Authenticated, Public } from '../../core/auth/access-decorators';
import { CurrentSession } from './current-session';
import { DEVICE_TYPES } from './identity.schema';
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

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Req() req: HttpRequest): Promise<AuthResult> {
    const input = verifyBodySchema.parse(body);
    const device = input.device;
    return await this.sessions.verifyOtp({
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
  }

  // Web'de cookie desteği F1.13'te.
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: HttpRequest): Promise<TokenPair> {
    const input = refreshBodySchema.parse(body ?? {});
    return await this.sessions.refresh(input.refreshToken, auditContext(req));
  }

  @Post('logout')
  @HttpCode(204)
  @Authenticated()
  async logout(@CurrentSession() auth: SessionAuth): Promise<void> {
    await this.sessions.logout(auth);
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
