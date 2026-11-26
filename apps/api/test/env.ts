// Birim testleri için sahte api ortamı. Bu adreslere hiçbir zaman bağlanılmaz.
// OTP_HASH_KEY yalnızca test değeridir; gerçek ortamda her ortamın kendi rastgele anahtarı vardır.
import { randomBytes } from 'node:crypto';
import { type ApiEnv, parseApiEnv, parseWorkerEnv, type WorkerEnv } from '@b2b/shared';

export const TEST_SERVER_ENV: ApiEnv = parseApiEnv({
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://app_user:unused@127.0.0.1:1/unused',
  REDIS_URL: 'redis://127.0.0.1:1',
  LOG_LEVEL: 'silent',
  SMS_PROVIDER: 'mock',
  OTP_HASH_KEY: 'test-only-otp-hash-key-0123456789abcdef',
  JWT_SIGNING_KEY: 'test-only-jwt-signing-key-0123456789abcdef',
  JWT_KEY_ID: 'test-k1',
  // Her çalıştırmada rastgele (depoda anahtar gibi görünen değer yok).
  TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  STORAGE_PROVIDER: 'local',
});

/** Worker birim testleri için sahte ortam (F1.11: push sağlayıcısı mock). */
export const TEST_WORKER_ENV: WorkerEnv = parseWorkerEnv({
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://app_user:unused@127.0.0.1:1/unused',
  REDIS_URL: 'redis://127.0.0.1:1',
  LOG_LEVEL: 'silent',
  PUSH_PROVIDER: 'mock',
  STORAGE_PROVIDER: 'local',
});
