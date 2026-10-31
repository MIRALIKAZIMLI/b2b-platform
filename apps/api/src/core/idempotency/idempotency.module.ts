import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SettingsModule } from '../../modules/settings';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyRepository } from './idempotency.repository';

/** İdempotens (F1.2b): bütün POST uçlarında global interceptor. */
@Module({
  imports: [SettingsModule],
  providers: [
    IdempotencyRepository,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  // F2.3a: kimliksiz kayıt telefon kapsamlı arama ve işlem içi yanıt kaydı için kullanır.
  exports: [IdempotencyRepository],
})
export class IdempotencyModule {}
