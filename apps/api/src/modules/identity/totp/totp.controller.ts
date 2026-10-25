import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../../core/auth/access-decorators';
import { DomainError } from '../../../core/errors/domain-error';
import { DEVICE_TYPES } from '../identity.schema';
import type { AuthResult } from '../session.service';
import { TokenService } from '../token.service';
import { type TotpSetupResult, TotpService } from './totp.service';

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

const setupBodySchema = z.strictObject({ confirmCode: z.string().max(16).optional() });

const verifyBodySchema = z.strictObject({
  pendingToken: z.string().max(4096),
  code: z.string().max(32),
  device: z
    .strictObject({
      type: z.enum(DEVICE_TYPES).optional(),
      name: z.string().max(120).optional(),
      appVersion: z.string().max(40).optional(),
    })
    .optional(),
});

/** openapi `/api/v1/auth/totp/*` (US-002, F1.6). İki uç da yalnızca TOTP ön oturumuyla çalışır. */
@Controller('api/v1/auth/totp')
export class TotpController {
  constructor(
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  /** Yetki: `Authorization: Bearer <pendingToken>` (purpose = totp); erişim anahtarı kabul edilmez. */
  // Erişim anahtarı değil, TOTP ön oturumu: guard JWT bakmaz, uç kendisi doğrular.
  @Public()
  @Post('setup')
  @HttpCode(200)
  async setup(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<TotpSetupResult> {
    const token = authorization === undefined ? undefined : BEARER.exec(authorization)?.[1];
    if (token === undefined) throw new DomainError('UNAUTHENTICATED');
    const userId = await this.tokens.verifyPendingTotp(token);
    const input = setupBodySchema.parse(body ?? {});
    return await this.totp.setup(userId, input.confirmCode);
  }

  @Public()
  @Post('verify')
  @HttpCode(200)
  async verify(@Body() body: unknown): Promise<AuthResult> {
    const input = verifyBodySchema.parse(body);
    const device = input.device;
    return await this.totp.verify(
      input.pendingToken,
      input.code,
      device === undefined
        ? undefined
        : {
            ...(device.type === undefined ? {} : { type: device.type }),
            ...(device.name === undefined ? {} : { name: device.name }),
          },
    );
  }
}
