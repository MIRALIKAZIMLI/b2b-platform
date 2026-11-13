// Zamanlanmış işlerin ortak çalıştırıcısı (F2.16; F2.16b dosya artığı temizliği de kullanır):
// aynı anda tek kopya (Redis kilidi, ADR-0011 §4) ve başarılı çalışmanın `ops_metrics` kaydı
// (`job.<ad>`, değer = işlenen kayıt sayısı; observability §3 "son başarılı çalışma").
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT, type RedisLockClient, withRedisLock } from '../../infrastructure/redis';
import { Clock } from '../clock';
import { withSystemTx } from '../db';
import { OpsMetricsWriter } from './ops-metrics.writer';

export type ScheduledJobOutcome =
  { readonly status: 'done'; readonly processed: number } | { readonly status: 'locked' };

/** İş adı: küçük harf, rakam, `_` ve `.` (kilit ve metrik anahtarında kullanılır). */
const JOB_NAME = /^[a-z][a-z0-9_.]{0,62}$/;

export function scheduledJobLockKey(name: string): string {
  return `lock:job:${name}`;
}

export function scheduledJobMetricKey(name: string): string {
  return `job.${name}`;
}

@Injectable()
export class ScheduledJobRunner {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisLockClient,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OpsMetricsWriter) private readonly metrics: Pick<OpsMetricsWriter, 'recordTx'>,
  ) {}

  /**
   * Kilidi alırsa `fn`'i çalıştırır (işlenen kayıt sayısını döner) ve son çalışmayı yazar; başka
   * kopya çalışıyorsa hiçbir şey yapmaz (`locked`). `fn` hata verirse kayıt yazılmaz, hata
   * BullMQ'ya iletilir.
   */
  async run(
    name: string,
    lockSeconds: number,
    fn: () => Promise<number>,
  ): Promise<ScheduledJobOutcome> {
    if (!JOB_NAME.test(name)) throw new Error('geçersiz iş adı');
    const result = await withRedisLock(this.redis, scheduledJobLockKey(name), lockSeconds, fn);
    if (!result.acquired) return { status: 'locked' };
    await withSystemTx((tx) =>
      this.metrics.recordTx(tx, {
        key: scheduledJobMetricKey(name),
        value: result.value,
        measuredAt: this.clock.now(),
      }),
    );
    return { status: 'done', processed: result.value };
  }
}
