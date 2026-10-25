import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Audit yazıcı (F1.9). Veritabanı işlemi çağırandan gelir; Clock global CoreModule'den. */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
