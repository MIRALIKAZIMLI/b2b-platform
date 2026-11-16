import { Controller, Get, Inject } from '@nestjs/common';
import { Authenticated } from '../../core/auth/access-decorators';
import { withSystemTx } from '../../core/db';
import { type UnitCatalogView, UnitsService } from './units.service';

/** Birim kataloğu (openapi `GET /api/v1/catalog/units`; F3.1, US-028 AC1). */
@Controller('api/v1/catalog')
export class UnitsController {
  constructor(@Inject(UnitsService) private readonly units: UnitsService) {}

  /** Giriş yeterli (K4); G tablosu, yalnız aktif birimler ve iki ucu aktif dönüşümler. */
  @Authenticated()
  @Get('units')
  async list(): Promise<UnitCatalogView> {
    return await withSystemTx((tx) => this.units.catalogTx(tx, true));
  }
}
