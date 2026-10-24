import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadServerEnv } from './core/config/load-env';
import { createFastifyAdapter } from './core/request-id.middleware';

async function bootstrap(): Promise<void> {
  // Geçersiz ortamla başlamaz: çıkış kodu 1, mesajda yalnızca değişken adı.
  const env = loadServerEnv(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(env),
    createFastifyAdapter(),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

void bootstrap();
