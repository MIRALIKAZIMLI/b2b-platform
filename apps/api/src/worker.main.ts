import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, PinoLogger } from 'nestjs-pino';
import { loadServerEnv } from './core/config/load-env';
import { WorkerModule } from './worker.module';

// setInterval için izin verilen en büyük gecikme (Node.js sınırı).
const MAX_TIMER_DELAY_MS = 2_147_483_647;

async function bootstrap(): Promise<void> {
  // Geçersiz ortamla başlamaz: çıkış kodu 1, mesajda yalnızca değişken adı.
  const env = loadServerEnv(process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule.register(env), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const logger = await app.resolve(PinoLogger);
  logger.setContext('Worker');

  // Henüz iş kuyruğu yok (BullMQ F1.2b'de gelir). O zamana kadar süreç
  // bu zamanlayıcıyla açık tutulur ve SIGTERM/SIGINT ile düzgün kapanır.
  const keepAlive = setInterval(() => undefined, MAX_TIMER_DELAY_MS);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ event: 'worker.stopping', signal }, 'worker kapanıyor');
    clearInterval(keepAlive);
    await app.close();
  };
  process.once('SIGTERM', (signal) => void shutdown(signal));
  process.once('SIGINT', (signal) => void shutdown(signal));

  logger.info({ event: 'worker.started' }, 'worker başladı (iş tanımı yok)');
}

void bootstrap();
