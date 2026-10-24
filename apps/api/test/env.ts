// Birim testleri için sahte sunucu ortamı. Bu adreslere hiçbir zaman bağlanılmaz.
import { parseServerEnv, type ServerEnv } from '@b2b/shared';

export const TEST_SERVER_ENV: ServerEnv = parseServerEnv({
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://app_user:unused@127.0.0.1:1/unused',
  REDIS_URL: 'redis://127.0.0.1:1',
  LOG_LEVEL: 'silent',
});
