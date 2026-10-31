import { Controller, Get, HttpCode, Inject, Query } from '@nestjs/common';
import { isAppVersion } from '@b2b/shared';
import { z } from 'zod';
import { Public } from '../../core/auth/access-decorators';
import { type AppConfig, AppConfigService } from './app-config.service';

const querySchema = z.object({
  platform: z.enum(['ios', 'android']),
  version: z.string().refine(isAppVersion),
});

/** Sürümsüz uç (openapi `/api/app-config`): eski uygulama da `/api/v1` değişse okuyabilmeli. */
@Controller('api')
export class AppConfigController {
  constructor(@Inject(AppConfigService) private readonly service: AppConfigService) {}

  @Public()
  @Get('app-config')
  @HttpCode(200)
  async get(@Query() query: unknown): Promise<AppConfig> {
    const { platform, version } = querySchema.parse(query);
    return await this.service.get(platform, version);
  }
}
