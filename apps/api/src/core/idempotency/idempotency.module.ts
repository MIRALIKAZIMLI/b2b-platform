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
})
export class IdempotencyModule {}
