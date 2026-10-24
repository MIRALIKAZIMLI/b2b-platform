// api açılışı (main.ts). Hata runMain'e iletilir (F1.2b K8).
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ServerEnv } from '@b2b/shared';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { NEST_BOOTSTRAP_OPTIONS } from './core/bootstrap/run-main';
import { createFastifyAdapter } from './core/request-id.middleware';

export async function bootstrapApi(env: ServerEnv): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(env),
    createFastifyAdapter(),
    NEST_BOOTSTRAP_OPTIONS,
  );
  try {
    app.useLogger(app.get(Logger));
    app.flushLogs();
    app.enableShutdownHooks();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    return app;
  } catch (error) {
    // Yarım açılmış uygulama kapatılır (bağlantılar); asıl hata çağırana gider.
    await app.close().catch(() => undefined);
    throw error;
  }
}
