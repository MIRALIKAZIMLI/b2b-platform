import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/access-decorators';

export interface HealthResponse {
  status: 'ok';
}

// /api/health sürümsüzdür (openapi.yaml). Veritabanı ve Redis kontrolü (503) F1.1a ve sonrasında eklenir.
@Controller('api')
export class HealthController {
  @Public()
  @Get('health')
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
