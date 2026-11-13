// `ops_metrics` yazıcı (F2.16). Satır çağıranın işleminde yazılır; app_user'ın yalnız INSERT
// yetkisi var (RETURNING kullanılmaz). Etikette kişisel veri olmaz (yalnız kod ve sayı).
import { Injectable } from '@nestjs/common';
import type { Tx } from '../db';
import { opsMetrics } from './ops-metrics.schema';

export interface OpsMetricInput {
  /** ör. `job.connections.expire_requests` */
  readonly key: string;
  readonly value: number;
  readonly measuredAt: Date;
  readonly labels?: Readonly<Record<string, string | number>>;
}

@Injectable()
export class OpsMetricsWriter {
  async recordTx(tx: Tx, metric: OpsMetricInput): Promise<void> {
    await tx.insert(opsMetrics).values({
      key: metric.key,
      value: String(metric.value),
      measuredAt: metric.measuredAt,
      labels: metric.labels ?? null,
    });
  }
}
