// openapi `/api/v1/files/upload-url`, `/api/v1/files/{id}/complete` (SF-09, F1.10).
// İzin `purpose`'a göre değiştiği için uç tek bir `@RequirePermission` taşıyamaz: `@Authenticated()`
// ile girilir, bağlam ve izin aynı TenantContextService ile burada kurulur (Mimar onayı F1.10 S1).
// X-Business-Id zorunlu (platform dosyası yüklemesi bu adımda yok, S2).
import { Body, Controller, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Authenticated } from '../../core/auth/access-decorators';
import { DomainError } from '../../core/errors/domain-error';
import { FILE_PURPOSES } from '../../core/ports/file-storage';
import { TenantContextService } from '../access';
import { CurrentSession, type SessionAuth } from '../identity';
import { type CompletedFile, FilesService, type UploadUrlResult } from './files.service';

const uploadUrlBodySchema = z.strictObject({
  purpose: z.enum(FILE_PURPOSES),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(2_147_483_647),
});

const idSchema = z.uuid();

@Controller('api/v1/files')
export class FilesController {
  constructor(
    @Inject(FilesService) private readonly service: FilesService,
    @Inject(TenantContextService) private readonly tenants: TenantContextService,
  ) {}

  @Post('upload-url')
  @Authenticated()
  @HttpCode(200)
  async uploadUrl(
    @CurrentSession() auth: SessionAuth,
    @Headers('x-business-id') businessId: unknown,
    @Body() body: unknown,
  ): Promise<UploadUrlResult> {
    const { tenant } = await this.tenants.resolve(auth.userId, businessId);
    return await this.service.createUploadUrl(tenant, uploadUrlBodySchema.parse(body));
  }

  @Post(':id/complete')
  @Authenticated()
  @HttpCode(200)
  async complete(
    @CurrentSession() auth: SessionAuth,
    @Headers('x-business-id') businessId: unknown,
    @Param('id') id: string,
  ): Promise<CompletedFile> {
    const { tenant } = await this.tenants.resolve(auth.userId, businessId);
    const fileId = idSchema.safeParse(id);
    if (!fileId.success) throw new DomainError('NOT_FOUND');
    return await this.service.complete(tenant, fileId.data);
  }
}
