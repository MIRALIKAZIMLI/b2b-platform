import { Controller, Get, Headers, Inject, Param, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../core/auth/access-decorators';
import { matchesIfNoneMatch } from './i18n-snapshot';
import type { Region } from './i18n.ports';
import { I18nService } from './i18n.service';

// Fastify yanıt nesnesinden kullanılan kısım (fastify doğrudan bağımlılık değil).
interface HttpReply {
  status(statusCode: number): HttpReply;
  header(name: string, value: string): HttpReply;
}

const regionsQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default('AZ'),
});

@Controller('api/v1')
export class I18nController {
  constructor(@Inject(I18nService) private readonly i18n: I18nService) {}

  /**
   * Arayüz çevirileri (US-058). `Cache-Control: no-cache`: istemci her kullanımda ETag ile
   * doğrular; değişiklik yoksa 304 ve boş gövde (F1.3-AC9).
   */
  @Public()
  @Get('i18n/:lang')
  async translations(
    @Param('lang') lang: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) reply: HttpReply,
  ): Promise<Readonly<Record<string, string>> | undefined> {
    const dictionary = await this.i18n.getDictionary(lang);
    reply.header('ETag', dictionary.etag).header('Cache-Control', 'no-cache');
    if (matchesIfNoneMatch(ifNoneMatch, dictionary.etag)) {
      reply.status(304);
      return undefined;
    }
    return dictionary.values;
  }

  /** Şehir / rayon listesi (openapi `Region`). */
  @Public()
  @Get('catalog/regions')
  async regions(@Query() query: unknown): Promise<Region[]> {
    const { country } = regionsQuerySchema.parse(query);
    return await this.i18n.listRegions(country);
  }
}
