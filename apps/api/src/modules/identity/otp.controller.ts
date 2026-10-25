import { Body, Controller, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../core/auth/access-decorators';
import { OTP_PURPOSES } from './identity.schema';
import { OtpService } from './otp.service';

// Fastify isteğinden kullanılan kısım (fastify doğrudan bağımlılık değil).
interface HttpRequest {
  /** Fastify `request.ip`; proxy arkasındaki gerçek IP güveni (trustProxy) altyapı adımında. */
  readonly ip?: string;
}

const requestBodySchema = z.strictObject({
  phone: z.string().max(32),
  purpose: z.enum(OTP_PURPOSES),
});

@Controller('api/v1/auth/otp')
export class OtpController {
  constructor(@Inject(OtpService) private readonly otp: OtpService) {}

  /** openapi `POST /api/v1/auth/otp/request` (US-001): 202 {challengeId, expiresAt}. */
  @Public()
  @Post('request')
  @HttpCode(202)
  async request(
    @Body() body: unknown,
    @Req() req: HttpRequest,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<{ challengeId: string; expiresAt: string }> {
    const { phone, purpose } = requestBodySchema.parse(body);
    const result = await this.otp.requestOtp({
      phone,
      purpose,
      ...(req.ip === undefined ? {} : { ip: req.ip }),
      ...(acceptLanguage === undefined ? {} : { acceptLanguage }),
    });
    return { challengeId: result.challengeId, expiresAt: result.expiresAt.toISOString() };
  }
}
