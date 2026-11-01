import { Body, Controller, Headers, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { LANGUAGE_CODES } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { Public } from '../../core/auth/access-decorators';
import { DomainError } from '../../core/errors/domain-error';
import {
  type CookieReply,
  DEVICE_TYPES,
  deliverRefreshToken,
  isWebClient,
  SessionService,
} from '../identity';
import {
  type BuyerRegistrationResponse,
  BuyerRegistrationService,
} from './buyer-registration.service';

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

// openapi.yaml → components.parameters.IdempotencyKey (16–64 karakter).
const idempotencyKeySchema = z.string().min(16).max(64).optional();

/** openapi `POST /api/v1/buyers/register` gövdesi (US-005 AC1, AC3). */
const registerBodySchema = z.strictObject({
  fullName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().min(1).max(200),
  activityTypeId: z.uuid(),
  regionId: z.uuid(),
  consentVersion: z.string().trim().min(1).max(20),
  preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
  device: z
    .strictObject({
      type: z.enum(DEVICE_TYPES).optional(),
      name: z.string().max(120).optional(),
      appVersion: z.string().max(40).optional(),
    })
    .optional(),
});

// Fastify istek/yanıt nesnelerinden kullanılan kısım (fastify doğrudan bağımlılık değil).
interface HttpRequest extends AuditHttpRequest {
  readonly url: string;
}

interface HttpReply extends CookieReply {
  status(statusCode: number): unknown;
}

/**
 * Kimliksiz perakendeci kaydı (F2.3a, SF-02). Yetki: `Authorization: Bearer <pendingToken>`
 * (otp/verify `nextStep = register`); guard JWT'ye bakmaz, servis kayıt anahtarını doğrular.
 * Hız sınırı IP başına, serviste. `X-Client: web` → yenileme anahtarı cookie'de.
 */
@Controller('api/v1/buyers')
export class BuyerRegistrationController {
  constructor(
    @Inject(BuyerRegistrationService) private readonly registration: BuyerRegistrationService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-client') client: string | undefined,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) reply: HttpReply,
  ): Promise<BuyerRegistrationResponse | Omit<BuyerRegistrationResponse, 'refreshToken'>> {
    const token = authorization === undefined ? undefined : BEARER.exec(authorization)?.[1];
    if (token === undefined) throw new DomainError('UNAUTHENTICATED');
    const key = idempotencyKeySchema.parse(idempotencyKey);
    const { device, ...input } = registerBodySchema.parse(body);
    const result = await this.registration.register({
      pendingToken: token,
      idempotencyKey: key,
      body: input,
      rawBody: body,
      url: req.url,
      ip: req.ip,
      ...(device === undefined
        ? {}
        : {
            device: {
              ...(device.type === undefined ? {} : { type: device.type }),
              ...(device.name === undefined ? {} : { name: device.name }),
            },
          }),
      context: requestAuditContext(req),
    });
    reply.status(result.statusCode);
    return deliverRefreshToken(
      result.body,
      isWebClient(client),
      reply,
      await this.sessions.refreshTokenMaxAgeSeconds(),
    );
  }
}
