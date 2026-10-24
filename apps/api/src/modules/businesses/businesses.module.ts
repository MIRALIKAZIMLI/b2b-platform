import { Module } from '@nestjs/common';
import { BusinessesRepository } from './businesses.repository';

/** İşletme çekirdek tabloları (F1.7). Bu adımda HTTP uç noktası yok. */
@Module({
  providers: [BusinessesRepository],
  exports: [BusinessesRepository],
})
export class BusinessesModule {}
