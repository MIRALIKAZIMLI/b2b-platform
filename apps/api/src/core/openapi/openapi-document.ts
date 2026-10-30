// Uygulamanın kendi OpenAPI şemasını üretir (F1.12, sözleşme kontrolü).
// Nest "preview" kipinde açılır: sağlayıcılar örneklenmez, veritabanı / Redis / kuyruk bağlantısı
// kurulmaz, port dinlenmez. Yalnızca controller meta verisi (@nestjs/swagger) okunur.
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { ApiEnv } from '@b2b/shared';
import { AppModule } from '../../app.module';
import { createFastifyAdapter } from '../request-id.middleware';

/**
 * Şema üretimi için ortam. Bağlantı kurulmadığından adresler erişilmeyen yerel değerlerdir;
 * anahtarlar her çalıştırmada rastgele üretilir (depoda sabit sır yok). APP_ENV=test:
 * yalnızca local/test/staging'de açılan `/api/v1/dev/*` uçları da şemaya girer (openapi.yaml'da var).
 */
function contractEnv(): ApiEnv {
  return {
    APP_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://contract@127.0.0.1:1/contract',
    DB_POOL_MAX: 1,
    REDIS_URL: 'redis://127.0.0.1:1',
    SMS_PROVIDER: 'mock',
    OTP_HASH_KEY: randomBytes(32).toString('base64'),
    JWT_SIGNING_KEY: randomBytes(32).toString('base64'),
    JWT_KEY_ID: 'contract',
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };
}

export async function createOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(contractEnv()),
    createFastifyAdapter(),
    { preview: true, logger: false, abortOnError: false },
  );
  try {
    const config = new DocumentBuilder().setTitle('b2b-api').setVersion('1.0.0').build();
    return SwaggerModule.createDocument(app, config);
  } finally {
    await app.close();
  }
}
