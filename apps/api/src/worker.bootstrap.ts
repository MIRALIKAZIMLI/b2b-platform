// worker açılışı (worker.main.ts): Nest bağlamı + outbox dağıtıcısı. Hata runMain'e iletilir.
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { WorkerEnv } from '@b2b/shared';
import { Logger } from 'nestjs-pino';
import { NEST_BOOTSTRAP_OPTIONS } from './core/bootstrap/run-main';
import { OutboxDispatcher } from './core/outbox';
import { WorkerModule } from './worker.module';

export async function bootstrapWorker(env: WorkerEnv): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(env),
    NEST_BOOTSTRAP_OPTIONS,
  );
  try {
    app.useLogger(app.get(Logger));
    app.flushLogs();
    app.get(OutboxDispatcher).start();
    return app;
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}
