import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { voenSchema } from '@b2b/shared';
import { z } from 'zod';
import { Public } from '../../core/auth/access-decorators';
import {
  SellerApplicationsService,
  type SubmittedSellerApplication,
} from './seller-applications.service';

// Fastify isteğinden kullanılan kısım (fastify doğrudan bağımlılık değil).
interface HttpRequest {
  /** Fastify `request.ip`; proxy arkasındaki gerçek IP güveni (trustProxy) altyapı adımında. */
  readonly ip?: string;
}

/** openapi `POST /api/v1/seller-applications` gövdesi. */
const submitBodySchema = z.strictObject({
  legalName: z.string().trim().min(1).max(200),
  voen: voenSchema,
  contactName: z.string().trim().min(1).max(120),
  phone: z.string().max(20),
  regionId: z.uuid(),
  categoryNote: z.string().trim().max(500).optional(),
});

/** Kimliksiz toptancı başvuru formu (F2.2, US-008). Hız sınırı IP başına, serviste. */
@Controller('api/v1/seller-applications')
export class SellerApplicationsController {
  constructor(
    @Inject(SellerApplicationsService) private readonly applications: SellerApplicationsService,
  ) {}

  @Public()
  @Post()
  @HttpCode(201)
  async submit(
    @Body() body: unknown,
    @Req() req: HttpRequest,
  ): Promise<SubmittedSellerApplication> {
    const input = submitBodySchema.parse(body);
    const note = input.categoryNote === '' ? undefined : input.categoryNote;
    return await this.applications.submit({ ...input, categoryNote: note, ip: req.ip });
  }
}
