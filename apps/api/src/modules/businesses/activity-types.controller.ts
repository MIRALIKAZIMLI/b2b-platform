import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../../core/auth/access-decorators';
import { withSystemTx } from '../../core/db';
import { type ActivityTypeItem, BusinessesRepository } from './businesses.repository';

/** Faaliyet türleri (openapi `GET /api/v1/catalog/activity-types`; F2.3a, kayıt formu listesi). */
@Controller('api/v1/catalog')
export class ActivityTypesController {
  constructor(@Inject(BusinessesRepository) private readonly businesses: BusinessesRepository) {}

  /** Kimliksiz; G tablosu (herkes okur), yalnızca aktif türler. */
  @Public()
  @Get('activity-types')
  async list(): Promise<ActivityTypeItem[]> {
    return await withSystemTx((tx) => this.businesses.listActiveActivityTypesTx(tx));
  }
}
