import { Module } from '@nestjs/common';
import { OpsMetricsWriter } from './ops-metrics.writer';
import { ScheduledJobRunner } from './scheduled-job.runner';

/** `ops_metrics` yazıcı ve zamanlanmış iş çalıştırıcısı (worker). Redis global RedisModule'den. */
@Module({
  providers: [OpsMetricsWriter, ScheduledJobRunner],
  exports: [OpsMetricsWriter, ScheduledJobRunner],
})
export class OpsMetricsModule {}
