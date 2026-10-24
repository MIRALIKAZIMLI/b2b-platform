import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

// setInterval için izin verilen en büyük gecikme (Node.js sınırı).
const MAX_TIMER_DELAY_MS = 2_147_483_647;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const logger = new Logger('Worker');

  // Henüz iş kuyruğu yok (BullMQ sonraki adımlarda gelir). O zamana kadar süreç
  // bu zamanlayıcıyla açık tutulur ve SIGTERM/SIGINT ile düzgün kapanır.
  const keepAlive = setInterval(() => undefined, MAX_TIMER_DELAY_MS);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.log(`${signal} alındı, worker kapanıyor`);
    clearInterval(keepAlive);
    await app.close();
  };
  process.once('SIGTERM', (signal) => void shutdown(signal));
  process.once('SIGINT', (signal) => void shutdown(signal));

  logger.log('Worker başladı (HTTP yok, iş tanımı yok)');
}

void bootstrap();
