import 'reflect-metadata';
import { PinoLogger } from 'nestjs-pino';
import { runMain } from './core/bootstrap/run-main';
import { loadServerEnv } from './core/config/load-env';
import { bootstrapWorker } from './worker.bootstrap';

// Geçersiz ortamla başlamaz: çıkış kodu 1, mesajda yalnızca değişken adı (loadServerEnv).
// Diğer açılış hataları güvenli loglanır, çıkış kodu 1 (runMain).
void runMain('worker', async () => {
  const app = await bootstrapWorker(loadServerEnv(process.env));
  const logger = await app.resolve(PinoLogger);
  logger.setContext('Worker');

  // SIGTERM/SIGINT: önce dağıtıcı durur (o anki tur biter), sonra kuyruklar ve Redis kapanır.
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ event: 'worker.stopping', signal }, 'worker kapanıyor');
    try {
      await app.close();
    } catch (error) {
      logger.error({ event: 'worker.stop_failed', err: error }, 'worker düzgün kapanamadı');
      process.exitCode = 1;
    }
  };
  process.once('SIGTERM', (signal) => void shutdown(signal));
  process.once('SIGINT', (signal) => void shutdown(signal));

  logger.info({ event: 'worker.started' }, 'worker başladı (outbox dağıtıcısı)');
});
