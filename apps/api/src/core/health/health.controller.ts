import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
}

// /api/health sürümsüzdür (openapi.yaml). Veritabanı ve Redis kontrolü (503) F1.1a ve sonrasında eklenir.
@Controller('api')
export class HealthController {
  // TODO(F1.8): @Public() dekoratörü erişim adımında gelir; geldiğinde buraya eklenecek.
  @Get('health')
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
