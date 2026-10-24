// Süreç giriş noktası sarmalayıcısı (F1.2b K8). Açılışta oluşan hata:
// - güvenli hata serileştiricisinden geçirilerek (mesaj ve sorgu parametresi yazılmaz) loglanır,
// - log senkron hedefe yazılır (çıkıştan önce kaybolmaz),
// - süreç 1 koduyla kapanır.
// Nest'in kendi açılış hatası çıktısı (ham mesaj + stack) da kapatılır: NEST_BOOTSTRAP_OPTIONS.
import type { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { APP_ENVS } from '@b2b/shared';
import pino, { type DestinationStream } from 'pino';
import { buildPinoOptions, type ServiceName } from '../logging/logger.module';

/**
 * NestFactory seçenekleri:
 * - bufferLogs + autoFlushLogs: false → açılış logları pino'ya geçilene kadar bekletilir; açılış
 *   başarısız olursa Nest'in varsayılan konsol logger'ı ham hatayı basmaz. Başarılı açılışta
 *   `app.useLogger(...)` sonrası `app.flushLogs()` çağrılır.
 * - abortOnError: false → Nest hatayı yakalayıp `process.abort()` yapmaz; hata runMain'e gelir.
 */
export const NEST_BOOTSTRAP_OPTIONS = {
  bufferLogs: true,
  autoFlushLogs: false,
  abortOnError: false,
} as const satisfies NestApplicationContextOptions;

export interface MainIo {
  readonly destination: DestinationStream;
  exit(code: number): void;
}

function processIo(): MainIo {
  return {
    destination: pino.destination({ fd: 1, sync: true }),
    exit: (code) => process.exit(code),
  };
}

/** Ortam doğrulanamamış olabilir: yalnızca bilinen APP_ENV değeri yazılır. */
function safeAppEnv(): string {
  const value = process.env.APP_ENV;
  return APP_ENVS.find((env) => env === value) ?? 'unknown';
}

export async function runMain(
  service: ServiceName,
  bootstrap: () => Promise<void>,
  io: MainIo = processIo(),
): Promise<void> {
  try {
    await bootstrap();
  } catch (error) {
    const options = buildPinoOptions({ service, env: { APP_ENV: 'local', LOG_LEVEL: 'info' } });
    const logger = pino({ ...options, base: { service, env: safeAppEnv() } }, io.destination);
    logger.fatal({ event: 'bootstrap.failed', err: error }, 'açılış başarısız');
    logger.flush();
    io.exit(1);
  }
}
